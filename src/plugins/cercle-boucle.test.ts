// plugins/cercle-boucle.test.ts — Une variation se construit-elle sur la précédente ?
//
// CE QUI SE VÉRIFIE ICI, ET QUI SÉPARE CETTE BOUCLE DES DEUX AUTRES. Les deux autres découpent une
// valeur reçue : chaque passe y reçoit un morceau différent du même tout. Celle-ci réinjecte : la
// passe k reçoit ce que la passe k−1 a produit. La différence ne se voit pas sur une rotation,
// trois rotations d'une place faisant une rotation de trois ; elle se voit sur tout le reste. Le
// miroir est une involution, donc une vraie chaîne alterne ; une permutation tirée composée avec
// elle-même n'est pas la permutation d'une autre graine. C'est exactement le défaut qui se cachait
// dans une boucle par créneau, et c'est pour cela qu'il est éprouvé ici.
import { describe, expect, it } from "vitest";

import { estCercle, estSuite, type Cercle } from "../audio/cercle";
import {
  FICHE_CERCLE_DEBUT, FICHE_CERCLE_FIN, planifierBoucles, publierBoucle, publierBoucles,
  type BoucleCourante,
} from "./boucleSequencesGlobal";
import { fiches } from "./cercle-boucle";
import { fiches as fichesTransfo } from "./cercle-transformations";

const debut = fiches.find((f) => f.id === FICHE_CERCLE_DEBUT)!;
const fin = fiches.find((f) => f.id === FICHE_CERCLE_FIN)!;
const par = (id: string) => fichesTransfo.find((f) => f.id === id)!;

