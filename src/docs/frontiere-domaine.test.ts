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
 * Les imports d'un fichier vers `audio/` ou `plugins/`, et s'ils ne portent que des types.
 *
 * LA DISTINCTION COMPTE, et c'est elle qui rend le compte honnête. `import type { FicheAudio }` est
 * un alias de type : il disparaît à la compilation, ne tire aucun code et n'empêche aucun domaine de
 * substituer le sien. Un import de VALEUR, lui, charge du calcul du domaine dans le shell.
 */
function importsDomaine(src: string): { cible: string; typeSeul: boolean }[] {
  const out: { cible: string; typeSeul: boolean }[] = [];
  const motif = /^[ \t]*(?:import|export)[ \t]+(type[ \t]+)?([^;]*?)from[ \t]+"((?:\.\.\/)+(?:audio|plugins)[^"]*)"/gm;
  for (const m of src.matchAll(motif)) {
    const typeSeul = m[1] !== undefined || /^\{[^}]*\}$/.test(m[2].trim())
      && m[2].split(",").every((p) => p.replace(/[{}]/g, "").trim().startsWith("type "));
    out.push({ cible: m[3], typeSeul });
  }
  return out;
}

const chemin = (f: string) => relative(RACINE, f).replace(/\\/g, "/");

/**
 * LES FICHIERS D'UI QUI CHARGENT DU CALCUL DU DOMAINE. Liste épinglée : elle ne doit pas grandir.
 *
 * Chaque entrée est une dette.
 *
 * ÉTAT, ET LA LISTE A FONDU EN TROIS TEMPS :
 *
 *   **47** au premier relevé — tout `src/ui/` confondu, shell et vues de nœud mêlés.
 *   **38** après l'injection du registre : neuf fichiers n'étaient couplés que par
 *          `import { registre } from "../audio/adaptateur"`, et demandent désormais le registre actif.
 *   **7**  après que les vues du domaine ont quitté `src/ui/` pour `src/vues-domaine/`. Elles
 *          importent le domaine, et c'est leur métier ; ce qui empêchait la frontière d'avoir un nom,
 *          c'était qu'elles habitaient le même répertoire que le shell.
 *
 * LES SEPT QUI RESTENT, et ce qu'il leur faudrait :
 *
 *   `App.tsx`                    le graphe embarqué, les métas d'exemple, la banque SoundFont
 *   `AtelierNode.tsx`            l'écoute multicanal
 *   `Inspector.tsx`              les courbes
 *   `SelecteurInstrumentSF2.tsx` la banque SoundFont — un widget de domaine, déclaré par la racine
 *   `demo/scenario.ts`           le scénario de démonstration
 *   `hooks/useExecutionGraphe.ts` trois modules d'ORCHESTRATION : lot, boucles de séquences, graphe
 *                                courant. Pas des fonctions sur des valeurs : des fonctionnalités que
 *                                le moteur pilote. Les sortir demande de reprendre sa structure de
 *                                boucle, donc une décision de conception.
 *   `ordre-palette.ts`           l'ordre des univers du catalogue
 */
const COUPLES_ATTENDUS = [
  "ui/App.tsx",
  "ui/AtelierNode.tsx",
  "ui/Inspector.tsx",
  "ui/SelecteurInstrumentSF2.tsx",
  "ui/demo/scenario.ts",
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

    const fautifs = sources(join(RACINE, "core"))
      .map((f) => ({ f: chemin(f), code: sansCommentaires(readFileSync(f, "utf8")) }))
      .filter((x) => /\bAudio(Buffer|Context)\b/.test(x.code))
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

  it("LA LISTE DES FICHIERS D'UI COUPLÉS AU DOMAINE NE GRANDIT PAS", () => {
    const couples = sources(join(RACINE, "ui"))
      .filter((f) => importsDomaine(readFileSync(f, "utf8")).some((i) => !i.typeSeul))
      .map(chemin);

    const nouveaux = couples.filter((f) => !COUPLES_ATTENDUS.includes(f));
    expect(nouveaux, [
      "Un fichier d'UI charge du calcul du domaine, et il n'était pas dans la liste.",
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
  // LES QUATRE POTEAUX DE LA FRONTIÈRE. C'est par eux que le domaine se fait connaître du shell, et
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
    // `ui/vues.tsx` déclare les quatre-vingt-deux vues de l'audio et importe les trente modules qui
    // les rendent. Qui l'importe charge donc le domaine entier. Deux seuls ont le droit : la racine
    // de composition, dont c'est le métier, et le générateur de `INTERFACE.md`, qui décrit
    // précisément ce que l'audio montre.
    const AYANTS_DROIT = ["composition.ts", "docs/inventaire-ui.ts"];
    // DEUX FAUTES DANS LE MÊME MOTIF, et la seconde rendait ce test aveugle.
    //
    // La première : il ne cherchait que `from "./vues"`. Or un import d'EFFET DE BORD n'a pas de
    // `from` — `import "./vues";` —, et c'est justement la forme qu'emploie la racine de composition.
    //
    // La seconde, plus grave : il écrivait `(?:\.\.\/)*`, le chemin vers le PARENT, et jamais `\.\/`,
    // le répertoire courant. Un import voisin, qui est le cas de tous les fichiers du shell, ne
    // pouvait donc pas correspondre. Le test passait au vert **parce qu'il ne cherchait rien** — et
    // c'est la faute que `fiabilite-des-diagnostics` appelle l'instrument qui mesure sa propre
    // cécité. Les deux ont été trouvées en plantant l'import dans `AtelierNode.tsx`.
    const importeVues = /^[ \t]*import[ \t]+(?:[^;]*?from[ \t]+)?"(?:\.{1,2}\/)*(?:ui\/)?vues";/m;
    const importeurs = [...sources(join(RACINE, "ui")), ...sources(join(RACINE, "docs")), resolve(RACINE, "composition.ts")]
      .filter((f) => importeVues.test(readFileSync(f, "utf8")))
      .map(chemin)
      .filter((f) => !AYANTS_DROIT.includes(f));
    expect(importeurs, [
      "Un fichier du shell importe `ui/vues`, donc les trente modules de vues du domaine audio.",
      "Le shell demande au registre `ui/registre-vues.ts` ; c'est le domaine qui s'y déclare.",
    ].join("\n")).toEqual([]);
  });

  // CE TEST EST LA PREUVE DU RENVERSEMENT, et son premier chiffre dit tout : **zéro**. Ce fichier
  // n'importe pas `ui/vues`, donc rien ne s'est déclaré, donc le registre est vide. Avant, le shell
  // important `vues.tsx` pour sa mécanique, les quatre-vingt-deux entrées de l'audio arrivaient avec,
  // et aucun graphe de modules ne pouvait s'en passer.
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
    expect(r.nombreDeVues(), "l'import de `ui/vues` devrait avoir déclaré les vues de l'audio")
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
