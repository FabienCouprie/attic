// plugins/boucle-deux-mecaniques.test.ts — Les deux façons de répéter ne se mélangent pas.
//
// CE QUE CE FICHIER TIENT. Attic répète de deux manières, et elles sont incompatibles par
// construction. La boucle de GRAPHE recopie la chaîne avant l'exécution, sous des identifiants
// engendrés — « d#0::n ». Les boucles PAR PASSES — par voix, par créneau, par cercle — rejouent le
// graphe entier une fois par morceau, et apparient un nœud à sa boucle PAR SON IDENTIFIANT
// (`boucleDuDebut`). Une boucle par passes tombée dans le ventre d'une boucle de graphe est donc
// recopiée en nœuds que le pilote ne reconnaît plus : la découverte n'a jamais lieu, la boucle reste
// à zéro morceau, et le graphe aboutit sans avoir bouclé.
//
// MESURÉ DANS L'APPLICATION AVANT LE GARDE : seule, une boucle par voix annonce « voix 1/1 ·
// 10 notes » ; la même, posée dans un ventre, n'annonce rien, le graphe aboutit et aucun
// avertissement ne paraît. Un résultat faux et muet est le pire des deux.
//
// POURQUOI LE CAS EST ICI ET NON DANS LE CŒUR. `core/boucle-graphe.ts` refuse ce câblage, et il
// nomme pour cela les identifiants de fiches concernés — ce qu'il fait déjà pour ses propres bouts.
// Mais le cœur n'importe rien des fiches, et ne peut donc pas vérifier que sa liste est complète.
// C'est ce cas-ci qui l'y oblige : une septième boucle par passes ajoutée demain échouera ici tant
// que le garde ne la connaîtra pas.
import { describe, expect, it } from "vitest";

import { FICHES_BOUCLE_PAR_PASSE } from "../core/boucle-graphe";
import { aplatirGraphe } from "../core/meta";
import type { AreteG, MetaComposant, NoeudG } from "../core/meta";
import { ancetres, descendants } from "../core/graphe";
import {
  FICHES_BOUCLE_DEBUT, FICHES_BOUCLE_FIN, FICHE_CRENEAU_DEBUT, FICHE_CRENEAU_FIN, planifierBoucles,
} from "./boucleSequencesGlobal";

describe("le garde du dépliage connaît toutes les boucles par passes", () => {
  it("SA LISTE EST EXACTEMENT CELLE DES FICHES, débuts et fins", () => {
    const declarees = [...FICHES_BOUCLE_DEBUT, ...FICHES_BOUCLE_FIN].sort();
    expect([...FICHES_BOUCLE_PAR_PASSE].sort()).toEqual(declarees);
  });

  it("ET IL Y EN A BIEN À CONNAÎTRE, le compte étant écrit", () => {
    // Un cas qui ne trouve rien passe, et l'on croirait qu'il garde quelque chose.
    expect(FICHES_BOUCLE_DEBUT.length).toBe(3);
    expect(FICHES_BOUCLE_FIN.length).toBe(3);
  });
});

describe("une boucle par passes dans un méta-composant", () => {
  // L'AUTRE COPIEUR, ET IL NE SE REFUSE PAS. Un méta-composant DOIT s'aplatir pour tourner : on ne
  // peut pas lui opposer un refus comme au dépliage. Son contenu prend alors des identifiants
  // préfixés, et c'est sous CET identifiant que le nœud s'annoncera à sa boucle (`ctx.noeud.id`).
  // Le plan se fait donc sur le graphe aplati, où les deux se rejoignent.
  const n = (id: string, ficheId: string): NoeudG =>
    ({ id, position: { x: 0, y: 0 }, data: { ficheId, parametres: {} } });
  const a = (id: string, source: string, target: string): AreteG =>
    ({ id, source, target, sourceHandle: "out:0", targetHandle: "in:0" });

  /** Un outil qui porte une boucle par créneau : son début, sa fin, et le câble entre eux. */
  const outil: MetaComposant = {
    id: "meta-boucle", nom: "Outil à créneaux",
    entrees: [], sorties: [{ nom: "Out 1", type: "sequence" }],
    mapEntrees: [], mapSorties: [{ noeudInterne: "cf", portIndex: 0 }],
    sousNoeuds: [n("cd", FICHE_CRENEAU_DEBUT), n("cf", FICHE_CRENEAU_FIN)],
    sousAretes: [a("i1", "cd", "cf")],
  };
  const visibles = [n("outil1", "meta-boucle"), n("rs", "rendu-sequence")];
  const aretesVisibles = [a("e1", "outil1", "rs")];
  const getMeta = (ficheId: string) => (ficheId === "meta-boucle" ? outil : undefined);
  const planSur = (noeuds: NoeudG[], aretes: AreteG[]) => planifierBoucles(
    noeuds, (id) => [...descendants(id, aretes)], (id) => [...ancetres(id, aretes)],
  );

  it("N'EST PAS VISIBLE SUR LE GRAPHE QU'ON VOIT, et c'était la faute", () => {
    // Ce cas dit le défaut plutôt que de le taire : sur les nœuds visibles, l'outil n'est qu'UN
    // nœud, aucun début de boucle ne s'y trouve, et le pilote ne menait donc aucune boucle. Mesuré
    // dans l'application : quatre notes sur quatorze secondes devenaient une note sur deux secondes.
    expect(planSur(visibles, aretesVisibles)).toBeNull();
  });

  it("MAIS SE PLANIFIE SUR LE GRAPHE APLATI, sous l'identifiant que l'exécution lui donnera", () => {
    const plat = aplatirGraphe(visibles, aretesVisibles, getMeta);
    const plan = planSur(plat.noeuds, plat.aretes);
    expect(plan).not.toBeNull();
    expect(plan!.boucles).toEqual([{ debutId: "outil1::cd", finsIds: ["outil1::cf"] }]);
    // ET C'EST BIEN L'IDENTIFIANT DU NŒUD EXÉCUTÉ : le même que l'aplatissement a posé.
    expect(plat.noeuds.map((x) => x.id)).toContain("outil1::cd");
  });

  it("SANS MÉTA, L'APLATISSEMENT NE CHANGE RIEN, et le plan est celui d'avant", () => {
    // La condition de sûreté : le cas courant n'a pas de méta, et le plan doit y être identique.
    const noeuds = [n("cd", FICHE_CRENEAU_DEBUT), n("cf", FICHE_CRENEAU_FIN)];
    const aretes = [a("e1", "cd", "cf")];
    const plat = aplatirGraphe(noeuds, aretes, () => undefined);
    expect(planSur(plat.noeuds, plat.aretes)).toEqual(planSur(noeuds, aretes));
    expect(planSur(plat.noeuds, plat.aretes)!.boucles).toEqual([{ debutId: "cd", finsIds: ["cf"] }]);
  });
});
