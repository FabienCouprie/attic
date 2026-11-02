// core/graines-de-passe.test.ts — Le résolveur de graines rend, au bit près, ce que rendait la
// fermeture du moteur qu'il remplace.
//
// LE TÉMOIN EST L'ANCIENNE FERMETURE, recopiée telle quelle depuis `useExecutionGraphe.ts`, avec le
// tirage rendu déterministe des deux côtés : un compteur, appelé dans le même ordre. Si une graine,
// une base partagée ou une graine tirée différait, un graphe à boucle rejouerait autrement sous la
// même graine, et ce cas le dirait.
import { describe, expect, it } from "vitest";

import { creerResolveurDeGraines } from "./graines-de-passe";
import { graineDuTour } from "./hasard";

/** L'ancienne fermeture, à l'identique, `resoudreGraine` remplacée par `tirer`. */
function ancienResolveur(deplie: { toursDesCopies: Map<string, number>; origines: Map<string, string> },
  plat: { expansions: Map<string, string> }, tirer: (brut: number) => number) {
  const graines = new Map<string, number>();
  const basesDeGraine = new Map<string, number>();
  const grainesTirees = new Map<string, { nom: string; valeur: number }[]>();
  const graineDuNoeud = (nodeId: string, nom: string, brut: number): number => {
    const cle = `${nodeId}|${nom}`;
    const deja = graines.get(cle);
    if (deja !== undefined) return deja;
    const tour = deplie.toursDesCopies.get(nodeId);
    const origine = deplie.origines.get(nodeId);
    let valeur: number;
    let base: number;
    if (tour === undefined && origine === undefined) {
      valeur = base = tirer(brut);
    } else {
      const cleBase = `${origine ?? nodeId}|${nom}`;
      const deja = basesDeGraine.get(cleBase);
      base = deja ?? tirer(brut);
      if (deja === undefined) basesDeGraine.set(cleBase, base);
      valeur = tour === undefined ? base : graineDuTour(base, tour);
    }
    graines.set(cle, valeur);
    if (!(brut > 0)) {
      const visible = plat.expansions.get(nodeId) ?? nodeId;
      const liste = grainesTirees.get(visible) ?? [];
      if (!liste.some((g) => g.nom === nom)) liste.push({ nom, valeur: base });
      grainesTirees.set(visible, liste);
    }
    return valeur;
  };
  return { graineDuNoeud, grainesTirees };
}

/** Un tirage sans hasard : brut posé rendu tel quel, brut nul remplacé par un compteur. */
const tirageCompte = () => { let n = 1000; return (brut: number) => (brut > 0 ? Math.floor(brut) : ++n); };

/** Une boucle de trois tours sur « gen » dans le méta « m », un instrument à deux notes sur « osc ». */
const TABLES = {
  toursDesCopies: new Map([["m::gen#0", 0], ["m::gen#1", 1], ["m::gen#2", 2]]),
  origines: new Map([["m::gen#0", "m::gen"], ["m::gen#1", "m::gen"], ["m::gen#2", "m::gen"], ["osc~1", "osc"], ["osc~2", "osc"]]),
  expansions: new Map([["m::gen#0", "m"], ["m::gen#1", "m"], ["m::gen#2", "m"], ["m::gen", "m"], ["osc~1", "osc"], ["osc~2", "osc"]]),
};

/** Les lectures d'une passe, dans l'ordre où le moteur les ferait : copies, racines, relectures. */
const LECTURES: [string, string, number][] = [
  ["m::gen#0", "Graine", 0], ["m::gen#1", "Graine", 0], ["m::gen#2", "Graine", 0],
  ["osc~1", "Graine", 0], ["osc~2", "Graine", 0], ["osc~1", "Graine", 0],
  ["bruit", "Graine", 0], ["bruit", "Graine", 0], ["bruit", "Détune", 7.9],
  ["m::gen#1", "Graine", 0], ["m::gen#0", "Autre", 42],
];

describe("les graines d'une passe, résolues au centre", () => {
  it("rend les mêmes graines et les mêmes tirages que l'ancienne fermeture, lecture par lecture", () => {
    const neuf = creerResolveurDeGraines({ ...TABLES, tirer: tirageCompte() });
    const ancien = ancienResolveur(
      { toursDesCopies: TABLES.toursDesCopies, origines: TABLES.origines }, { expansions: TABLES.expansions }, tirageCompte());
    const valeursNeuves = LECTURES.map(([id, nom, brut]) => neuf.graineDuNoeud(id, nom, brut));
    const valeursAnciennes = LECTURES.map(([id, nom, brut]) => ancien.graineDuNoeud(id, nom, brut));
    expect(valeursNeuves).toEqual(valeursAnciennes);
    expect([...neuf.grainesTirees]).toEqual([...ancien.grainesTirees]);
  });

  it("les trois tours d'une boucle partagent une base, et c'est la base qui est rendue au nœud visible", () => {
    const r = creerResolveurDeGraines({ ...TABLES, tirer: tirageCompte() });
    const tours = [0, 1, 2].map((t) => r.graineDuNoeud(`m::gen#${t}`, "Graine", 0));
    expect(tours).toEqual([0, 1, 2].map((t) => graineDuTour(1001, t)));
    expect(r.grainesTirees.get("m")).toEqual([{ nom: "Graine", valeur: 1001 }]);
  });

  it("une graine posée n'est pas tirée, et deux lectures rendent la même valeur", () => {
    const r = creerResolveurDeGraines({ ...TABLES, tirer: tirageCompte() });
    expect(r.graineDuNoeud("bruit", "Graine", 7)).toBe(7);
    expect(r.graineDuNoeud("bruit", "Graine", 7)).toBe(7);
    expect(r.grainesTirees.size).toBe(0);
  });
});
