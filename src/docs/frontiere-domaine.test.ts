// src/docs/frontiere-domaine.test.ts — La frontière entre le cœur, le shell et le domaine.
//
// POURQUOI CE TEST, ET C'EST LA PIÈCE QUI MANQUAIT LE PLUS À L'ARCHITECTURE.
//
// Attic est un framework nodal agnostique du domaine, et le changement de domaine est un but du
// projet, non un espoir : `PORTING-A-DOMAIN.md` décrit comment brancher un domaine d'images, de
// données ou de texte sur le même cœur.
//
// CE DOCUMENT S'EST TROUVÉ FAUX D'UN FACTEUR DEUX À DIX. Il annonçait « le registre importé en dur
// (5 fichiers) » là où ils étaient treize, et affirmait de `Palette.tsx` qu'il n'importait qu'un
// TYPE alors qu'il importait le registre. Il n'avait pas menti : il avait vieilli, comme vieillit
// toute liste tenue à la main.
//
// ET LES DEUX MURS N'ONT PAS TENU PAREIL. Celui du cœur est intact : `src/core/` n'importe rien du
// domaine. Celui du shell est tombé. La différence est mécanique, et vaut d'être écrite : `src/core/`
// est un RÉPERTOIRE, donc y toucher se voit dans un diff et se nomme dans une revue ; la frontière
// UI ↔ domaine ne correspondait à aucun répertoire, si bien qu'aucun geste ne se reconnaissait comme
// « je viens de la franchir ». La rupture a été exactement proportionnelle à l'absence de contrôle.
//
// CE QUE CE TEST FAIT, ET CE QU'IL NE FAIT PAS. Il n'arbitre pas : il COMPTE. La liste épinglée
// ci-dessous est l'état du jour, et le test refuse qu'elle grandisse. Elle doit rétrécir à mesure que
// l'isolation avance ; chaque retrait se lit dans son diff. Il n'encode aucun jugement sur ce qui
// mérite d'être couplé — ce jugement vieillirait, le compte non.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(__dirname, "..");

/** Tous les fichiers de source d'un sous-arbre, tests exclus. */
function sources(dossier: string): string[] {
  const out: string[] = [];
  const parcourir = (d: string) => {
    for (const nom of readdirSync(d)) {
      const chemin = join(d, nom);
      if (statSync(chemin).isDirectory()) { parcourir(chemin); continue; }
      if (!/\.tsx?$/.test(nom) || /\.test\.tsx?$/.test(nom)) continue;
      out.push(chemin);
    }
  };
  parcourir(dossier);
  return out.sort();
}

/**
 * LES RÉPERTOIRES QUI SONT LE DOMAINE AUDIO. Cette liste est la définition de « le domaine » pour
 * tout ce fichier, et elle a coûté une cécité : le garde ne connaissait que `audio/` et `plugins/`,
 * si bien que `src/vues-domaine/` — le répertoire que l'isolation venait de créer — lui était
 * invisible. **Vérifié en plantant** `import { VueMontage } from "../vues-domaine/vues-montage";`
 * dans `ui/BarreOutils.tsx` : les huit cas passaient au vert.
 */
const DOSSIERS_DU_DOMAINE = ["audio", "plugins", "vues-domaine", "workers", "parcours", "quiz"];

/**
 * Les imports d'un fichier vers le domaine, et s'ils ne portent que des types.
 *
 * LA DISTINCTION COMPTE, et c'est elle qui rend le compte honnête. `import type { FicheAudio }` est
 * un alias de type : il disparaît à la compilation, ne tire aucun code et n'empêche aucun domaine de
 * substituer le sien. Un import de VALEUR, lui, charge du calcul du domaine dans le shell.
 *
 * LE CHEMIN N'EST PLUS CELUI DU PARENT SEUL. `(?:\.\.\/)+` exigeait de remonter : un fichier posé à
 * la racine de `src/`, qui écrirait `"./audio/…"`, passait à côté. Le motif accepte maintenant les
 * deux formes, et c'est la même faute que celle corrigée trois fois sur l'import des vues.
 *
 * ET L'IMPORT D'EFFET DE BORD SE COMPTE, lui qui est le couplage LE PLUS FORT : `import "…/vues";`
 * ne nomme rien, donc exige tout — il charge et exécute le graphe de modules entier. Le motif
 * demandait un `from`, de sorte que la forme la plus coûteuse était la seule invisible.
 * `docs/inventaire-ui.ts` l'écrit, et la liste épinglée le donnait pour délivré. C'est la quatrième
 * fois que ce fichier manque une forme d'import, et toujours la même leçon : énumérer les formes
 * qu'on imagine laisse passer celle qu'on n'imagine pas. Un import d'effet de bord n'est jamais un
 * import de type.
 */
