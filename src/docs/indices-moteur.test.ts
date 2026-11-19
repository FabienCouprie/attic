// src/docs/indices-moteur.test.ts — Chaque indice qu'une fiche donne au moteur est-il joué dans
// l'application, par un vrai composant ?
//
// POURQUOI CE GARDE. Le point 3 du diagnostic d'`ARCHITECTURE.md` le demandait : « une modification
// dans la logique de reset ou de cache peut se propager à l'ensemble des 200+ nœuds, car il n'y a pas
// de garde-fou par famille de nœud ». Ni le moteur ni la remise à zéro ne lisent la famille d'une
// fiche. Ce qui fait qu'une faute de cache ou de reset frappe un nœud et en épargne un autre, ce sont
// les indices d'`IndicesMoteur` (`core/types.ts`), et c'est donc par eux que la famille se compte.
//
// LE TROU, MESURÉ LE 2026-11-19 (pièce 0 du plan du point 3). Les deux gardes qui font Lancer, ▶ et
// ↺ dans l'application, le journal de passe et la base du son, jouaient quinze exemples, soit 79
// fiches sur 513. Aucune ne portait `jamaisCache`, `sansApercuAudio`, `affichageAutonome`,
// `executerEnDernier` ni `sortieHorsPlagePossible`. Ces comportements n'étaient éprouvés qu'à l'unité,
// sur des fiches fabriquées : un cache qui aurait ignoré `jamaisCache` laissait les deux gardes verts.
//
// CE QU'IL EXIGE, pour chaque indice, une déclaration et une seule :
//   — JOUÉ : une vraie fiche qui le porte est dans un exemple surveillé. Ce garde la cherche, et son
//     texte dit quel garde en voit la faute, plantée et vue rouge ;
//   — NON ÉPROUVÉ : une fiche qui le porte peut y être, mais les gestes des deux gardes n'atteignent
//     pas ce qui le lit, ou ce qu'il change ne s'y mesure pas. Le texte dit pourquoi, mesure à l'appui ;
//   — HORS DE PORTÉE : aucune fiche qui le porte ne peut jouer dans un exemple surveillé, pour la raison
//     écrite. Ce garde vérifie qu'aucune n'y est, et la déclaration tombe le jour où l'une y entre.
//
// LA TABLE EST TYPÉE SUR L'INTERFACE : un indice ajouté à `IndicesMoteur` sans y entrer ne compile
// pas. Et parce que `npx vitest run` ne vérifie pas les types, le premier cas relit aussi l'interface
// dans `core/types.ts`.
//
// UN EXEMPLE SURVEILLÉ est un exemple que jouent les deux gardes de l'application : inscrit dans la
// base du son (`tests-e2e/empreintes-exemples.json`), que le journal relit pour savoir quoi jouer, et
// dont les deux scénarios sont dans la base des journaux (`tests-e2e/journaux-de-passe.json`).
//
// CE QU'IL NE PROUVE PAS : qu'une faute se voie. La présence d'une fiche n'en dit rien, et c'est la
// faute plantée qui le mesure ; ce garde tient seulement que le représentant ne disparaisse pas sans
// qu'on le dise.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { IndicesMoteur } from "../core/types";
import { toutesLesFiches } from "../plugins";

const RACINE = resolve(__dirname, "../..");

type Declaration =
  | { joue: string }
  | { nonEprouve: string }
  | { horsDePortee: string };

/** L'exemple livré qui porte les comportements qu'aucun autre exemple surveillé ne portait. */
const EPREUVE = "`ce-que-le-moteur-lit-sur-un-noeud`";

