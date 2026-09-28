// ui/hooks/champs-noeud.test.ts — Tout champ qu'un exécuteur pose sur un nœud est-il classé ?
//
// POURQUOI CE FICHIER EXISTE, relevé par Fabien après le défaut de la ligne de temps du Montage :
// « les paramètres n'ont pas à survivre au Reset ». Un exécuteur écrit sur `ctx.noeud.data`, la
// fusion générique de `lancer()` recopie tout champ préfixé d'un blanc souligné dans l'état React, et
// la remise à zéro n'efface que `CHAMPS_RESULTAT`. Un champ oublié de cette liste reste donc à
// l'écran sur un nœud redevenu « en attente », décrivant une exécution qui n'a plus lieu. C'est
// arrivé deux fois : le dessin du générateur de courbe, puis les barres et l'onde du Montage.
//
// IL N'Y A QUE TROIS CLASSES, ET UNE SEULE EXCEPTION LÉGITIME.
//
//   `CHAMPS_RESULTAT` — produit par le run et ne décrivant que lui. Une remise à zéro l'efface. Le
//   critère se vérifie d'un mot : si le nœud n'a pas tourné, le champ ne veut rien dire.
//
//   `CHAMPS_UTILISATEUR` — vient de la personne : un fichier chargé, un choix. Protégé de la remise à
//   zéro, recopié par le copier-coller, écrit dans le projet.
//
//   `CHAMPS_SIGNAL_UNIQUE` — un déclencheur ponctuel, consommé et remis à `undefined` par son bloc
//   dédié à la fin de `lancer()`, avant la fusion générique. C'EST LA SEULE EXCEPTION LÉGITIME, et sa
//   propriété se vérifie : il ne survit pas au run qui l'a posé, donc la question de sa survie à une
//   remise à zéro ne se pose jamais. Un champ qui prétendrait à cette classe sans que `lancer()`
//   l'efface serait un résultat déguisé.
//
// UN CHAMP QUI N'EST DANS AUCUNE DES TROIS EST UN DÉFAUT, et non un quatrième cas. `A_CLASSER` les
// nomme un par un, comme les tolérances du banc MIDI : la table dit ce qui reste à faire, elle ne
// l'excuse pas. Un second cas tient qu'aucune entrée n'y a vieilli, faute de quoi elle masquerait le
// retour du défaut sous un autre nom.
//
// CE QUE CE RELEVÉ NE VOIT PAS, ET IL FAUT LE DIRE. Il lit la forme `data.X =`, celle des exécuteurs.
// Le crochet d'exécution, lui, dépose ses champs génériques par objet littéral (`apercuCourbe`,
// `audioResultatUrl`…) : ils échappent au motif, et c'est sans conséquence puisqu'ils sont tous dans
// `CHAMPS_RESULTAT`, ce qu'un cas de `champs-copie.test.ts` tient déjà. Deux témoins éprouvent le
// motif avant qu'on croie son résultat : un banc qu'on n'a pas fait mesurer une réponse connue ne
// prouve rien.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CHAMPS_RESULTAT, CHAMPS_SIGNAL_UNIQUE, CHAMPS_UTILISATEUR } from "./useExecutionGraphe";

/**
 * Les champs qu'un exécuteur pose sans qu'on ait décidé de leur classe.
 *
 * ELLE EST VIDE, ET C'EST SA PLACE. Vingt-neuf champs y ont figuré le temps d'une revue, puis ont
 * été rangés dans `CHAMPS_RESULTAT` : douze composants dont le film produit, la carte engendrée, le
 * rouleau de notes ou le relevé d'esthétique restaient à l'écran sur un nœud redevenu « en attente ».
 * Une table qui se remplit est un chantier ouvert, non une excuse : un champ n'y reste que le temps
 * de décider sa classe.
 */
const A_CLASSER = new Set<string>([]);

/** `data.X =`, `(ctx.noeud.data as any).X =`, `n.data.X =`. */
const ECRITURE = /(?<![A-Za-z0-9_])data(?:\s+as\s+any)?\s*\)?\s*\.([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/g;

function sourcesPlugins(dossier = join("src", "plugins"), out: string[] = []): string[] {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const c = join(dossier, e.name);
    if (e.isDirectory()) sourcesPlugins(c, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(c);
  }
  return out;
}

/** Les champs écrits par les exécuteurs, avec les fichiers qui les écrivent. */
function champsEcrits(): Map<string, string[]> {
  const trouves = new Map<string, string[]>();
  for (const f of sourcesPlugins()) {
    const texte = readFileSync(f, "utf8");
    for (const m of texte.matchAll(ECRITURE)) {
      const ou = trouves.get(m[1]) ?? [];
      if (!ou.includes(f)) ou.push(f);
      trouves.set(m[1], ou);
    }
  }
  return trouves;
}

const classe = (champ: string): string =>
  [
    CHAMPS_UTILISATEUR.has(champ) && "utilisateur",
    CHAMPS_RESULTAT.has(champ) && "résultat",
    CHAMPS_SIGNAL_UNIQUE.has(champ) && "signal unique",
  ].filter(Boolean).join(" + ") || "";

describe("les champs qu'un exécuteur pose sur un nœud", () => {
  const ecrits = champsEcrits();

  it("LE RELEVÉ VOIT CE QU'IL PRÉTEND VOIR : deux témoins dont la réponse est connue", () => {
    // Avant de croire un banc, lui faire mesurer un cas dont on connaît déjà la réponse. Sans ces
    // deux-là, un motif qui cesserait de mordre rendrait une liste vide, donc une suite au vert.
    expect([...ecrits.keys()], "le relevé ne trouve plus les tampons du Montage").toContain("_montageSons");
    expect([...ecrits.keys()], "le relevé ne trouve plus le graphe engendré").toContain("_grapheGenere");
    expect(classe("_montageSons")).toBe("résultat");
    expect(classe("_grapheGenere")).toBe("signal unique");
  });

  it("CHACUN EST CLASSÉ, ou nommé dans la table de ce qui reste à faire", () => {
    const orphelins = [...ecrits]
      .filter(([champ]) => !classe(champ) && !A_CLASSER.has(champ))
      .map(([champ, ou]) => `${champ} (${ou.join(", ")})`);
    expect(orphelins, [
      "Un champ posé sur un nœud n'appartient à aucune classe.",
      "Un résultat va dans CHAMPS_RESULTAT et une remise à zéro l'efface ;",
      "une saisie va dans CHAMPS_UTILISATEUR et rien ne l'efface ;",
      "un déclencheur va dans CHAMPS_SIGNAL_UNIQUE, et `lancer()` doit le consommer lui-même.",
      "Sans quoi il reste à l'écran sur un nœud redevenu « en attente ».",
    ].join("\n")).toEqual([]);
  });

  it("AUCUNE ENTRÉE DE LA TABLE N'A VIEILLI : une ligne inutile masquerait le retour du défaut", () => {
    const perimes = [...A_CLASSER].filter((champ) => !ecrits.has(champ) || !!classe(champ));
    expect(perimes, "à retirer de A_CLASSER : ces champs sont rangés ou n'existent plus").toEqual([]);
  });

  it("LES TROIS CLASSES NE SE TOUCHENT PAS : un champ n'en a qu'une", () => {
    const doubles = [...ecrits.keys(), ...CHAMPS_RESULTAT, ...CHAMPS_SIGNAL_UNIQUE]
      .filter((champ) => classe(champ).includes("+"));
    expect(doubles).toEqual([]);
  });
});
