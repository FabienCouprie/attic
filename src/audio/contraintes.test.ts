// audio/contraintes.test.ts — Le solveur trouve-t-il, et sait-il dire qu'il n'y a rien ?
//
// DEUX CHOSES SE VÉRIFIENT SUR UN SOLVEUR, et la seconde est la plus facile à négliger. Qu'il rende
// des solutions qui respectent les règles, ce qui se contrôle en les repassant aux règles. Et qu'il
// distingue « il n'y en a pas », qui est une réponse, de « je n'ai pas fini de chercher », qui n'en
// est pas une : un solveur qui rend une liste vide dans les deux cas laisse croire à une impasse là
// où il suffisait de chercher plus longtemps.
import { describe, expect, it } from "vitest";

import {
  domaineHauteurs, ecartMaximal, hauteurImposee, repetitionMaximale, resoudre,
  type Contrainte,
} from "./contraintes";

/** Une règle qui refuse tout : de quoi éprouver le cas sans solution. */
const impossible: Contrainte = { nom: "jamais", admet: () => false };

describe("la recherche", () => {
  it("TROUVE UNE SUITE QUI RESPECTE LES RÈGLES", () => {
    const res = resoudre([[1, 2, 3], [1, 2, 3], [1, 2, 3]], [ecartMaximal(1)], { ordonne: true });
    expect(res.solutions).toHaveLength(1);
    const s = res.solutions[0];
    for (let i = 1; i < s.length; i++) expect(Math.abs(s[i] - s[i - 1])).toBeLessThanOrEqual(1);
  });

  it("RESPECTE TOUTES LES RÈGLES À LA FOIS, non la première venue", () => {
    const res = resoudre(
      [[1, 2, 3], [1, 2, 3], [1, 2, 3]],
      [ecartMaximal(1), repetitionMaximale(1), hauteurImposee(0, 2)],
      { ordonne: true },
    );
    const s = res.solutions[0];
    expect(s[0]).toBe(2);
    for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
  });

  it("REND AUTANT DE SOLUTIONS QU'ON EN DEMANDE, et toutes différentes", () => {
    const res = resoudre([[1, 2, 3], [1, 2, 3]], [], { combien: 4, ordonne: true });
    expect(res.solutions).toHaveLength(4);
    expect(new Set(res.solutions.map(String)).size).toBe(4);
  });

  it("n'en rend jamais plus qu'il n'en existe", () => {
    const res = resoudre([[1, 2], [1, 2]], [], { combien: 99, ordonne: true });
    expect(res.solutions).toHaveLength(4);
  });
});

describe("l'absence de solution, et l'abandon, qui ne sont pas la même chose", () => {
  it("UN PROBLÈME SANS SOLUTION REND UNE LISTE VIDE SANS ABANDONNER : c'est une réponse", () => {
    const res = resoudre([[1, 2], [1, 2]], [impossible], { budget: 1000 });
    expect(res.solutions).toHaveLength(0);
    expect(res.abandonne).toBe(false);
  });

  it("UN BUDGET ÉPUISÉ LE DIT, et ne se fait pas passer pour une absence de solution", () => {
    // Un domaine large et une règle qui ne laisse presque rien passer : le budget tombe avant.
    const large = Array.from({ length: 40 }, (_, i) => i);
    const rare: Contrainte = { nom: "rare", admet: (v, i) => v[i] === i };
    const res = resoudre(new Array(12).fill(large), [rare], { budget: 20 });
    expect(res.abandonne).toBe(true);
    expect(res.noeuds).toBeLessThanOrEqual(20);
  });

  it("LA RÈGLE QUI BLOQUE EST NOMMÉE : c'est ce qui permet de desserrer un problème", () => {
    const res = resoudre([[1, 2], [1, 2]], [impossible], { budget: 1000 });
    expect(res.regleBloquante).toBe("jamais");
  });

  it("LE PLUS LOIN ATTEINT EST RENDU, pour savoir où la recherche a buté", () => {
    // Les deux premières places se remplissent, la troisième ne peut pas.
    const mur: Contrainte = { nom: "mur", admet: (_v, i) => i < 2 };
    const res = resoudre([[1], [1], [1]], [mur], { budget: 1000 });
    expect(res.solutions).toHaveLength(0);
    expect(res.meilleurPartiel).toHaveLength(2);
  });
});

describe("le tirage", () => {
  it("LA MÊME GRAINE REND LA MÊME SUITE", () => {
    const un = resoudre([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]], [], { graine: 7 });
    const deux = resoudre([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]], [], { graine: 7 });
    expect(un.solutions[0]).toEqual(deux.solutions[0]);
  });

  it("DEUX GRAINES DONNENT DEUX SUITES, ce qui est le propre d'un outil de composition", () => {
    const large = Array.from({ length: 20 }, (_, i) => i);
    const un = resoudre(new Array(6).fill(large), [], { graine: 1 });
    const deux = resoudre(new Array(6).fill(large), [], { graine: 2 });
    expect(un.solutions[0]).not.toEqual(deux.solutions[0]);
  });

  it("l'ordre du domaine est suivi quand on le demande", () => {
    const res = resoudre([[5, 3, 9], [5, 3, 9]], [], { ordonne: true });
    expect(res.solutions[0]).toEqual([5, 5]);
  });
});

describe("les règles ordinaires", () => {
  it("LE DOMAINE SE RESTREINT AUX DEGRÉS D'UNE GAMME", () => {
    const d = domaineHauteurs(60, 72, [0, 4, 7]);
    expect(d).toEqual([60, 64, 67, 72]);
  });

  it("sans degrés, il prend les douze", () => {
    expect(domaineHauteurs(60, 63)).toEqual([60, 61, 62, 63]);
  });

  it("un intervalle vide donne un domaine vide, et la recherche n'y trouve rien", () => {
    expect(domaineHauteurs(72, 60)).toEqual([]);
    expect(resoudre([[]], []).solutions).toHaveLength(0);
  });

  it("L'ÉCART MAXIMAL NE JUGE PAS LA PREMIÈRE NOTE, qui n'a rien devant elle", () => {
    expect(ecartMaximal(1).admet([99], 0, false)).toBe(true);
  });

  it("LA RÉPÉTITION SE COMPTE EN SUITE, non en total", () => {
    const r = repetitionMaximale(2);
    expect(r.admet([5, 5], 1, false)).toBe(true);
    expect(r.admet([5, 5, 5], 2, false)).toBe(false);
    expect(r.admet([5, 5, 6, 5], 3, false)).toBe(true);
  });

  it("aucune variable rend une résolution vide sans casser", () => {
    const res = resoudre([], []);
    expect(res.solutions).toHaveLength(0);
    expect(res.noeuds).toBe(0);
  });
});
