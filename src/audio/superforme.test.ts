// audio/superforme.test.ts — Une équation, et toutes les figures.
//
// CE QUE CES TESTS TIENNENT. Que les cas connus de la superformule tombent bien sur les figures
// qu'ils nomment : un cercle a un rayon constant, un losange vaut un sur ses pointes et la racine
// de deux sur ses côtés. Sans ces repères, « Losange » serait un nom posé sur des nombres que rien
// ne vérifie.
import { describe, expect, it } from "vitest";

import {
  FIGURES, melangerFigures, NOMS_FIGURES, pointsSuperforme, rayonSuperforme,
} from "./superforme";

describe("la superformule", () => {
  it("UN CERCLE A UN RAYON CONSTANT, quel que soit l'angle", () => {
    for (const a of [0, 0.7, 1.9, 3.3, 5.8]) {
      expect(rayonSuperforme(a, FIGURES.Cercle), `angle ${a}`).toBeCloseTo(1, 9);
    }
  });

  it("UN LOSANGE VAUT UN SUR SES POINTES ET 0,707 SUR SES CÔTÉS", () => {
    // m = 4, n = 1 : |cos θ| + |sin θ|, inversé. À 0 la somme vaut 1, à 45° elle vaut √2.
    expect(rayonSuperforme(0, FIGURES.Losange)).toBeCloseTo(1, 9);
    expect(rayonSuperforme(Math.PI / 4, FIGURES.Losange)).toBeCloseTo(1 / Math.SQRT2, 9);
    expect(rayonSuperforme(Math.PI / 2, FIGURES.Losange)).toBeCloseTo(1, 9);
  });

  it("un ovale est plus large que haut, dans le rapport de ses demi-axes", () => {
    const p = pointsSuperforme(FIGURES.Ovale, 360);
    const largeur = Math.max(...p.map((q) => Math.abs(q.x)));
    const hauteur = Math.max(...p.map((q) => Math.abs(q.y)));
    expect(largeur / hauteur).toBeCloseTo(1 / 0.55, 1);
  });

  it("UNE ÉTOILE ALTERNE CREUX ET POINTES, ce qu'un polygone ne fait pas", () => {
    const rayon = (f: typeof FIGURES.Étoile, n: number) =>
      Array.from({ length: n }, (_, i) => rayonSuperforme((i / n) * Math.PI * 2, f));
    const etoile = rayon(FIGURES.Étoile, 200);
    const hexagone = rayon(FIGURES.Hexagone, 200);
    const creux = (v: number[]) => Math.max(...v) / Math.min(...v);
    // L'étoile a un rapport pointe sur creux bien plus grand que le polygone presque circulaire.
    expect(creux(etoile)).toBeGreaterThan(2);
    // L'hexagone régulier vaut 1,155 ; celui-ci mesure 1,122, là où l'étoile dépasse 2.
    expect(creux(hexagone)).toBeLessThan(1.2);
  });

  it("LE RAYON EST RAMENÉ À UN, sans quoi changer de figure changerait aussi la taille", () => {
    for (const nom of NOMS_FIGURES) {
      const p = pointsSuperforme(FIGURES[nom], 240);
      const max = Math.max(...p.map((q) => Math.hypot(q.x, q.y)));
      expect(max, nom).toBeCloseTo(1, 6);
      for (const q of p) {
        expect(Number.isFinite(q.x) && Number.isFinite(q.y), nom).toBe(true);
      }
    }
  });

  it("un demi-axe nul ne fait pas exploser la figure", () => {
    expect(rayonSuperforme(0.3, { m: 4, n1: 1, n2: 1, n3: 1, a: 0, b: 0 })).toBeGreaterThan(0);
    expect(Number.isFinite(rayonSuperforme(0.3, { m: 4, n1: 0, n2: 1, n3: 1, a: 1, b: 1 }))).toBe(true);
  });

  it("LE MÉLANGE RESTE DANS LA FAMILLE : toute étape entre deux figures en est une", () => {
    for (const part of [0, 0.25, 0.5, 0.75, 1]) {
      const f = melangerFigures(FIGURES.Losange, FIGURES.Étoile, part);
      const p = pointsSuperforme(f, 180);
      expect(p.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)), `part ${part}`).toBe(true);
      expect(Math.max(...p.map((q) => Math.hypot(q.x, q.y))), `part ${part}`).toBeCloseTo(1, 6);
    }
    // Les deux bouts rendent exactement les deux figures.
    expect(melangerFigures(FIGURES.Losange, FIGURES.Étoile, 0)).toEqual(FIGURES.Losange);
    expect(melangerFigures(FIGURES.Losange, FIGURES.Étoile, 1)).toEqual(FIGURES.Étoile);
  });

  it("il y a de quoi choisir, et chaque nom désigne des nombres distincts", () => {
    expect(NOMS_FIGURES.length).toBeGreaterThanOrEqual(12);
    const vus = new Set(NOMS_FIGURES.map((n) => JSON.stringify(FIGURES[n])));
    expect(vus.size).toBe(NOMS_FIGURES.length);
  });
});
