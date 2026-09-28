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

import { CHAMPS_GARDES_AU_REGLAGE, CHAMPS_RESULTAT, CHAMPS_UTILISATEUR } from "./useExecutionGraphe";

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
// L'AFFIRMATION DE TYPE EST QUELCONQUE, et c'est ce qui manquait. Le motif ne reconnaissait que
// `data as any)`, si bien qu'une écriture sous `data as Record<string, unknown>)` passait. DEUX
// champs y sont restés sur quatre écritures : `_animationSvg` du cercle pulsant, et `_profilGout`
// de Goût, Parfum et Accord mets. Tous quatre écrits de la même main, et tous quatre invisibles au
// relevé pendant que son premier cas affirmait « plus aucun composant ne pose de champ ». Un garde
// qui cherche une ORTHOGRAPHE laisse entrer par l'autre porte ; celui-ci cherche la forme.
const ECRITURE = /(?<![A-Za-z0-9_])data(?:\s+as\s+[^)]*)?\s*\)?\s*\.([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/g;

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
  ].filter(Boolean).join(" + ") || "";

describe("les champs qu'un exécuteur pose sur un nœud", () => {
  const ecrits = champsEcrits();

  it("LE RELEVÉ VOIT CE QU'IL PRÉTEND VOIR : deux témoins dont la réponse est connue", () => {
    // Avant de croire un banc, lui faire mesurer un cas dont on connaît déjà la réponse. Sans ces
    // deux-là, un motif qui cesserait de mordre rendrait une liste vide, donc une suite au vert.
    // LE TÉMOIN A DÛ ÊTRE REPRIS TROIS FOIS, et c'est la mesure de la migration : les tampons du
    // Montage, puis le film du Montage vidéo, puis le graphe d'export, chacun ayant quitté le sac
    // pour un canal déclaré. Le relevé a signalé sa disparition à chaque fois plutôt que de passer au
    // vert sur une liste devenue vide, ce qui est exactement ce qu'on lui demande. Il n'y a plus AUCUN
    // champ posé par un exécuteur : le témoin est donc l'absence elle-même, et le motif est éprouvé
    // sur ce que le MOTEUR dépose, qui existe toujours.
    expect([...ecrits.keys()], "plus aucun composant ne pose de champ sur un nœud").toEqual([]);
    expect(classe("audioResultatUrl"), "le motif des classes doit encore répondre").toBe("résultat");
    expect(classe("audioFichier"), "et distinguer une saisie d'un résultat").toBe("utilisateur");
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

  it("IL N'Y A PLUS QUE DEUX CLASSES, la troisième n'ayant décrit que des champs déplacés", () => {
    // `CHAMPS_SIGNAL_UNIQUE` nommait trois champs qu'un composant posait sur un nœud pour parler au
    // MOTEUR, et que le moteur relisait puis remettait à `undefined`. Ils passent par `moteur`, dans
    // le retour de l'exécuteur : rien ne se pose, donc rien n'a de classe à recevoir.
    const source = readFileSync(join("src", "ui", "hooks", "useExecutionGraphe.ts"), "utf8");
    expect(source).not.toMatch(/export const CHAMPS_SIGNAL_UNIQUE/);
    const contrat = readFileSync(join("src", "core", "types.ts"), "utf8");
    expect(contrat, "le canal du moteur doit être déclaré").toMatch(/moteur\?:\s*DemandeAuMoteur/);
  });

  it("LE CANAL DÉCLARÉ PORTE LA CLASSE, et deux clés suffisent aux 448", () => {
    // CE QUE CE CAS TIENT. `affichage` est ce qu'un run a produit : une remise à zéro l'efface, et
    // un réglage aussi, puisqu'il vient de le rendre faux. `designe` est ce que le run a reçu de ses
    // entrées : la remise à zéro l'efface, un réglage le garde. C'est cette seule distinction qui
    // permet d'entendre un montage pendant qu'on le règle, et elle ne se déclare plus champ par
    // champ — trois entrées y figuraient avant que le Montage et la Maquette passent au canal.
    expect(CHAMPS_RESULTAT.has("_affichage"), "une remise à zéro doit effacer l'affichage").toBe(true);
    expect(CHAMPS_RESULTAT.has("_designe"), "une remise à zéro doit effacer le désigné").toBe(true);
    expect(CHAMPS_GARDES_AU_REGLAGE.has("_designe"), "un réglage doit garder le désigné").toBe(true);
    expect(CHAMPS_GARDES_AU_REGLAGE.has("_affichage"), "un réglage doit périmer l'affichage").toBe(false);
  });

  it("ET LE CANAL DU MOTEUR NE POSE RIEN : il n'est dans aucune classe", () => {
    // Une demande au moteur qui se retrouverait dans une classe serait une demande stockée, donc un
    // champ de plus à effacer un jour. Elle ne doit être nulle part.
    for (const c of ["moteur", "_moteur", "_grapheGenere", "_grapheEmbarque", "_nodeInstalle", "_grapheExport"]) {
      expect(classe(c), `${c} ne doit plus avoir de classe`).toBe("");
    }
  });

  it("ET LE CANAL EST DÉCLARÉ DANS LE CONTRAT D'EXÉCUTEUR, non dans une convention de nommage", () => {
    // Un champ préfixé d'un blanc souligné écrit dans le sac de l'interface n'engage personne : le
    // composant ne peut ni le déclarer ni être confronté à lui. Ici le type le porte, donc le
    // compilateur le tient.
    const contrat = readFileSync(join("src", "core", "types.ts"), "utf8");
    expect(contrat).toMatch(/affichage\?:\s*Record<string, unknown>/);
    expect(contrat).toMatch(/designe\?:\s*Record<string, unknown>/);
  });

  it("ET CE QU'UN RÉGLAGE GARDE RESTE UN RÉSULTAT : le bouton de remise à zéro l'efface", () => {
    // La portée d'un geste, et non une quatrième classe. Un champ gardé au réglage qui ne serait pas
    // un résultat ne s'effacerait plus jamais, et l'on retomberait sur le défaut d'origine.
    const hors = [...CHAMPS_GARDES_AU_REGLAGE].filter((champ) => !CHAMPS_RESULTAT.has(champ));
    expect(hors, "un champ gardé au réglage doit rester dans CHAMPS_RESULTAT").toEqual([]);
  });

  it("LES DEUX CLASSES NE SE TOUCHENT PAS : un champ n'en a qu'une", () => {
    // Un champ à la fois saisie et résultat serait effacé par une remise à zéro alors qu'il
    // appartient à la personne : c'est un fichier chargé qui s'évapore.
    const doubles = [...ecrits.keys(), ...CHAMPS_RESULTAT, ...CHAMPS_UTILISATEUR]
      .filter((champ) => classe(champ).includes("+"));
    expect(doubles).toEqual([]);
  });
});
