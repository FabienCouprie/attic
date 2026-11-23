// audio/choral-chaine.test.ts — La chaîne exacte : Viterbi contre l'énumération, le tirage contre exp(−E/T).
//
// LES ATTENDUS SONT CALCULÉS PAR FORCE BRUTE, sur des chaînes assez petites pour qu'on énumère toutes
// les suites : la meilleure est celle de plus basse énergie, et la probabilité exacte d'une suite est
// exp(−E/T) divisée par la somme sur toutes. Les graines sont fixées : le test ne dépend d'aucun
// tirage heureux, et la borne statistique est écrite (voir le dernier cas).

import { describe, expect, it } from "vitest";
import { creerAleatoire } from "../core/hasard";
import { energieDe, meilleureSuite, suiteTiree, type Chaine } from "./choral-chaine";

/** Une chaîne d'énergies tirées au hasard, à graine fixée. */
function chaineAuHasard(graine: number, longueur: number, largeur: number): Chaine {
  const a = creerAleatoire(graine);
  const colonnes = Array.from({ length: longueur }, () => Array.from({ length: largeur }, () => a() * 4));
  const passages = Array.from({ length: longueur - 1 }, () => Array.from({ length: largeur }, () => Array.from({ length: largeur }, () => a() * 4)));
  return { colonnes, passage: (t, i, j) => passages[t][i][j] };
}

/** Toutes les suites d'une chaîne. */
function toutes(chaine: Chaine): number[][] {
  let suites: number[][] = [[]];
  for (const col of chaine.colonnes) suites = suites.flatMap((s) => col.map((_, j) => [...s, j]));
  return suites;
}

describe("meilleureSuite", () => {
  it("rend la suite que l'énumération trouve, sur vingt chaînes tirées", async () => {
    for (let g = 1; g <= 20; g++) {
      const c = chaineAuHasard(g, 5, 4);
      const brute = toutes(c).map((s) => ({ s, e: energieDe(c, s) })).sort((x, y) => x.e - y.e)[0];
      const v = await meilleureSuite(c);
      expect(v.energie).toBeCloseTo(brute.e, 9);
      expect(v.choix).toEqual(brute.s);
    }
  });
});

describe("suiteTiree", () => {
  it("rend la même suite à graine égale", async () => {
    const c = chaineAuHasard(7, 6, 5);
    const a = await suiteTiree(c, 1, creerAleatoire(42));
    const b = await suiteTiree(c, 1, creerAleatoire(42));
    expect(b).toEqual(a);
  });

  it("tire chaque suite selon exp(−E/T), à moins d'un centième près", async () => {
    // 27 suites ; 40 000 tirages. L'écart type d'une fréquence vaut au plus √(1/4 · 1/40 000) = 0,0025 :
    // la borne de 0,01 en fait quatre, et la graine fixe rend le test reproductible.
    const c = chaineAuHasard(3, 3, 3);
    const T = 1.5;
    const suites = toutes(c);
    const poids = suites.map((s) => Math.exp(-energieDe(c, s) / T));
    const z = poids.reduce((x, y) => x + y, 0);
    const vus = new Map<string, number>();
    const a = creerAleatoire(2026);
    const N = 40000;
    for (let k = 0; k < N; k++) {
      const cle = (await suiteTiree(c, T, a)).choix.join(",");
      vus.set(cle, (vus.get(cle) ?? 0) + 1);
    }
    const ecart = Math.max(...suites.map((s, k) => Math.abs((vus.get(s.join(",")) ?? 0) / N - poids[k] / z)));
    expect(ecart).toBeLessThan(0.01);
  }, 60_000);
});
