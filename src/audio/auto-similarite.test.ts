// audio/auto-similarite.test.ts — Sur une forme connue, les frontières doivent tomber juste.
//
// Le test qui compte est celui-ci : on fabrique une suite de trames en trois sections
// A-B-A, on sait donc exactement où sont les articulations, et l'on vérifie que la courbe
// de nouveauté y place ses pics. Le reste tient les propriétés de la matrice — symétrique,
// diagonale à un — et le comportement du noyau en damier, qui est la seule pièce un peu
// subtile du procédé.
import { describe, expect, it } from "vitest";
import {
  cosinus, courbeNouveaute, frontieres, matriceEnSvg, matriceSimilarite, noyauDamier, regrouper,
  segments,
} from "./auto-similarite";

/** Des trames de douze valeurs, comme un chromagramme. */
const trame = (notes: number[]): number[] =>
  Array.from({ length: 12 }, (_, i) => (notes.includes(i) ? 1 : 0.02));

const DO = trame([0, 4, 7]);
const FA = trame([5, 9, 0]);
const SOL = trame([7, 11, 2]);

/** Un morceau A-B-A : trente trames de do, trente de sol, trente de do. */
function morceau(): number[][] {
  return [
    ...Array.from({ length: 30 }, () => DO),
    ...Array.from({ length: 30 }, () => SOL),
    ...Array.from({ length: 30 }, () => DO),
  ];
}

describe("similarité", () => {
  it("vaut un pour deux trames identiques, et moins pour deux différentes", () => {
    expect(cosinus(DO, DO)).toBeCloseTo(1, 10);
    expect(cosinus(DO, SOL)).toBeLessThan(1);
    // Deux notes communes valent mieux qu'une : do–la mineur contre do–sol. Fa majeur et
    // sol majeur, eux, partagent chacun exactement une note avec do et se valent donc —
    // la parenté tonale ne se lit pas dans un simple recouvrement de notes.
    const LAm = trame([9, 0, 4]);
    expect(cosinus(DO, LAm)).toBeGreaterThan(cosinus(DO, SOL));
    expect(cosinus(DO, FA)).toBeCloseTo(cosinus(DO, SOL), 10);
  });

  it("rend zéro plutôt que NaN face à une trame vide", () => {
    expect(cosinus(DO, new Array(12).fill(0))).toBe(0);
    expect(cosinus([], [])).toBe(0);
  });
});

describe("regroupement", () => {
  it("moyenne les trames par paquets", () => {
    const trames = [[1, 0], [3, 0], [0, 2], [0, 4]];
    expect(regrouper(trames, 2)).toEqual([[2, 0], [0, 3]]);
  });

  it("ne touche à rien au facteur 1", () => {
    const trames = [[1, 2], [3, 4]];
    expect(regrouper(trames, 1)).toBe(trames);
    expect(regrouper(trames, 0)).toBe(trames);
  });

  it("garde le dernier paquet même incomplet", () => {
    expect(regrouper([[2], [4], [9]], 2)).toEqual([[3], [9]]);
  });

  it("ne rend rien de rien", () => {
    expect(regrouper([], 4)).toEqual([]);
  });
});

describe("matrice", () => {
  const m = matriceSimilarite([DO, SOL, DO, FA]);

  it("est symétrique", () => {
    for (let i = 0; i < m.length; i++) {
      for (let j = 0; j < m.length; j++) expect(m[i][j], `${i},${j}`).toBeCloseTo(m[j][i], 12);
    }
  });

  it("a une diagonale à un", () => {
    for (let i = 0; i < m.length; i++) expect(m[i][i]).toBe(1);
  });

  it("marque les répétitions hors diagonale", () => {
    // Les trames 0 et 2 sont identiques : la case (0, 2) doit être claire.
    expect(m[0][2]).toBeCloseTo(1, 10);
    expect(m[0][1]).toBeLessThan(m[0][2]);
  });

  it("ne rend rien d'un morceau vide", () => {
    expect(matriceSimilarite([])).toEqual([]);
  });
});