const INDICES = {
  jamaisCache: {
    joue: `« Quiz » dans ${EPREUVE}, en amont du nœud des gestes du journal : après le ↺ de ce nœud, `
      + "Lancer doit refaire « Quiz » au lieu de le reprendre du cache. Mesuré le 2026-11-19, l'indice "
      + "ignoré par `peutReutiliserLeCache` (`core/cache-execution.ts`) : le journal tombe sur le scénario "
      + "« gestes » de cet exemple, « Quiz » y passant à « terminé » sans avoir tourné, et ses trente et un "
      + "autres scénarios restent identiques. La base du son reste verte, le son étant le même.",
  },
  affichageAutonome: {
    horsDePortee: "Ses quatre porteuses attendent ce que les deux gardes n'ont pas. « Entrée audio » et "
      + "« Lecteur musique » attendent des fichiers de l'utilisateur ; « Carte sonore » et « Coordonnées "
      + "sur carte » attendent Electron, et le navigateur des deux gardes ne l'est pas : au banc, hors "
      + "ligne, elles rendent « Nécessite Electron. » (relevé du 2026-11-19).",
  },
  sansApercuAudio: {
    joue: `« Séparateur canaux » dans ${EPREUVE}, entre le générateur et les deux « Sortie audio ». `
      + "Mesuré le 2026-11-19, l'indice ignoré par le correctif de résultat (`ui/correctif-resultat.ts`) : "
      + "le séparateur reçoit un lecteur, et les deux gardes tombent sur cet exemple, le journal sur ses "
      + "deux scénarios, la base du son sur un aperçu qu'elle n'attendait pas.",
  },
  memoire: {
    nonEprouve: "Aucun module ne le lit, et il n'y a donc rien à planter. `ModeMemoire` (`core/memoire.ts`) "
      + "annonce qu'un nœud « flux » pourra travailler par blocs, et ce travail n'existe pas encore : "
      + "« Phaser » et « Séparateur canaux » le portent dans des exemples surveillés sans que rien ne le "
      + "consulte. Le jour où une lecture viendra, l'indice passera à « joué », sa faute plantée vue rouge.",
  },
  sortieNullePermise: {
    joue: "« Clavier isomorphe » dans `un-son-projete-en-microtonal` rend toutes ses sorties nulles, ce qui "
      + "est pour lui un résultat valide. Mesuré le 2026-11-19, l'indice ignoré par `estResultatEnErreur` "
      + "(`core/execution.ts`) : le nœud passe en erreur, et les deux gardes tombent sur cet exemple, le "
      + `journal sur ses deux scénarios. « Séparateur canaux » le porte aussi dans ${EPREUVE}, où il ne `
      + "rend jamais tout nul : là, la même faute ne se voit pas.",
  },
  executerEnDernier: {
    horsDePortee: "Sa seule porteuse, « Démonstration », n'a pas d'entrée, et sa sortie « Vidéo » est un "
      + "fichier que seule « Extraction PDF » reçoit : posée dans un exemple livré, elle n'y serait "
      + "reliée à rien qui la lise, et le contrat de graphe (`docs/contrat-graphe.test.ts`) refuse un "
      + "nœud relié à rien.",
  },
  relanceAutomatique: {
    nonEprouve: "« Maquette » le porte dans `canon-de-proportions` et `patch-openmusic`, mais seul un "
      + "changement de réglage le lit (`ui/hooks/useRelanceApresReglage.ts`), et les deux gardes n'en "
      + "font aucun : leurs gestes sont Lancer, ▶ et ↺. Mesuré le 2026-11-19, la relance ôtée à toutes "
      + "les fiches : les deux gardes restent verts sur `canon-de-proportions`.",
  },
  apercuEstLeFichier: {
    joue: `« Sortie audio » dans \`deux-sons-deux-roles\`, dans ${EPREUVE} et dans d'autres exemples `
      + "surveillés : son aperçu est le fichier livré, et porte donc `bext` et `iXML`. La base du son relève "
      + "les morceaux de chaque WAV (`blocsWav` de `audio/empreinte-wav.ts`) depuis le 2026-11-20. Mesuré "
      + "le même jour, l'indice ignoré par le correctif de résultat : la base du son tombe sur ces deux "
      + "exemples, chaque « Sortie audio » perdant ses deux blocs, son niveau inchangé. Le journal reste "
      + "vert : il décrit l'aperçu à refaire par ses seules clés. Avant ce relevé, les deux gardes "
      + "restaient verts.",
  },
  sortieHorsPlagePossible: {
    nonEprouve: `« Générateur audio mathématique » le porte dans ${EPREUVE}, mais les porteuses que le `
      + "navigateur joue écrêtent elles-mêmes à ±0,5 (`securiserAmplitude` dans `audio/math-formules.ts`) : "
      + "le recadrage de l'aperçu que l'indice commande n'a rien à reprendre. Les deux qui pourraient "
      + "sortir de la plage, « Python Processor » et « Julia Processor », demandent Electron. Mesuré le "
      + "2026-11-19, le recadrage ôté : les deux gardes restent verts sur cet exemple.",
  },
} satisfies Record<keyof IndicesMoteur, Declaration>;

type Indice = keyof typeof INDICES;

const lireJson = <T>(chemin: string): T => JSON.parse(readFileSync(join(RACINE, chemin), "utf8")) as T;

/** Les exemples que jouent les deux gardes de l'application. */
function exemplesSurveilles(): string[] {
  const son = lireJson<{ exemples: Record<string, unknown> }>("tests-e2e/empreintes-exemples.json");
  const journaux = lireJson<{ exemples: Record<string, { lancer?: unknown; gestes?: unknown }> }>(
    "tests-e2e/journaux-de-passe.json");
  return Object.keys(son.exemples).filter((f) => journaux.exemples[f]?.lancer && journaux.exemples[f]?.gestes).sort();
}

