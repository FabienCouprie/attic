// audio/series-intervalles.test.ts — Un dénombrement publié sert de contrôle à la recherche.
import { describe, expect, it } from "vitest";

import {
  decrireSerie, estSerieTousIntervalles, intervallesDe, serieTousIntervalles, seriesTousIntervalles,
} from "./series-intervalles";

/** La série de la « Suite lyrique » de Berg : fa mi do la sol ré la♭ ré♭ mi♭ sol♭ si♭ si. */
const BERG = [5, 4, 0, 9, 7, 2, 8, 1, 3, 6, 10, 11];

describe("reconnaître une série à tous les intervalles", () => {
  it("ACCEPTE CELLE DE BERG, qui est l'exemple le plus cité", () => {
    expect(estSerieTousIntervalles(BERG)).toBe(true);
    expect([...intervallesDe(BERG)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("REFUSE UNE SÉRIE DODÉCAPHONIQUE ORDINAIRE, et c'est la distinction qui compte", () => {
    // La gamme chromatique emploie les douze hauteurs et un seul intervalle, onze fois.
    const chromatique = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    expect(estSerieTousIntervalles(chromatique)).toBe(false);
    expect(new Set(intervallesDe(chromatique)).size).toBe(1);
  });

  it("refuse ce qui n'épuise pas les douze hauteurs", () => {
    expect(estSerieTousIntervalles([0, 1, 2])).toBe(false);
    expect(estSerieTousIntervalles([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0])).toBe(false);
  });

  it("supporte les hauteurs écrites hors de l'octave", () => {
    expect(estSerieTousIntervalles(BERG.map((n) => n + 60))).toBe(true);
  });
});

describe("dénombrer les séries", () => {
  it("IL Y EN A 3856 QUI COMMENCENT SUR ZÉRO, et ce nombre est publié", () => {
    // Dénombrement de Bauer-Mengelberg et Ferentz, 1965. Une recherche qui en rendrait un autre
    // serait fausse, et c'est tout l'intérêt d'un contrôle venu d'ailleurs.
    expect(seriesTousIntervalles().length).toBe(3856);
  });

  it("toutes celles qu'elle rend en sont vraiment", () => {
    const lot = seriesTousIntervalles(200);
    expect(lot.length).toBe(200);
    for (const s of lot) expect(estSerieTousIntervalles(s), s.join(" ")).toBe(true);
  });

  it("LA DERNIÈRE NOTE EST TOUJOURS À UN TRITON DE LA PREMIÈRE, par conséquence arithmétique", () => {
    // La somme des onze intervalles vaut 66, et 66 modulo 12 fait 6 : la série se referme sur un
    // triton, quelle qu'elle soit.
    for (const s of seriesTousIntervalles(300)) {
      expect((s[11] - s[0] + 12) % 12, s.join(" ")).toBe(6);
    }
  });

  it("aucune n'est répétée", () => {
    const lot = seriesTousIntervalles(500).map((s) => s.join(","));
    expect(new Set(lot).size).toBe(500);
  });
});

describe("choisir et transposer une série", () => {
  it("le rang choisit, et le départ transpose sans rien casser", () => {
    const a = serieTousIntervalles(0, 0);
    const b = serieTousIntervalles(0, 5);
    expect(a[0]).toBe(0);
    expect(b[0]).toBe(5);
    expect(estSerieTousIntervalles(b)).toBe(true);
    expect(intervallesDe(b)).toEqual(intervallesDe(a));
  });

  it("deux rangs donnent deux séries différentes", () => {
    expect(serieTousIntervalles(0).join()).not.toBe(serieTousIntervalles(7).join());
  });

  it("UN RANG QUI DÉPASSE BOUCLE, au lieu de rendre une liste vide", () => {
    const s = serieTousIntervalles(999999);
    expect(s.length).toBe(12);
    expect(estSerieTousIntervalles(s)).toBe(true);
  });
});

describe("la description lisible", () => {
  it("donne les hauteurs puis les intervalles", () => {
    const noms = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const texte = decrireSerie(BERG, noms);
    expect(texte.split("\n")[0]).toBe("F E C A G D G# C# D# F# A# B");
    expect(texte.split("\n")[1].split(" ")).toHaveLength(11);
  });
});