const perc = (positions: number, places: number[], valeur = 36): Cercle => ({
  positions, sorte: "percussion", sommets: places.map((position) => ({ position, valeur })),
});
const melo = (positions: number, paires: [number, number][]): Cercle => ({
  positions, sorte: "hauteur", sommets: paires.map(([position, valeur]) => ({ position, valeur })),
});

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}, id = "n") => ({
  noeud: { id, data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

const places = (c: Cercle) => c.sommets.map((s) => s.position).sort((a, b) => a - b);
const sons = (c: Cercle) => c.sommets.map((s) => s.valeur);

/**
 * Ce que le pilote fait, reproduit : une passe de découverte, puis les suivantes.
 *
 * Le corps reçoit le cercle de la passe et rend celui qu'il a fabriqué, exactement comme une chaîne
 * de transformations posée entre le début et la fin.
 */
async function mener(
  source: Cercle,
  variations: number,
  corps: (recu: Cercle, passe: number) => Promise<Cercle> | Cercle,
): Promise<{ suite: Cercle[]; recus: Cercle[]; passes: number }> {
  const etat: BoucleCourante = { debutId: "d", finsIds: ["f"], index: 0, morceaux: [], recoltes: [] };
  publierBoucle(etat);
  const recus: Cercle[] = [];
  let sortie: unknown = null;
  let passes = 0;
  try {
    for (;;) {
      const d = await debut.executer!(contexte([source], { Variations: variations }, "d") as never) as any;
      const recu = d.valeurs[0] as Cercle;
      recus.push(recu);
      const produit = await corps(recu, etat.index);
      const f = await fin.executer!(contexte([produit], {}, "f") as never) as any;
      sortie = f.valeurs[0];
      passes++;
      if (etat.index >= etat.morceaux.length - 1) break;
      etat.index++;
    }
  } finally {
    publierBoucle(null);
  }
  return { suite: (Array.isArray(sortie) ? sortie : [sortie]) as Cercle[], recus, passes };
}

describe("le planificateur connaît la boucle par cercle", () => {
  it("UN DÉBUT PAR CERCLE EN EST UN, et sa fin est celle de sa sorte", () => {
    const plan = planifierBoucles(
      [{ id: "d", data: { ficheId: FICHE_CERCLE_DEBUT } }, { id: "f", data: { ficheId: FICHE_CERCLE_FIN } }],
      (id) => (id === "d" ? ["f"] : []), (id) => (id === "f" ? ["d"] : []));
    expect(plan?.boucles).toEqual([{ debutId: "d", finsIds: ["f"] }]);
    expect(plan?.independantes).toBe(false);
  });

  it("une fin de créneau ne referme pas un début de cercle", () => {
    const plan = planifierBoucles(
      [{ id: "d", data: { ficheId: FICHE_CERCLE_DEBUT } }, { id: "f", data: { ficheId: "boucle-creneau-fin" } }],
      () => [], () => []);
    expect(plan?.boucles[0].finsIds).toEqual([]);
  });
});

describe("la rétroaction", () => {
  it("LA PREMIÈRE PASSE REÇOIT LA SOURCE, LES SUIVANTES LE RÉSULTAT D'AVANT", async () => {
    const source = perc(8, [0]);
    const { recus, passes } = await mener(source, 4, (recu) => ({
      ...recu, sommets: recu.sommets.map((s) => ({ ...s, position: (s.position + 1) % 8 })),
    }));
    expect(passes).toBe(4);
    expect(recus.map(places)).toEqual([[0], [1], [2], [3]]);
  });

  it("LA FIN REND LA SUITE DES QUATRE, et non le dernier cercle seul", async () => {
    const source = perc(8, [0, 3]);
    const { suite } = await mener(source, 4, async (recu) => {
      const r = await par("cercle-tourner").executer!(contexte([recu], { Pas: "1" }) as never) as any;
      return r.valeurs[0] as Cercle;
    });
    expect(suite).toHaveLength(4);
    expect(estSuite(suite)).toBe(true);
    expect(suite.map(places)).toEqual([[1, 4], [2, 5], [3, 6], [4, 7]]);
  });

  it("UN MIROIR ALTERNE, ce qu'une quantité étalée sur les passes ne saurait pas rendre", async () => {
    // Une réflexion est une involution : appliquée deux fois elle rend le cercle de départ. Une
    // vraie chaîne donne donc miroir, source, miroir, source, et c'est la preuve que la valeur
    // circule d'une passe à l'autre plutôt que de repartir chaque fois de l'origine.
    const source = perc(8, [1, 2]);
    const { suite } = await mener(source, 4, async (recu) => {
      const r = await par("cercle-miroir").executer!(contexte([recu], { Axe: "0" }) as never) as any;
      return r.valeurs[0] as Cercle;
    });
    expect(suite.map(places)).toEqual([[6, 7], [1, 2], [6, 7], [1, 2]]);
  });

  it("UNE PERMUTATION SE COMPOSE AVEC ELLE-MÊME, et les quatre passes diffèrent", async () => {
    const source = melo(8, [[0, 60], [1, 62], [2, 64], [3, 65], [4, 67]]);
    const { suite } = await mener(source, 4, async (recu) => {
      const r = await par("cercle-permuter").executer!(contexte([recu], { Graine: "7" }) as never) as any;
      return r.valeurs[0] as Cercle;
    });
    const vus = suite.map((c) => sons(c).join(","));
    // La même graine à chaque passe : si la source était reprise, les quatre seraient identiques.
    expect(new Set(vus).size).toBeGreaterThan(1);
    // Et chaque passe garde les cinq notes, aucune ne s'est perdue en chemin.
    for (const c of suite) expect([...sons(c)].sort((a, b) => a - b)).toEqual([60, 62, 64, 65, 67]);
  });
});

describe("ce que le début et la fin rendent hors de leur chaîne", () => {
  it("sans cercle à l'entrée, chacun le dit et n'invente rien", async () => {
    publierBoucles([]);
    for (const f of [debut, fin]) {
      const r = await f.executer!(contexte([null]) as never) as any;
      expect(r.erreur, f.id).toBe(true);
      expect(r.valeurs[0], f.id).toBeNull();
    }
  });

  it("une fin sans boucle ouverte laisse passer ce qu'elle reçoit", async () => {
    publierBoucles([]);
    const r = await fin.executer!(contexte([perc(8, [0])]) as never) as any;
    expect(estCercle(r.valeurs[0])).toBe(true);
    expect(r.message).toContain("aucune boucle");
  });

  it("un début sans boucle ouverte rend la source telle quelle", async () => {
    publierBoucles([]);
    const source = perc(8, [0, 3]);
    const r = await debut.executer!(contexte([source], { Variations: 4 }) as never) as any;
    expect(places(r.valeurs[0] as Cercle)).toEqual([0, 3]);
  });
});

describe("une transformation traverse une suite", () => {
  it("ELLE S'APPLIQUE À CHACUN, et rend une suite de même longueur", async () => {
    const suite = [perc(8, [0]), perc(8, [2]), perc(8, [4])];
    publierBoucles([]);
    const r = await par("cercle-tourner").executer!(contexte([suite], { Pas: "1" }) as never) as any;
    expect(r.valeurs[0]).toHaveLength(3);
    expect((r.valeurs[0] as Cercle[]).map(places)).toEqual([[1], [3], [5]]);
  });

  it("un cercle seul reste un cercle seul, et non une suite d'un", async () => {
    publierBoucles([]);
    const r = await par("cercle-tourner").executer!(contexte([perc(8, [0])], { Pas: "1" }) as never) as any;
    expect(Array.isArray(r.valeurs[0])).toBe(false);
    expect(estCercle(r.valeurs[0])).toBe(true);
  });
});
