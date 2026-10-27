// src/audio/build-plugins.ts — Plugins Vite spécifiques au domaine audio.
// Ces plugins n'ont pas de sens pour un autre domaine ; ils sont isolés ici pour
// garder vite.config.ts agnostique du domaine.

import fs from "fs";
import path from "path";
import { FICHIER_TRAVAILLEUR_VOSK, separerTravailleurVosk } from "./vosk-travailleur.ts";

// Alias de résolution spécifique au domaine audio.
export const audioResolveAliases: any[] = [
  // Le package.json de @magenta/music a un champ "exports" pointant vers
  // ./index.js (inexistant). On force l'entrée ESM valide, mais seulement
  // pour l'import exact — pas pour les sous-chemins esm/... utilisés dans le worker.
  { find: /^@magenta\/music$/, replacement: path.resolve(process.cwd(), 'node_modules/@magenta/music/esm/index.js') },
  // kokoro-js livre une build web (fetch des voix depuis HuggingFace) et une
  // build Node (lecture locale des .bin). Dans le worker navigateur/Electron,
  // on veut la build web pour éviter les imports fs/promises et path.
  { find: /^kokoro-js$/, replacement: path.resolve(process.cwd(), 'node_modules/kokoro-js/dist/kokoro.web.js') },
  // @csound/browser ne déclare NI « main » NI « exports », seulement « module ». Vite le
  // résout au navigateur, mais pas sous vitest, où quatre suites ont soudain échoué sur
  // « Failed to resolve import "@csound/browser" ». On pointe donc l'entrée réelle, comme
  // pour @magenta/music juste au-dessus.
  { find: /^@csound\/browser$/, replacement: path.resolve(process.cwd(), 'node_modules/@csound/browser/dist/csound.js') },
  // `ndarray` ET `ndarray-resample` NE SONT PAS CONSTRUITS : ils fabriquent du code par
  // `new Function` dès l'import, ce qui exigeait `unsafe-eval` dans la CSP du document, et Magenta
  // ne les appelle que sous Safari. Voir `src/audio/ndarray-inerte.ts`.
  { find: /^ndarray$/, replacement: path.resolve(process.cwd(), 'src/audio/ndarray-inerte.ts') },
  { find: /^ndarray-resample$/, replacement: path.resolve(process.cwd(), 'src/audio/ndarray-inerte.ts') },
];

/**
 * Les dossiers de `dist/` que le paquetage jette, déduits de `build.files`.
 *
 * POURQUOI LA LISTE SE DÉDUIT AU LIEU DE S'ÉCRIRE. Vite recopie tout `public/` dans `dist/`, puis
 * electron-builder écarte une partie de `dist/` de l'archive au moyen de motifs `!dist/x/**` : ces
 * ressources sont livrées par `extraResources`, depuis `public/`, et n'ont donc rien à faire dans
 * `dist/`. Deux listes tenues à la main auraient divergé au premier ajout ; celle-ci se lit dans
 * `package.json`, qui est déjà l'autorité.
 *
 * CE QUE CELA A COÛTÉ, MESURÉ. Le plugin qui précédait ne supprimait que les fichiers `.onnx`
 * posés À LA RACINE de `dist/oonx`, alors que les modèles vivent dans des sous-dossiers : il
 * annonçait épargner 450 Mo et n'en épargnait presque aucun. Relevé sur cet arbre de travail,
 * `dist/` pesait 1699 Mo, dont 1335 pour `oonx`, 142 pour `sf2` et 1 pour `sfz` — soit près d'un
 * gigaoctet et demi recopié à chaque construction pour être aussitôt écarté du paquet.
 */