function importsDomaine(src: string): { cible: string; typeSeul: boolean }[] {
  const out: { cible: string; typeSeul: boolean }[] = [];
  const dossiers = DOSSIERS_DU_DOMAINE.join("|");
  const cible = String.raw`(?:\.{1,2}\/)+(?:${dossiers})(?:\/[^"]*)?`;
  const motif = new RegExp(
    String.raw`^[ \t]*(?:import|export)[ \t]+(type[ \t]+)?([^;]*?)from[ \t]+"(${cible})"`,
    "gm",
  );
  for (const m of src.matchAll(motif)) {
    const typeSeul = m[1] !== undefined || /^\{[^}]*\}$/.test(m[2].trim())
      && m[2].split(",").every((p) => p.replace(/[{}]/g, "").trim().startsWith("type "));
    out.push({ cible: m[3], typeSeul });
  }
  const effetDeBord = new RegExp(String.raw`^[ \t]*import[ \t]+"(${cible})";`, "gm");
  for (const m of src.matchAll(effetDeBord)) out.push({ cible: m[1], typeSeul: false });
  return out;
}

const chemin = (f: string) => relative(RACINE, f).replace(/\\/g, "/");

/**
 * Les fichiers du shell posés à la racine de `src/`, racine de composition exclue.
 *
 * `src/composition.ts` est le seul endroit du dépôt qui a le droit de connaître les deux côtés :
 * l'exclure n'est pas une exemption mais sa définition.
 */
function sourcesRacine(): string[] {
  return readdirSync(RACINE)
    .filter((n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) && !/\.d\.ts$/.test(n))
    .filter((n) => n !== "composition.ts")
    .map((n) => join(RACINE, n));
}

/**
 * LES FICHIERS DU SHELL QUI CHARGENT DU CALCUL DU DOMAINE. Liste épinglée : elle ne doit pas
 * grandir du fait d'un couplage nouveau.
 *
 * Chaque entrée est une dette, sauf les trois générateurs de tables dits plus bas.
 *
 * ÉTAT, ET LA LISTE A FONDU EN TROIS TEMPS :
 *
 *   **47** au premier relevé — tout `src/ui/` confondu, shell et vues de nœud mêlés.
 *   **38** après l'injection du registre : neuf fichiers n'étaient couplés que par
 *          `import { registre } from "../audio/adaptateur"`, et demandent désormais le registre actif.
 *   **7**  après que les vues du domaine ont quitté `src/ui/` pour `src/vues-domaine/`. Elles
 *          importent le domaine, et c'est leur métier ; ce qui empêchait la frontière d'avoir un nom,
 *          c'était qu'elles habitaient le même répertoire que le shell.
 *   **5**  après deux départs sans contrepartie : `SelecteurInstrumentSF2.tsx`, qui est un widget de
 *          domaine et que seule la racine de composition importait ; et `demo/scenario.ts`, dont le
 *          seul besoin était `ordreDeLecture` — une fonction de GRAPHE, qui ne connaît que des
 *          identifiants et des arêtes, et qui a rejoint le cœur où vit déjà le tri topologique.
 *
 * PUIS LE COMPTE EST REMONTÉ À **8**, ET AUCUN COUPLAGE N'EST APPARU. Ce test ne balayait que
 * `src/ui/`, ne connaissait du domaine que `audio/` et `plugins/`, et exigeait un `from`. Il lui
 * manquait donc trois répertoires, les fichiers de la racine de `src/`, et la forme d'import la plus
 * forte. Les trois entrées nouvelles étaient là avant lui. **Un compte qui remonte parce que
 * l'instrument s'élargit vaut mieux qu'un compte flatteur**, et c'est la seule raison pour laquelle
 * celui-ci a le droit de remonter.
 *
 * LES CINQ DETTES QUI RESTENT, et ce qu'il leur faudrait :
 *
 *   `App.tsx`                    le graphe embarqué, l'écriture de fichiers, les métas d'exemple
 *   `AtelierNode.tsx`            l'écoute multicanal
 *   `Inspector.tsx`              les courbes
 *   `hooks/useExecutionGraphe.ts` les deux PILOTES de passes : le lot et les boucles de séquences.
 *                                Pas des fonctions sur des valeurs : des fonctionnalités que le
 *                                moteur pilote. Les sortir demande de reprendre sa structure de
 *                                boucle, donc une décision de conception — et d'abord un test qui
 *                                mène une boucle par voix DANS un lot, emboîtement qu'aucun
 *                                n'éprouve aujourd'hui.
 *   `ordre-palette.ts`           l'ordre des univers du catalogue
 *
 * ET TROIS GÉNÉRATEURS DE TABLES, qui n'étaient pas dans la liste parce que ce test ne balayait pas
 * leur répertoire. Ce ne sont pas des régressions : ils étaient là avant, et le garde ne les voyait
 * pas. **La liste grandit donc de trois sans que l'isolation ait reculé d'un pas** — c'est
 * l'instrument qui s'élargit, et il valait mieux le dire que de garder un compte flatteur.
 *
 *   `docs/catalogue-markdown.ts`  l'ordre du catalogue, pour COMPONENTS.md
 *   `docs/inventaire-ui.ts`       la déclaration des vues, pour INTERFACE.md
 *   `docs/modulables.ts`          les familles de la palette, pour MODULABLES.md
 *
 * CEUX-LÀ SONT LÉGITIMES, et c'est le seul endroit du fichier qui porte un jugement : leur métier
 * est de DÉCRIRE le domaine. Un générateur de la table des composants audio qui ne connaîtrait pas
 * l'audio n'aurait rien à écrire. Un autre domaine écrit les siens, ou les paramètre. Ils figurent
 * ici pour qu'un QUATRIÈME ne s'ajoute pas sans qu'on le remarque.
 */
