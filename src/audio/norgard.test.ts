// audio/norgard.test.ts — Une suite publiée, et une auto-similarité exacte.
//
// La série de l'infini a une définition de trois lignes et un catalogue : A004718. Ses
// premiers termes sont donc vérifiables hors d'ici, et c'est par eux qu'on commence. Le
// reste tient les trois identités de la définition sur des milliers de termes, puis
// l'auto-similarité dont Nørgård a fait sa symphonie : une note sur quatre redonne la série
// elle-même, exactement, et c'est ce qui permet de superposer la mélodie à sa propre
// version quatre fois plus lente.
import { describe, expect, it } from "vitest";
import { serie, statistiques, terme, versHauteurs, voix } from "./norgard";

const MAJEURE = [0, 2, 4, 5, 7, 9, 11];

describe("la suite publiée", () => {
  it("donne les seize premiers termes du catalogue", () => {
    expect(serie(16)).toEqual([0, 1, -1, 2, 1, 0, -2, 3, -1, 2, 0, 1, 2, -1, -3, 4]);
  });

  it("part de zéro et n'en bouge pas", () => {
    expect(terme(0)).toBe(0);
    expect(serie(0)).toEqual([]);
    expect(serie(1)).toEqual([0]);
  });

  it("borne les indices négatifs sur zéro au lieu de boucler sans fin", () => {
    expect(terme(-5)).toBe(0);
    expect(serie(-3)).toEqual([]);
  });
});

describe("les trois identités de la définition", () => {
  it("inverse le signe aux indices pairs", () => {
    // « ou zéro » parce que l'opposé de zéro est −0 en JavaScript, et qu'une comparaison
    // stricte les distingue : la suite, elle, ne rend jamais −0.
    for (let n = 1; n < 2000; n++) expect(terme(2 * n), `n=${n}`).toBe(-terme(n) || 0);
  });

  it("ajoute un aux indices impairs", () => {
    for (let n = 0; n < 2000; n++) expect(terme(2 * n + 1), `n=${n}`).toBe(terme(n) + 1);
  });

  it("se retrouve identique un terme sur quatre — l'auto-similarité de Nørgård", () => {
    for (let n = 0; n < 2000; n++) expect(terme(4 * n), `n=${n}`).toBe(terme(n));
  });
});

describe("voix", () => {
  it("rend la série elle-même au pas 1", () => {
    expect(voix(12, 1)).toEqual(serie(12));
  });

  it("rend la série inversée au pas 2", () => {
    expect(voix(40, 2)).toEqual(serie(40).map((x) => -x || 0));
  });

  it("rend la série d'origine au pas 4 : le canon se tient tout seul", () => {
    expect(voix(40, 4)).toEqual(serie(40));
  });

  it("rend encore la série inversée au pas 8, et ainsi de suite", () => {
    expect(voix(30, 8)).toEqual(serie(30).map((x) => -x || 0));
    expect(voix(30, 16)).toEqual(serie(30));
  });

  it("ramène un pas nul ou négatif à 1", () => {
    expect(voix(8, 0)).toEqual(serie(8));
    expect(voix(8, -3)).toEqual(serie(8));
  });
});

describe("mise en hauteurs", () => {
  it("compte en demi-tons depuis la tonique", () => {
    expect(versHauteurs([0, 1, -1, 2], 60, "demi-tons", MAJEURE)).toEqual([60, 61, 59, 62]);
  });

  it("compte en degrés de la gamme, octaves comprises", () => {
    // Do majeur : 0 → do, 1 → ré, 7 → do de l'octave au-dessus, −1 → si du dessous.
    expect(versHauteurs([0, 1, 2, 7, -1], 60, "degres", MAJEURE)).toEqual([60, 62, 64, 72, 59]);
  });

  it("ne sort jamais du clavier, quelle que soit l'ampleur de la série", () => {
    const valeurs = serie(4000);
    for (const mode of ["demi-tons", "degres"] as const) {
      for (const note of versHauteurs(valeurs, 60, mode, MAJEURE, 21, 108)) {
        expect(note, mode).toBeGreaterThanOrEqual(21);
        expect(note, mode).toBeLessThanOrEqual(108);
      }
    }
  });

  it("garde le degré juste après repliement d'octave", () => {
    const hauteurs = versHauteurs([50, -50], 60, "degres", MAJEURE, 21, 108);
    for (const note of hauteurs) {
      expect(MAJEURE.includes(((note - 60) % 12 + 12) % 12)).toBe(true);
    }
  });

  it("supporte une gamme vide sans diviser par zéro", () => {
    for (const note of versHauteurs([0, 3, -2], 60, "degres", [])) {
      expect(Number.isFinite(note)).toBe(true);
    }
  });
});

describe("statistiques", () => {
  it("dit l'étendue et le nombre de valeurs distinctes", () => {
    const s = statistiques(serie(16));
    expect(s.minimum).toBe(-3);
    expect(s.maximum).toBe(4);
    expect(s.distinctes).toBe(8);
  });

  it("grandit lentement : mille termes tiennent dans une étendue modeste", () => {
    // La série n'est pas bornée, mais elle monte comme le logarithme de l'indice.
    const s = statistiques(serie(1000));
    expect(s.maximum).toBeLessThan(20);
    expect(s.minimum).toBeGreaterThan(-20);
  });

  it("ne rend rien d'une suite vide", () => {
    expect(statistiques([])).toEqual({ minimum: 0, maximum: 0, distinctes: 0 });
  });
});