export function dossiersJetesParLePaquetage(motifs: readonly string[]): string[] {
  const dossiers: string[] = [];
  for (const motif of motifs) {
    const m = /^!(dist\/[^/*!]+)\/\*\*(\/\*)?$/.exec(motif);
    if (m) dossiers.push(m[1]);
  }
  return dossiers;
}

/** Ce que `package.json` déclare aujourd'hui, ou rien si le champ manque. */
function motifsDuPaquetage(): string[] {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf-8"));
    return Array.isArray(pkg?.build?.files) ? pkg.build.files : [];
  } catch {
    return [];
  }
}

/**
 * `resonance-audio` FABRIQUAIT UNE FONCTION VIDE PAR LE CONSTRUCTEUR `Function`.
 *
 * Relevé le 2026-10-27 en passant tout le catalogue sous la politique stricte du document, qui n'a
 * plus `unsafe-eval` : `this._rejectHandler = new Function();` lève `EvalError` — une politique
 * stricte refuse le constructeur même sans corps —, et le chargeur des réponses impulsionnelles de
 * la bibliothèque tombait avec lui. `function () {}` en est l'exact équivalent. Une seule
 * occurrence dans `resonance-audio@1.0.0` ; si elle disparaît, la substitution LÈVE, pour qu'on
 * relise la bibliothèque au lieu de la croire réparée.
 */
export function sansConstructeurFunction(code: string): string {
  const avant = "this._rejectHandler = new Function();";
  if (!code.includes(avant)) {
    throw new Error("resonance-audio : la ligne `this._rejectHandler = new Function();` a disparu — relire la bibliothèque");
  }
  return code.split(avant).join("this._rejectHandler = function () {};");
}

/** Le motif du fichier de `resonance-audio`, tel que le résolvent la construction et l'optimiseur. */
const FICHIER_RESONANCE = /resonance-audio[\\/]build[\\/]resonance-audio\.js$/;

/** La même substitution, sous la forme d'un plugin : pour la construction et pour l'optimiseur. */
function pluginResonanceSansEval(): any {
  return {
    name: "attic-resonance-sans-eval",
    transform(code: string, id: string) {
      if (!FICHIER_RESONANCE.test(id.split("?")[0])) return null;
      return { code: sansConstructeurFunction(code), map: null };
    },
  };
}

export const audioBuildPlugins: any[] = [
  pluginResonanceSansEval(),
  {
    name: "attic-sans-les-ressources-que-le-paquet-jette",
    apply: "build",
    writeBundle() {
      // LA SUPPRESSION EST SÛRE PARCE QUE RIEN NE LIT CES DOSSIERS DANS `dist/`. Sous Electron, la
      // banque et les modèles sont lus par le processus principal dans `resources/`, et en
      // développement dans `public/` ; `dist/` n'est qu'un intermédiaire de paquetage, et aucun
      // déploiement web ne le sert.
      for (const dossier of dossiersJetesParLePaquetage(motifsDuPaquetage())) {
        const complet = path.resolve(dossier);
        if (fs.existsSync(complet)) fs.rmSync(complet, { recursive: true, force: true });
      }
    },
  },
  pluginTravailleurVosk(),
];

/**
 * LE WORKER DE VOSK SORT DE SON BLOB, pour recevoir sa propre politique de sécurité au lieu
 * d'hériter celle du document, qui n'a plus `unsafe-eval`. Voir `src/audio/vosk-travailleur.ts`.
 *
 * La transformation vaut en développement comme au build : `vosk-browser` est exclu du
 * pré-assemblage (voir plus bas), donc il traverse les plugins. Le fichier du worker est ÉMIS au
 * build, et SERVI par le serveur en développement.
 */
function pluginTravailleurVosk(): any {
  let commande = "serve";
  return {
    name: "attic-travailleur-vosk-separe",
    enforce: "pre",
    configResolved(config: any) { commande = config.command; },
    transform(this: any, code: string, id: string) {
      if (!/vosk-browser[\\/]dist[\\/]vosk\.js$/.test(id.split("?")[0])) return null;
      const separe = separerTravailleurVosk(code);
      // UNE FORME INATTENDUE ARRÊTE LA CONSTRUCTION : la laisser passer rendrait un Vosk dont le
      // worker hérite la politique stricte du document, donc qui ne démarre pas — en silence.
      if (!separe) this.error("vosk-browser ne fabrique plus son worker comme attendu : voir src/audio/vosk-travailleur.ts");
      if (commande === "build") {
        this.emitFile({ type: "asset", fileName: FICHIER_TRAVAILLEUR_VOSK, source: Buffer.from(separe!.travailleur, "utf8") });
      }
      return { code: separe!.code, map: null };
    },
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if ((req.url ?? "").split("?")[0] !== `/${FICHIER_TRAVAILLEUR_VOSK}`) return next();
        const source = fs.readFileSync(path.resolve(process.cwd(), "node_modules/vosk-browser/dist/vosk.js"), "utf8");
        const separe = separerTravailleurVosk(source);
        if (!separe) { res.statusCode = 500; res.end("vosk-browser : forme du worker inattendue"); return; }
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.end(separe.travailleur);
      });
    },
  };
}