describe("noyau en damier", () => {
  it("oppose les quadrants diagonaux aux autres", () => {
    const k = noyauDamier(4);
    expect(k.length).toBe(8);
    expect(k[1][1]).toBeGreaterThan(0);   // haut-gauche
    expect(k[6][6]).toBeGreaterThan(0);   // bas-droite
    expect(k[1][6]).toBeLessThan(0);      // hors diagonale
    expect(k[6][1]).toBeLessThan(0);
  });

  it("somme à peu près zéro : un passage homogène ne l'excite pas", () => {
    const k = noyauDamier(8);
    const somme = k.flat().reduce((a, b) => a + b, 0);
    expect(Math.abs(somme)).toBeLessThan(1e-9);
  });

  it("décroît en s'éloignant du centre", () => {
    const k = noyauDamier(8);
    expect(Math.abs(k[7][7])).toBeGreaterThan(Math.abs(k[0][0]));
  });
});

describe("nouveauté et frontières", () => {
  const m = matriceSimilarite(morceau());
  const courbe = courbeNouveaute(m, 8);

  it("place ses pics aux articulations du morceau", () => {
    const trouvees = frontieres(courbe, 0.5, 5);
    expect(trouvees.length).toBe(2);
    // Les vraies frontières sont aux trames 30 et 60, à deux trames près.
    expect(Math.abs(trouvees[0] - 30)).toBeLessThanOrEqual(2);
    expect(Math.abs(trouvees[1] - 60)).toBeLessThanOrEqual(2);
  });

  it("ne détecte aucune frontière dans un morceau homogène", () => {
    const plat = matriceSimilarite(Array.from({ length: 90 }, () => DO));
    expect(frontieres(courbeNouveaute(plat, 8), 0.5, 5)).toEqual([]);
  });

  it("laisse les bords à zéro plutôt que d'inventer des pics", () => {
    for (let i = 0; i < 8; i++) {
      expect(courbe[i], `début ${i}`).toBe(0);
      expect(courbe[courbe.length - 1 - i], `fin ${i}`).toBe(0);
    }
  });

  it("rend une courbe entre zéro et un", () => {
    for (const v of courbe) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("n'entasse pas plusieurs frontières sur la même articulation", () => {
    const serrees = frontieres(courbe, 0.2, 1);
    const espacees = frontieres(courbe, 0.2, 10);
    expect(espacees.length).toBeLessThanOrEqual(serrees.length);
    for (let i = 1; i < espacees.length; i++) {
      expect(espacees[i] - espacees[i - 1]).toBeGreaterThanOrEqual(10);
    }
  });

  it("trouve d'autant plus de frontières que le seuil est bas", () => {
    expect(frontieres(courbe, 0.1, 5).length).toBeGreaterThanOrEqual(frontieres(courbe, 0.9, 5).length);
  });
});

describe("segments", () => {
  it("découpe le morceau aux frontières, sans trou ni chevauchement", () => {
    const s = segments([30, 60], 90);
    expect(s).toEqual([{ debut: 0, fin: 30 }, { debut: 30, fin: 60 }, { debut: 60, fin: 90 }]);
  });

  it("rend un seul segment quand il n'y a aucune frontière", () => {
    expect(segments([], 50)).toEqual([{ debut: 0, fin: 50 }]);
  });

  it("ignore une frontière hors du morceau", () => {
    expect(segments([-5, 20, 999], 50)).toEqual([{ debut: 0, fin: 20 }, { debut: 20, fin: 50 }]);
  });
});

describe("image", () => {
  it("rend un SVG carré, avec autant de cases que de trames au plus", () => {
    const svg = matriceEnSvg(matriceSimilarite(morceau()), 90);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    expect((svg.match(/<rect/g) ?? []).length).toBe(90 * 90 + 1);
  });

  it("échantillonne une grande matrice au lieu de dessiner des millions de cases", () => {
    const grande = matriceSimilarite(Array.from({ length: 800 }, (_, i) => (i % 2 ? DO : SOL)));
    const svg = matriceEnSvg(grande, 100);
    expect((svg.match(/<rect/g) ?? []).length).toBe(100 * 100 + 1);
  });

  it("rend un SVG valide d'une matrice vide", () => {
    expect(matriceEnSvg([])).toContain("<svg");
  });
});
