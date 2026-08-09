// audio/algebre.test.ts
import { describe, it, expect } from "vitest";
import { calculerPCA, standardiser, kmeans, indiceCalinskiHarabasz, kmeansAuto, gmm } from "./algebre";

function dot(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}

function norme(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

describe("calculerPCA", () => {
  it("capture la direction dominante sur des données parfaitement corrélées (rang 1)", () => {
    // Points exactement alignés sur y = 2x : toute la variance est portée par
    // un seul axe, colinéaire à (1, 2)/√5.
    const donnees = [
      [-2, -4], [-1, -2], [0, 0], [1, 2], [2, 4], [3, 6],
    ];
    const res = calculerPCA(donnees, 2);
    expect(res.varianceExpliquee[0]).toBeCloseTo(1, 5);
    expect(res.varianceExpliquee[1]).toBeCloseTo(0, 5);

    const attendu = [1 / Math.sqrt(5), 2 / Math.sqrt(5)];
    const alignement = Math.abs(dot(res.axes[0], attendu));
    expect(alignement).toBeCloseTo(1, 5); // colinéaire (à un signe près)
  });

  it("les axes retournés sont unitaires et orthogonaux entre eux", () => {
    const donnees = [
      [1, 2, 3], [4, 1, 0], [2, 5, 1], [0, 0, 2], [3, 3, 3], [5, 1, 4],
    ];
    const res = calculerPCA(donnees, 3);
    for (const axe of res.axes) expect(norme(axe)).toBeCloseTo(1, 6);
    for (let i = 0; i < res.axes.length; i++) {
      for (let j = i + 1; j < res.axes.length; j++) {
        expect(Math.abs(dot(res.axes[i], res.axes[j]))).toBeLessThan(1e-6);
      }
    }
  });

  it("en gardant tous les axes, la reconstruction retombe sur les données d'origine", () => {
    const donnees = [
      [1, 2, 3], [4, 1, 0], [2, 5, 1], [0, 0, 2], [3, 3, 3], [5, 1, 4],
    ];
    const res = calculerPCA(donnees, 3);
    for (let i = 0; i < donnees.length; i++) {
      const reconstruit = res.moyennes.map(
        (m, j) => m + res.coordonnees[i].reduce((s, c, k) => s + c * res.axes[k][j], 0),
      );
      for (let j = 0; j < donnees[i].length; j++) {
        expect(reconstruit[j]).toBeCloseTo(donnees[i][j], 5);
      }
    }
  });

  it("la variance expliquée est décroissante et sa somme ne dépasse pas 1", () => {
    const donnees = [
      [1, 2, 3, 1], [4, 1, 0, 2], [2, 5, 1, 0], [0, 0, 2, 3], [3, 3, 3, 1], [5, 1, 4, 2],
    ];
    const res = calculerPCA(donnees, 4);
    for (let i = 1; i < res.varianceExpliquee.length; i++) {
      expect(res.varianceExpliquee[i]).toBeLessThanOrEqual(res.varianceExpliquee[i - 1] + 1e-9);
    }
    const somme = res.varianceExpliquee.reduce((s, v) => s + v, 0);
    expect(somme).toBeLessThanOrEqual(1 + 1e-6);
  });

  it("ne plante pas sur des échantillons identiques (variance nulle)", () => {
    const donnees = [[2, 2], [2, 2], [2, 2], [2, 2]];
    const res = calculerPCA(donnees, 2);
    for (const v of res.valeursPropres) expect(v).toBeCloseTo(0, 9);
    for (const c of res.coordonnees) for (const x of c) expect(x).toBeCloseTo(0, 6);
    expect(res.valeursPropres.some((v) => Number.isNaN(v))).toBe(false);
  });

  it("plafonne silencieusement nbAxes au nombre de features disponibles", () => {
    const donnees = [[1, 2], [3, 4], [5, 1], [2, 2]];
    const res = calculerPCA(donnees, 10);
    expect(res.axes.length).toBe(2);
    expect(res.coordonnees[0].length).toBe(2);
  });
});

describe("standardiser", () => {
  it("chaque colonne obtient une moyenne ~0 et un écart-type ~1", () => {
    const donnees = [[100, 1, -5], [200, 2, 0], [300, 3, 5], [400, 4, 10]];
    const res = standardiser(donnees);
    const d = 3;
    for (let j = 0; j < d; j++) {
      const colonne = res.donnees.map((l) => l[j]);
      const moyenne = colonne.reduce((s, v) => s + v, 0) / colonne.length;
      const variance = colonne.reduce((s, v) => s + (v - moyenne) ** 2, 0) / colonne.length;
      expect(moyenne).toBeCloseTo(0, 6);
      expect(Math.sqrt(variance)).toBeCloseTo(1, 6);
    }
  });

  it("met à 0 une colonne à variance nulle plutôt que de produire NaN", () => {
    const donnees = [[1, 7], [2, 7], [3, 7], [4, 7]];
    const res = standardiser(donnees);
    for (const ligne of res.donnees) {
      expect(ligne[1]).toBe(0);
      expect(Number.isFinite(ligne[1])).toBe(true);
    }
  });
});

// 3 groupes bien séparés (écart ~20-28) et compacts (écart interne ~1.4) —
// réutilisés par les trois blocs de tests ci-dessous.
const BLOB_A = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]];
const BLOB_B = [[20, 20], [21, 20], [20, 21], [21, 21], [20.5, 20.5]];
const BLOB_C = [[0, 20], [1, 20], [0, 21], [1, 21], [0.5, 20.5]];
const DONNEES_3_GROUPES = [...BLOB_A, ...BLOB_B, ...BLOB_C];