export const audioOptimizeDeps: any = {
  // _audio_backup ne doit pas être optimisé.
  // Les dépendances CJS ci-dessous sont utilisées par @magenta/music dans le
  // thread principal (notamment par le nœud DDSP) et dans le worker ; on les
  // pré-bundl pour éviter des erreurs de module CJS dans le worker/dev.
  // kokoro-js doit être exclus de l'optimisation dev, car on le résout via un alias
  // vers sa build web (dist/kokoro.web.js) afin d'éviter les imports fs/promises
  // de la build Node. ephone est aussi exclu car il contient des imports dynamiques
  // de packs de langues et du WASM inline qu'on ne veut pas pré-bundler.
  // @csound/browser est exclu lui aussi, et l'essai a été net : pré-bundlé par
  // l'optimiseur de dépendances, il empêche l'application de démarrer — la barre d'outils
  // n'apparaît jamais. Le fichier fait deux mégaoctets et demi avec son WebAssembly encodé
  // en base64 à l'intérieur, et l'optimiseur ne s'en sort pas. Exclu, tout charge.
  // vosk-browser est le même cas, et le symptôme est plus sournois : c'est un paquet UMD de
  // 5,8 Mo qui porte son WebAssembly à l'intérieur et qui s'expose en POSANT `globalThis.Vosk`.
  // Pré-bundlé, il ne pose plus rien ET n'exporte rien — l'import réussit, le module est vide, et
  // le nœud échoue sur « n'a pas posé son global ». Mesuré : servi tel quel, le global revient.
  // @huggingface/transformers EST LA DÉCLARATION LA PLUS FAIBLE DES SEPT, et c'est dit comme tel.
  // Les six autres exclusions reposent sur un essai ; celle-ci repose sur le fait qu'EXCLURE NE
  // CHANGE RIEN : le paquet n'est pré-assemblé par personne aujourd'hui, puisque l'optimiseur ne
  // balaye que l'entrée principale et que ce paquet n'est importé que par trois workers —
  // `asr-worker`, `image-to-text-worker`, `opus-worker`. L'inscrire ici consigne le choix sans
  // toucher au comportement. Il est hors du chemin du défaut mesuré, les composants surveillés par
  // la base d'empreintes ne chargeant aucun de ces workers.
  //
  // CE QU'IL FAUDRAIT MESURER POUR LE FAIRE PASSER DANS `include` : que l'application démarre encore
  // — c'est par là que `@csound/browser` est tombé —, et que la reconnaissance de parole tourne
  // toujours, ce qui demande son modèle. Tant que ce n'est pas fait, il reste ici.
  exclude: ["_audio_backup", "piper-tts-web", "kokoro-js", "ephone", "@csound/browser", "vosk-browser", "@huggingface/transformers"],
  // ET LA LISTE PORTE TOUT CE QUE L'OPTIMISEUR TROUVE, NON SEULEMENT LES CAS CJS.
  //
  // Elle en déclarait NEUF sur les QUARANTE qu'il pré-assemble. Les trente et une autres, il les
  // découvrait EN SERVANT le graphe de modules, et une découverte en route lui fait FORCER UN
  // RECHARGEMENT COMPLET de la page : `[vite] (client) Forced re-optimization of dependencies`.
  //
  // CE QUE CELA CASSAIT, mesuré le 2026-10-24. La passe des empreintes ouvre la page puis importe
  // `/src/plugins/index.ts`, le plus gros graphe du dépôt, dans un `page.evaluate`. Quand le
  // rechargement tombe pendant cet appel, Playwright rend « Execution context was destroyed, most
  // likely because of a navigation » ; quand il tombe entre deux mesures, un composant ressort sans
  // son. Sur onze passes à serveur froid : quatre vertes au repos, DEUX ROUGES SUR QUATRE après une
  // compilation — la machine occupée fait arriver le rechargement plus tard, donc en pleine mesure —
  // et trois vertes sur trois une fois les dépendances pré-assemblées d'avance.
  //
  // LA LISTE EST CELLE QUE L'OPTIMISEUR A LUI-MÊME ÉNUMÉRÉE, non une liste devinée : elle contient
  // les neuf d'origine. Les sous-chemins y figurent tels qu'ils sont importés — `react/jsx-runtime`,
  // `@magenta/music/esm/protobuf`, `lamejs/src/js/Lame.js` —, l'optimiseur travaillant par
  // spécificateur et non par paquet. `src/docs/contrat-dependances-prebundlees.test.ts` refuse qu'un
  // paquet importé par les sources ne soit ni déclaré ici ni exclu ci-dessus.
  // `resonance-audio` EST PRÉ-ASSEMBLÉ, et l'optimiseur n'applique pas les plugins de la
  // construction : la même substitution lui est donc donnée ici. Voir `sansConstructeurFunction`.
  rolldownOptions: { plugins: [pluginResonanceSansEval()] },
  include: [
    "@firecrawl/pdf-inspector-wasm",
    "@magenta/music",
    "@magenta/music/esm/core/sequences",
    "@magenta/music/esm/music_rnn/model",
    "@magenta/music/esm/music_vae/model",
    "@magenta/music/esm/piano_genie/model",
    "@magenta/music/esm/protobuf",
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-core",
    "@xyflow/react",
    "lamejs",
    "lamejs/src/js/BitStream.js",
    "lamejs/src/js/Lame.js",
    "lamejs/src/js/MPEGMode.js",
    "libpd-wasm",
    "long",
    "mathjs",
    "mediabunny",
    "meyda",
    "midi-file",
    // `ndarray` et `ndarray-resample` n'y sont plus : ils sont remplacés par
    // `src/audio/ndarray-inerte.ts`, qui n'est pas un paquet à pré-assembler.
    "onnxruntime-web",
    "protobufjs",
    "react",
    "react-dom",
    "react-dom/client",
    "react/jsx-dev-runtime",
    "react/jsx-runtime",
    "resonance-audio",
    "seedrandom",
    "soundtouchjs",
    "tesseract.js",
    "time-stretch",
    "tonal",
    "tone",
    "verovio/esm",
    "verovio/wasm",
    "vexflow",
    "wavesurfer.js",
  ],
};
