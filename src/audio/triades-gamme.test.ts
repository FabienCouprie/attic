// audio/triades-gamme.test.ts — Un accord se bâtit un degré sur deux dans la gamme.
//
// LA RÈGLE DE FABIEN, décidée le 2026-11-21 sur le relevé du banc des gammes. Les attendus sont écrits
// à la main, d'après l'harmonisation par tierces des traités, et non recalculés depuis la règle : un
// test qui refait le calcul de ce qu'il vérifie ne vérifie rien.
import { describe, expect, it } from "vitest";
import { gammeDe } from "./gammes";
import { ecartDansLaGamme, quinteDuDegre, septiemeDuDegre, sixteDuDegre, tierceDuDegre } from "./triades-gamme";

const degres = (id: string) => gammeDe(id)!.degres;

/** Les intervalles de la triade bâtie sur chaque degré, depuis sa fondamentale. */
const harmonisation = (id: string) => degres(id).map((r) => [tierceDuDegre(degres(id), r), quinteDuDegre(degres(id), r)]);

const MAJ = [4, 7], MIN = [3, 7], DIM = [3, 6], AUG = [4, 8];

describe("la triade de chaque degré, sur les gammes à sept degrés", () => {
  it.each([
    ["majeur", [MAJ, MIN, MIN, MAJ, MAJ, MIN, DIM]],
    ["mineur", [MIN, DIM, MAJ, MIN, MIN, MAJ, MAJ]],
    ["dorien", [MIN, MIN, MAJ, MAJ, MIN, DIM, MAJ]],
    ["phrygien", [MIN, MAJ, MAJ, MIN, DIM, MAJ, MIN]],
    ["lydien", [MAJ, MAJ, MIN, DIM, MAJ, MIN, MIN]],
    ["mixolydien", [MAJ, MIN, DIM, MAJ, MIN, MIN, MAJ]],
    ["locrien", [DIM, MAJ, MIN, MIN, MAJ, MAJ, MIN]],
    ["mineur-harmonique", [MIN, DIM, AUG, MIN, MAJ, MAJ, DIM]],
    ["mineur-melodique", [MIN, MIN, AUG, MAJ, MAJ, DIM, DIM]],
    // L'ALTÉRÉE, septième mode du mineur mélodique : son I est diminué, décision de Fabien.
    ["alteree", [DIM, MIN, MIN, AUG, MAJ, MAJ, DIM]],
  ])("%s", (id, attendu) => {
    expect(harmonisation(id)).toEqual(attendu);
  });

  it("LE v DU MINEUR EST MINEUR, et non plus sol, do, ré : le défaut que la règle répare", () => {
    expect([tierceDuDegre(degres("mineur"), 7), quinteDuDegre(degres("mineur"), 7)]).toEqual(MIN);
  });

  it("LE vii° DU MINEUR HARMONIQUE EST DIMINUÉ, si, ré, fa, et non si, ré dièse, fa", () => {
    expect([tierceDuDegre(degres("mineur-harmonique"), 11), quinteDuDegre(degres("mineur-harmonique"), 11)]).toEqual(DIM);
  });
});

describe("la septième et la sixte suivent la même règle", () => {
  it.each([["majeur", 11], ["mineur", 10], ["dorien", 10], ["phrygien", 10], ["lydien", 11], ["mixolydien", 10], ["locrien", 10]])(
    "la septième sur la tonique du %s vaut %i demi-tons", (id, s) => {
      expect(septiemeDuDegre(degres(id), 0)).toBe(s);
    },
  );

  it("la septième de la dominante en majeur est mineure, celle d'un accord de septième de dominante", () => {
    expect(septiemeDuDegre(degres("majeur"), 7)).toBe(10);
  });

  it("la sixte sur la tonique du majeur est majeure, celle du mineur mineure", () => {
    expect(sixteDuDegre(degres("majeur"), 0)).toBe(9);
    expect(sixteDuDegre(degres("mineur"), 0)).toBe(8);
  });
});

describe("un degré sur deux, hors des gammes à sept degrés", () => {
  it("la pentatonique majeure bâtit do, mi, la sur do, et ré, sol, do sur ré", () => {
    expect([tierceDuDegre(degres("pentatonique-majeure"), 0), quinteDuDegre(degres("pentatonique-majeure"), 0)]).toEqual([4, 9]);
    expect([tierceDuDegre(degres("pentatonique-majeure"), 2), quinteDuDegre(degres("pentatonique-majeure"), 2)]).toEqual([5, 10]);
  });

  it("la gamme par tons bâtit des accords augmentés, l'octatonique des diminués", () => {
    expect(harmonisation("ton-entier").every(([t, q]) => t === 4 && q === 8)).toBe(true);
    expect(harmonisation("diminuee-demi-ton").every(([t, q]) => t === 3 && q === 6)).toBe(true);
  });

  it("la chromatique bâtit do, ré, mi : un degré sur deux est un ton", () => {
    expect(harmonisation("chromatique").every(([t, q]) => t === 2 && q === 4)).toBe(true);
  });

  it("une septième qui passe l'octave reste un degré de la gamme", () => {
    expect(septiemeDuDegre(degres("pentatonique-majeure"), 0)).toBe(14);
  });
});

describe("une fondamentale hors de la gamme", () => {
  it("jette, plutôt que de rendre un accord d'une gamme perdue", () => {
    expect(() => ecartDansLaGamme(degres("majeur"), 1, 2)).toThrow(/n'est pas un degré/);
  });
});
