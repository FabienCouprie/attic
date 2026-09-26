// src/audio/build-plugins.ts — Plugins Vite spécifiques au domaine audio.
// Ces plugins n'ont pas de sens pour un autre domaine ; ils sont isolés ici pour
// garder vite.config.ts agnostique du domaine.

import fs from "fs";
import path from "path";

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

export const audioBuildPlugins: any[] = [
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
];

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
  exclude: ["_audio_backup", "piper-tts-web", "kokoro-js", "ephone", "@csound/browser"],
  include: [
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-core",
    "seedrandom",
    "ndarray",
    "ndarray-resample",
    "midi-file",
    "protobufjs",
    "long",
    "tesseract.js",
  ],
};
