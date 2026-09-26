// audio/morphologie.test.ts — La forme d'une suite, et ce que deux suites ont en commun.
import { describe, expect, it } from "vitest";

import {
  analyseContrastive, distanceEdition, motifsRepetes, profilPrimaire, similarite,
} from "./morphologie";

describe("le profil primaire", () => {
  it("garde le geste et jette les valeurs", () => {
    expect(profilPrimaire([60, 62, 64, 62, 62])).toEqual([1, 1, -1, 0]);
  });

  it("EST LE MÊME POUR UNE MÉLODIE TRANSPOSÉE, ce qui est toute la raison d'être du procédé", () => {
    const melodie = [60, 64, 67, 65, 60];
    expect(profilPrimaire(melodie.map((n) => n + 7))).toEqual(profilPrimaire(melodie));
  });

  it("et pour une mélodie dilatée, les intervalles fussent-ils doublés", () => {
    const melodie = [60, 64, 67, 65];
    const dilatee = melodie.map((n) => 60 + (n - 60) * 2);
    expect(profilPrimaire(dilatee)).toEqual(profilPrimaire(melodie));
  });

  it("la tolérance décide de ce qui compte pour un mouvement", () => {
    // Un quart de ton n'est pas forcément un geste : sous la tolérance, la suite est jugée plate.
    expect(profilPrimaire([60, 60.5, 60])).toEqual([1, -1]);
    expect(profilPrimaire([60, 60.5, 60], 0.5)).toEqual([0, 0]);
  });

  it("rend une liste vide sur une suite d'une seule valeur, un geste demandant deux points", () => {
    expect(profilPrimaire([60])).toEqual([]);
    expect(profilPrimaire([])).toEqual([]);
  });
});

describe("la distance d'édition", () => {
  it("RETROUVE L'EXEMPLE CANONIQUE : kitten vers sitting vaut trois", () => {
    expect(distanceEdition([..."kitten"], [..."sitting"])).toBe(3);
  });

  it("vaut zéro entre deux suites identiques, et la longueur face au vide", () => {
    expect(distanceEdition([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(distanceEdition([1, 2, 3], [])).toBe(3);
    expect(distanceEdition([], [])).toBe(0);
  });

  it("compte une insertion, une suppression et une substitution chacune pour une", () => {
    expect(distanceEdition([1, 2, 3], [1, 2, 3, 4])).toBe(1);
    expect(distanceEdition([1, 2, 3], [1, 3])).toBe(1);
    expect(distanceEdition([1, 2, 3], [1, 9, 3])).toBe(1);
  });

  it("est symétrique", () => {
    expect(distanceEdition([1, 2, 3, 4], [4, 3, 2])).toBe(distanceEdition([4, 3, 2], [1, 2, 3, 4]));
  });
});

describe("la ressemblance", () => {
  it("vaut un pour deux suites identiques et zéro pour deux suites sans rien de commun", () => {
    expect(similarite([1, 2, 3], [1, 2, 3])).toBe(1);
    expect(similarite([1, 2, 3], [7, 8, 9])).toBe(0);
  });

  it("DEUX SUITES VIDES SE RESSEMBLENT, au lieu de rendre NaN", () => {
    // Sans ce cas, la division par la longueur propagerait un NaN dans le rapport d'analyse.
    expect(similarite([], [])).toBe(1);
    expect(Number.isNaN(similarite([], []))).toBe(false);
  });

  it("reste entre zéro et un quelles que soient les longueurs", () => {
    for (const [a, b] of [[[1], [1, 2, 3, 4, 5]], [[1, 2, 3], [3, 2, 1]], [[], [1]]] as number[][][]) {
      const s = similarite(a, b);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe("les motifs répétés", () => {
  it("trouve une figure qui revient, et dit où", () => {
    const suite = [1, 2, 3, 9, 1, 2, 3, 8];
    const m = motifsRepetes(suite, 3);
    expect(m[0].motif).toEqual([1, 2, 3]);
    expect(m[0].positions).toEqual([0, 4]);
  });

  it("NE REND PAS LES SOUS-FIGURES D'UN MOTIF DÉJÀ RETENU, qui diraient la même chose", () => {
    const suite = [1, 2, 3, 4, 5, 9, 1, 2, 3, 4, 5];
    const m = motifsRepetes(suite, 2);
    expect(m[0].motif).toEqual([1, 2, 3, 4, 5]);
    // Les quatre sous-figures de longueur deux à quatre sont couvertes par elle.
    expect(m.length).toBe(1);
  });

  it("ne rend rien quand rien ne revient", () => {
    expect(motifsRepetes([1, 2, 3, 4, 5, 6], 3)).toEqual([]);
  });

  it("le nombre d'occurrences demandé filtre", () => {
    const suite = [1, 2, 1, 2, 1, 2];
    expect(motifsRepetes(suite, 2, 3).length).toBeGreaterThan(0);
    expect(motifsRepetes(suite, 2, 4)).toEqual([]);
  });
});

describe("l'analyse contrastive", () => {
  it("SÉPARE CE QUI SE RESSEMBLE EN VALEUR DE CE QUI SE RESSEMBLE EN FORME", () => {
    // Une mélodie transposée de sept demi-tons n'a aucune note commune et exactement la même forme.
    const a = [60, 64, 67, 65];
    const b = a.map((n) => n + 7);
    const c = analyseContrastive(a, b);
    expect(c.surLesValeurs).toBe(0);
    expect(c.surLeProfil).toBe(1);
    expect(c.transposition).toBe(7);
    expect(c.divergences).toEqual([]);
  });

  it("dit où les deux formes se séparent", () => {
    const c = analyseContrastive([60, 62, 64], [60, 62, 61]);
    expect(c.divergences).toEqual([1]);
    expect(c.transposition).toBe(null);
  });

  it("ne voit pas de transposition là où les longueurs diffèrent", () => {
    expect(analyseContrastive([60, 62], [67, 69, 71]).transposition).toBe(null);
  });

  it("ne bute pas sur deux suites vides", () => {
    const c = analyseContrastive([], []);
    expect(c.surLesValeurs).toBe(1);
    expect(c.surLeProfil).toBe(1);
    expect(c.divergences).toEqual([]);
  });
});