describe("kmeans", () => {
  it("retrouve 3 groupes bien séparés", () => {
    const res = kmeans(DONNEES_3_GROUPES, 3, 42);
    const labelA = res.assignations[0];
    const labelB = res.assignations[5];
    const labelC = res.assignations[10];
    expect(new Set([labelA, labelB, labelC]).size).toBe(3);
    for (let i = 0; i < 5; i++) expect(res.assignations[i]).toBe(labelA);
    for (let i = 5; i < 10; i++) expect(res.assignations[i]).toBe(labelB);
    for (let i = 10; i < 15; i++) expect(res.assignations[i]).toBe(labelC);
  });

  it("est déterministe avec la même graine", () => {
    const a = kmeans(DONNEES_3_GROUPES, 3, 7);
    const b = kmeans(DONNEES_3_GROUPES, 3, 7);
    expect(a.assignations).toEqual(b.assignations);
    expect(a.centres).toEqual(b.centres);
  });

  it("plafonne k au nombre d'échantillons et ne plante pas sur des points dupliqués", () => {
    const res = kmeans([[1, 1], [1, 1], [1, 1]], 10, 1);
    expect(res.k).toBe(3);
    expect(res.assignations.length).toBe(3);
    for (const c of res.centres) for (const v of c) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("indiceCalinskiHarabasz", () => {
  it("donne un score bien plus élevé pour un regroupement correct que pour un découpage arbitraire", () => {
    const bon = kmeans(DONNEES_3_GROUPES, 3, 42);
    const scoreBon = indiceCalinskiHarabasz(DONNEES_3_GROUPES, bon.assignations, bon.centres);

    // Découpage arbitraire (un groupe sur trois par index), sans rapport avec
    // la structure réelle des données.
    const assignationsArbitraires = DONNEES_3_GROUPES.map((_, i) => i % 3);
    const centresArbitraires = [0, 1, 2].map((c) => {
      const pts = DONNEES_3_GROUPES.filter((_, i) => assignationsArbitraires[i] === c);
      const d = pts[0].length;
      return Array.from({ length: d }, (_, j) => pts.reduce((s, p) => s + p[j], 0) / pts.length);
    });
    const scoreArbitraire = indiceCalinskiHarabasz(DONNEES_3_GROUPES, assignationsArbitraires, centresArbitraires);

    expect(scoreBon).toBeGreaterThan(scoreArbitraire * 5);
  });

  it("est indéfini (-Infinity) hors de 2 ≤ k < n", () => {
    expect(indiceCalinskiHarabasz(DONNEES_3_GROUPES, DONNEES_3_GROUPES.map(() => 0), [[0, 0]])).toBe(-Infinity);
  });
});

describe("kmeansAuto", () => {
  it("retrouve automatiquement k = 3 sur des données à 3 groupes bien séparés", () => {
    const res = kmeansAuto(DONNEES_3_GROUPES, 6, 42);
    expect(res.k).toBe(3);
    expect(res.scoresCalinskiHarabasz.length).toBe(5); // k = 2..6
  });

  it("refuse de fonctionner avec moins de 3 échantillons", () => {
    expect(() => kmeansAuto([[0, 0], [1, 1]], 5)).toThrow();
  });
});

describe("gmm", () => {
  it("assigne une probabilité proche de 1 au bon groupe sur des données bien séparées", () => {
    const res = gmm(DONNEES_3_GROUPES, 3, 42);
    const labelA = res.probabilites[0].indexOf(Math.max(...res.probabilites[0]));
    const labelB = res.probabilites[5].indexOf(Math.max(...res.probabilites[5]));
    const labelC = res.probabilites[10].indexOf(Math.max(...res.probabilites[10]));
    expect(new Set([labelA, labelB, labelC]).size).toBe(3);

    for (let i = 0; i < 5; i++) expect(res.probabilites[i][labelA]).toBeGreaterThan(0.99);
    for (let i = 5; i < 10; i++) expect(res.probabilites[i][labelB]).toBeGreaterThan(0.99);
    for (let i = 10; i < 15; i++) expect(res.probabilites[i][labelC]).toBeGreaterThan(0.99);
  });

  it("chaque ligne de probabilités somme à 1", () => {
    const res = gmm(DONNEES_3_GROUPES, 3, 1);
    for (const ligne of res.probabilites) {
      const somme = ligne.reduce((s, v) => s + v, 0);
      expect(somme).toBeCloseTo(1, 6);
    }
  });

  it("est déterministe avec la même graine", () => {
    const a = gmm(DONNEES_3_GROUPES, 3, 7);
    const b = gmm(DONNEES_3_GROUPES, 3, 7);
    expect(a.probabilites).toEqual(b.probabilites);
    expect(a.logVraisemblance).toBe(b.logVraisemblance);
  });

  it("ne plante pas sur des points dupliqués (covariance quasi-singulière)", () => {
    const res = gmm([[1, 1], [1, 1], [1, 1], [1, 1]], 2, 1);
    expect(res.probabilites.length).toBe(4);
    for (const ligne of res.probabilites) {
      for (const v of ligne) expect(Number.isFinite(v)).toBe(true);
      expect(ligne.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
    }
    expect(Number.isFinite(res.logVraisemblance)).toBe(true);
  });

  it("plafonne k au nombre d'échantillons disponibles", () => {
    const res = gmm([[0, 0], [5, 5]], 10, 1);
    expect(res.composantes.length).toBe(2);
  });
});