/** Les fiches d'un graphe, celles des métas comprises : tout objet qui nomme une fiche. */
function fichesDe(fichier: string): Set<string> {
  const ids = new Set<string>();
  const parcourir = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    const id = (o as { ficheId?: unknown }).ficheId;
    if (typeof id === "string") ids.add(id);
    for (const v of Object.values(o)) parcourir(v);
  };
  parcourir(lireJson(join("exemples", fichier)));
  return ids;
}

const porte = (indice: Indice) => (f: unknown): boolean => {
  const v = (f as Partial<IndicesMoteur>)[indice];
  return v !== undefined && v !== false;
};

/** Pour un indice, les fiches qui le portent dans chaque exemple surveillé où il y en a. */
function porteusesSurveillees(indice: Indice): string[] {
  const porteuses = new Set(toutesLesFiches.filter(porte(indice)).map((f) => f.id));
  return exemplesSurveilles().flatMap((ex) => {
    const ici = [...fichesDe(ex)].filter((id) => porteuses.has(id));
    return ici.length > 0 ? [`${ex} : ${ici.join(", ")}`] : [];
  });
}

const sorte = (d: Declaration): "joue" | "nonEprouve" | "horsDePortee" =>
  "joue" in d ? "joue" : "nonEprouve" in d ? "nonEprouve" : "horsDePortee";

describe("les indices du moteur, joués par de vrais composants", () => {
  it("LA TABLE SUIT L'INTERFACE, relue dans `core/types.ts`", () => {
    const source = readFileSync(join(RACINE, "src/core/types.ts"), "utf8");
    const corps = source.split(/^export interface IndicesMoteur \{$/m)[1]?.split(/^\}$/m)[0];
    expect(corps, "l'interface `IndicesMoteur` est introuvable dans `core/types.ts`").toBeDefined();
    const declares = [...corps!.matchAll(/^ {2}(\w+)\?:/gm)].map((m) => m[1]).sort();
    expect(declares.length, "aucun indice relu : le motif ne mord plus sur l'interface").toBeGreaterThan(0);
    expect(Object.keys(INDICES).sort(), "un indice de l'interface manque à la table, ou l'inverse").toEqual(declares);
  });

  it("LES EXEMPLES SURVEILLÉS SONT LÀ, et chacun est un graphe livré", () => {
    const surveilles = exemplesSurveilles();
    expect(surveilles.length, "aucun exemple n'est joué par les deux gardes").toBeGreaterThan(0);
    for (const ex of surveilles) expect(existsSync(join(RACINE, "exemples", ex)), ex).toBe(true);
  });

  it("CHAQUE DÉCLARATION DIT SA RAISON", () => {
    for (const [indice, d] of Object.entries(INDICES) as [Indice, Declaration][]) {
      const texte = Object.values(d)[0] as string;
      expect(texte.length, `${indice} : une déclaration sans raison n'en est pas une`).toBeGreaterThan(80);
    }
  });

  it("UN INDICE JOUÉ EST PORTÉ PAR UNE FICHE D'UN EXEMPLE SURVEILLÉ", () => {
    const manquants = (Object.keys(INDICES) as Indice[])
      .filter((i) => sorte(INDICES[i]) === "joue" && porteusesSurveillees(i).length === 0)
      .map((i) => `  ${i} : porté par ${toutesLesFiches.filter(porte(i)).map((f) => f.id).join(", ") || "aucune fiche"}`);
    expect(manquants, ["",
      "Ces indices sont déclarés joués, et aucune fiche qui les porte n'est plus dans un exemple que jouent",
      "le journal de passe et la base du son. Une faute du cache ou de la remise à zéro sur eux passerait",
      "donc les deux gardes. Remettez un représentant dans un exemple surveillé, ou déclarez l'indice",
      "non éprouvé ou hors de portée, avec sa raison :", ...manquants, ""].join("\n")).toEqual([]);
  });

  it("UNE DÉCLARATION HORS DE PORTÉE TOMBE QUAND UNE PORTEUSE ENTRE DANS UN EXEMPLE SURVEILLÉ", () => {
    const perimees = (Object.keys(INDICES) as Indice[])
      .filter((i) => sorte(INDICES[i]) === "horsDePortee")
      .flatMap((i) => porteusesSurveillees(i).map((l) => `  ${i} · ${l}`));
    expect(perimees, ["",
      "Ces indices sont déclarés hors de portée, et une fiche qui les porte est maintenant jouée par les",
      "deux gardes. Plantez la faute qui ignore l'indice, voyez-la rouge, et déclarez-le joué :", ...perimees, ""].join("\n"))
      .toEqual([]);
  });
});