/*
 * ET LA DICTÉE, ajoutée avec le bouton de la barre.
 *
 *   `ui/dictee/useDictee.ts`     le moteur de reconnaissance, et la liste des noms de composants
 *
 * LE COUPLAGE EST CELUI DU GESTE, et il ne se contourne pas en déplaçant un import : ce qui écoute
 * le micro est le shell, et ce qu'il doit reconnaître est le catalogue du domaine. Il est ramassé
 * en un seul fichier, et la LANGUE de la dictée, elle, n'en sait rien : `ui/dictee/commandes-dictee.ts`
 * et `ui/dictee/pose-dictee.ts` ne connaissent ni l'audio ni le moteur, et portent l'essentiel des
 * décisions. Un autre domaine garde donc la dictée entière et ne réécrit que ce fichier-ci.
 */
const COUPLES_ATTENDUS = [
  "docs/catalogue-markdown.ts",
  "docs/inventaire-ui.ts",
  "docs/modulables.ts",
  "ui/App.tsx",
  "ui/AtelierNode.tsx",
  "ui/dictee/useDictee.ts",
  "ui/Inspector.tsx",
  "ui/hooks/useExecutionGraphe.ts",
  "ui/ordre-palette.ts",
];

describe("la frontière entre le cœur, le shell et le domaine", () => {
  it("LE CŒUR N'IMPORTE RIEN DU DOMAINE, et c'est le mur qui a tenu", () => {
    const fautifs = sources(join(RACINE, "core"))
      .map((f) => ({ f: chemin(f), imp: importsDomaine(readFileSync(f, "utf8")) }))
      .filter((x) => x.imp.length > 0)
      .map((x) => `${x.f} → ${x.imp.map((i) => i.cible).join(", ")}`);
    expect(fautifs, [
      "Un fichier de `src/core/` importe le domaine.",
      "Le cœur transporte des valeurs opaques : ce qu'elles sont relève de l'adaptateur.",
      "Voir PORTING-A-DOMAIN.md, et `core/domaine-nombre.test.ts` pour le second domaine.",
    ].join("\n")).toEqual([]);
  });

  // CE QUE L'ASSERTION PRÉCÉDENTE NE VOYAIT PAS, et c'est le trou par lequel la fuite est entrée.
  // Elle cherche des IMPORTS. Or `AudioBuffer` et `AudioContext` sont des globales du navigateur :
  // le cœur les nommait sans rien importer, et aucun garde ne pouvait le dire. Trois endroits le
  // faisaient — l'empreinte d'une valeur, le nom d'un type, les globales prêtées à un node installé
  // — et ils demandent désormais la réponse au domaine, par `core/services-domaine.ts`.
  //
  // LES COMMENTAIRES SONT ÉCARTÉS, et c'est voulu : expliquer d'où venait une fuite est utile, et
  // plusieurs fichiers du cœur racontent justement celle-ci.
  it("LE CŒUR NE NOMME AUCUN TYPE DU DOMAINE DANS SON CODE, pas même une globale", () => {
    const sansCommentaires = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "").replace(/\/\/[^\n]*$/gm, "");

    // PLUS AUCUNE DETTE, et la liste reste pour que la prochaine se déclare. `core/types.ts` y
    // figurait : il déclarait `TypeValeur`, l'union des valeurs du domaine audio. Elle vit
    // désormais dans `audio/types-domaine.ts`, sous le nom `ValeurAudio`.
    const DETTES_CONNUES: string[] = [];

    // LE VOCABULAIRE COMPTE AUTANT QUE LES TYPES, et je ne le cherchais pas : `PortDef.sousType`
    // énumérait `"stereo" | "mono"` dans le cœur, et je l'ai trouvé en vérifiant, non en le
    // cherchant. Un nom de type est facile à nommer ; un mot du métier l'est moins, et la liste
    // ci-dessous ne vaut que ce qu'elle énumère — elle se complète au fil de ce qu'on trouve.
    const MOTS_DU_DOMAINE = /\bAudio(Buffer|Context)\b|"(stereo|mono|sf2instrument)"/;

    const fautifs = sources(join(RACINE, "core"))
      .map((f) => ({ f: chemin(f), code: sansCommentaires(readFileSync(f, "utf8")) }))
      .filter((x) => MOTS_DU_DOMAINE.test(x.code))
      .map((x) => x.f)
      .filter((f) => !DETTES_CONNUES.includes(f));

    expect(fautifs, [
      "Un fichier du cœur nomme un type du domaine audio dans son code.",
      "Le cœur transporte des valeurs opaques : s'il a besoin d'en savoir quelque chose,",
      "il le DEMANDE au domaine par `core/services-domaine.ts` au lieu de le deviner.",
    ].join("\n")).toEqual([]);
  });

  it("LE CŒUR FONCTIONNE SANS DOMAINE, et traite alors un tampon comme n'importe quel objet", async () => {
    const { empreinteValeur } = await import("../core/graphe");
    const { oublierServicesDomaine, configurerServicesDomaine } = await import("../core/services-domaine");
    try {
      oublierServicesDomaine();
      // Un objet qui imite un tampon : sans réponse du domaine, il retombe sur le cas générique des
      // objets simples, sans lancer ni inventer un type.
      const faux = { length: 4410, sampleRate: 44100, numberOfChannels: 2 };
      expect(empreinteValeur(faux)).toBe("{length:4410,numberOfChannels:2,sampleRate:44100}");
      expect(empreinteValeur(3)).toBe("3");
      // Et avec une réponse, la même valeur est empreinte par le domaine.
      configurerServicesDomaine({
        empreinte: (v) => (typeof v === "object" && v !== null && "sampleRate" in v ? "duDomaine" : null),
      });
      expect(empreinteValeur(faux)).toBe("duDomaine");
    } finally {
      oublierServicesDomaine();
    }
  });

  it("LA LISTE DES FICHIERS DU SHELL COUPLÉS AU DOMAINE NE GRANDIT PAS", () => {
    // CE QU'IL BALAYE, ET IL NE BALAYAIT PAS ASSEZ. `src/ui/` seul laissait `src/docs/` dehors, où
    // trois générateurs de tables importent le domaine depuis toujours, et laissait aussi les
    // fichiers posés à la racine de `src/`. Le shell n'est pas un répertoire : c'est tout ce qui
    // n'est ni le cœur, ni le domaine, ni la racine de composition.
    const couples = [...sources(join(RACINE, "ui")), ...sources(join(RACINE, "docs")), ...sourcesRacine()]
      .filter((f) => importsDomaine(readFileSync(f, "utf8")).some((i) => !i.typeSeul))
      .map(chemin);

    const nouveaux = couples.filter((f) => !COUPLES_ATTENDUS.includes(f));
    expect(nouveaux, [
      "Un fichier du shell charge du calcul du domaine, et il n'était pas dans la liste.",
      "Le changement de domaine est un but du projet : chaque couplage le rend plus coûteux.",
      "Si le couplage est inévitable, ajoutez le fichier à COUPLES_ATTENDUS en disant pourquoi.",
    ].join("\n")).toEqual([]);

    // L'AUTRE SENS COMPTE AUTANT : un fichier délivré doit sortir de la liste, sinon elle redevient
    // une liste tenue à la main, qui vieillit. C'est exactement ce qui est arrivé au document.
    const delivres = COUPLES_ATTENDUS.filter((f) => !couples.includes(f));
    expect(delivres, [
      "Ces fichiers ne sont plus couplés au domaine : retirez-les de COUPLES_ATTENDUS.",
      "Une liste qu'on ne réduit pas finit par décrire un état qui n'existe plus.",
    ].join("\n")).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // LES SIX POTEAUX DE LA FRONTIÈRE. C'est par eux que le domaine se fait connaître du shell, et
  // c'est ce qui donne enfin un nom à une limite qui n'en avait aucun : elle ne correspondait à
  // aucun répertoire, si bien qu'aucun geste ne se reconnaissait comme « je viens de la franchir ».
  //
  //   registre-actif     le registre de fiches du domaine
  //   registre-vues      ce que chaque nœud montre sous son en-tête
  //   favoris            les liens que la barre d'outils propose
  //   widgets-parametre  les genres de paramètre propres au domaine
  //   services-apercu    ce qu'une valeur produite donne à voir et à entendre
  //   services-orchestration  ce que le moteur pose et demande autour d'un run
  //
  // Chacun est VIDE PAR DÉFAUT et n'importe rien du domaine. Le domaine les remplit depuis la racine
  // de composition, qui est le seul endroit connaissant les deux côtés.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  const POTEAUX = [
    "ui/registre-actif.ts", "ui/registre-vues.ts", "ui/favoris.ts",
    "ui/widgets-parametre.ts", "ui/services-apercu.ts", "ui/services-orchestration.ts",
  ];

  it("LES POTEAUX DE LA FRONTIÈRE N'IMPORTENT RIEN DU DOMAINE", () => {
    const fautifs = POTEAUX
      .map((f) => ({ f, imp: importsDomaine(readFileSync(resolve(RACINE, f), "utf8")) }))
      .filter((x) => x.imp.length > 0)
      .map((x) => `${x.f} → ${x.imp.map((i) => i.cible).join(", ")}`);
    expect(fautifs, [
      "Un poteau de la frontière importe le domaine : il cesse alors d'en être un.",
      "Ces modules GARDENT ce que le domaine déclare ; ils ne vont pas le chercher.",
    ].join("\n")).toEqual([]);
  });

  it("AUCUN FICHIER DU SHELL N'IMPORTE LES VUES DU DOMAINE", () => {
    // `vues-domaine/vues.tsx` déclare tout ce que l'audio montre sous un en-tête, et importe pour
    // cela les modules qui le rendent. Qui l'importe charge donc le domaine entier. Deux seuls ont le
    // droit : la racine de composition, dont c'est le métier, et le générateur de `INTERFACE.md`, qui
    // décrit précisément ce que l'audio montre. Les chiffres sont dans l'en-tête de ce fichier-là,
    // qui porte la liste : les répéter ici en ferait une seconde liste tenue à la main.
    const AYANTS_DROIT = ["composition.ts", "docs/inventaire-ui.ts"];
    // TROIS FAUTES DANS LE MÊME MOTIF, ET CHACUNE RENDAIT CE TEST AVEUGLE. C'est le seul endroit du
    // dépôt qui se soit trompé trois fois de la même manière, et la raison est toujours la même : le
    // motif décrivait un CHEMIN, et un chemin change.
    //
    // La première : il ne cherchait que `from "./vues"`. Or un import d'EFFET DE BORD n'a pas de
    // `from` — `import "./vues";` —, et c'est justement la forme qu'emploie la racine de composition.
    //
    // La deuxième : il écrivait `(?:\.\.\/)*`, le chemin vers le PARENT, et jamais `\.\/`, le
    // répertoire courant. Un import voisin, qui est le cas de tous les fichiers du shell, ne pouvait
    // donc pas correspondre. Le test passait au vert **parce qu'il ne cherchait rien** — et c'est la
    // faute que `fiabilite-des-diagnostics` appelle l'instrument qui mesure sa propre cécité.
    //
    // La troisième, et elle est la leçon : le motif nommait `ui/vues`, l'ancien chemin. Le
    // déplacement des vues dans `src/vues-domaine/` l'a donc rendu aveugle **le jour même où le test
    // existait pour surveiller ce déplacement**. Il ne nomme plus aucun répertoire : il demande que
    // le dernier segment du chemin importé soit `vues`, d'où qu'il vienne. Vérifié en plantant
    // `import "../vues-domaine/vues";` dans `AtelierNode.tsx` : les huit cas passaient au vert avant,
    // et celui-ci le nomme après.
    const importeVues = /^[ \t]*import[ \t]+(?:[^;]*?from[ \t]+)?"(?:[^"]*\/)?vues(?:\.tsx?)?";/m;
    const importeurs = [...sources(join(RACINE, "ui")), ...sources(join(RACINE, "docs")), resolve(RACINE, "composition.ts")]
      .filter((f) => importeVues.test(readFileSync(f, "utf8")))
      .map(chemin)
      .filter((f) => !AYANTS_DROIT.includes(f));
    expect(importeurs, [
      "Un fichier du shell importe le fichier de déclaration des vues du domaine audio,",
      "donc tous les modules de vues qu'il tire avec lui.",
      "Le shell demande au registre `ui/registre-vues.ts` ; c'est le domaine qui s'y déclare.",
    ].join("\n")).toEqual([]);
  });

  // CE TEST EST LA PREUVE DU RENVERSEMENT, et son premier chiffre dit tout : **zéro**. Ce fichier
  // n'importe pas la déclaration des vues, donc rien ne s'est déclaré, donc le registre est vide.
  // Avant, le shell importait `vues.tsx` pour sa mécanique, et toutes les entrées de l'audio
  // arrivaient avec : aucun graphe de modules ne pouvait s'en passer.
  it("LE REGISTRE DES VUES EST VIDE TANT QUE LE DOMAINE NE S'EST PAS DÉCLARÉ", async () => {
    const r = await import("../ui/registre-vues");
    // UN REGISTRE DE FICHES EST NÉCESSAIRE, ET C'EST UN FAIT À CONNAÎTRE : la recherche d'une vue
    // passe par lui pour résoudre les alias d'identifiant — « sequenceur-batterie » ouvre
    // « sequenceur-batterie-avance ». Un registre vide suffit : l'identifiant brut est alors rendu
    // tel quel. Les deux registres sont donc distincts mais non indépendants.
    const { creerRegistre } = await import("../core");
    const { configurerRegistreUI } = await import("../ui/registre-actif");
    configurerRegistreUI(creerRegistre<unknown, unknown>());

    r.oublierVues();
    expect(r.nombreDeVues(), "le registre devrait être vide : personne n'a déclaré").toBe(0);
    // Aucune vue déclarée : le nœud ne reçoit rien à dessiner, et ne réclame rien.
    expect(r.vuesPourNoeud("peu-importe", "avant")).toEqual([]);
    expect(r.vueAvantPorteLecteur("peu-importe")).toBe(false);
    expect(r.vueAvantMasqueMessage("peu-importe")).toBe(false);

    // ET L'AUTRE MOITIÉ : la déclaration du domaine le remplit, par le seul effet de son import.
    await import("../vues-domaine/vues");
    expect(r.nombreDeVues(), "l'import de `vues-domaine/vues` devrait avoir déclaré les vues de l'audio")
      .toBeGreaterThan(50);
    expect(r.vuesPourNoeud("quiz", "avant").length).toBe(1);
    expect(r.vueAvantPorteLecteur("explorateur-musique")).toBe(true);
  });

  it("UN IMPORT DE TYPE SEUL N'EST PAS UN COUPLAGE, et le test sait les distinguer", () => {
    // Témoin : sans cette distinction, tout fichier nommant `FicheAudio` compterait pour une dette.
    const avecTypeSeul = sources(join(RACINE, "ui"))
      .filter((f) => {
        const imp = importsDomaine(readFileSync(f, "utf8"));
        return imp.length > 0 && imp.every((i) => i.typeSeul);
      });
    expect(avecTypeSeul.length,
      "aucun fichier n'importe plus que des types : la distinction ne s'éprouve plus")
      .toBeGreaterThan(0);
  });
});
