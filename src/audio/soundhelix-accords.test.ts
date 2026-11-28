// audio/soundhelix-accords.test.ts — Les accords de SoundHelix : noms, renversements, registre.
//
// LES VALEURS ATTENDUES SONT CELLES DU PROGRAMME, relevées dans les témoins du banc : `Bb6` au
// registre 7 vaut 5,10,14 dans `registre.txt`, `E7` rapproché de `Am` vaut -4,2,4 dans
// `accords.txt`. Les autres se déduisent de la grammaire, écrite en tête de `soundhelix-accords.ts`.

import { describe, expect, it } from "vitest";
import {
  accordContient, creerAccord, egauxNormalises, hauteurSurAccord, lireAccordSH, normaliserAccord, rapprocherAccord,
} from "./soundhelix-accords";

describe("la lecture des noms", () => {
  it.each([
    // Relevés dans `registre.txt`, registre 7, sans rapprochement.
    ["Dm", 7, [2, 5, 9]], ["Bb6", 7, [5, 10, 14]], ["C4", 7, [4, 7, 12]], ["Gm", 7, [-5, -2, 2]],
    ["A7", 7, [-3, 1, 7]], ["Dm4", 7, [5, 9, 14]], ["Am6", 7, [4, 9, 12]], ["Bb", 7, [-2, 2, 5]],
    ["Csus4", 7, [0, 5, 7]],
    // Au registre 3, celui des autres essais.
    ["Am", 3, [-3, 0, 4]], ["Dm6", 3, [-3, 2, 5]], ["G7", 3, [-5, -1, 5]], ["Bbaug", 3, [-2, 2, 6]],
    ["Edim", 3, [-8, -5, -2]], ["Fsus2", 3, [-7, -5, 0]], ["Em7", 3, [-8, -5, 2]],
  ] as const)("%s au registre %i vaut %j", (nom, registre, attendu) => {
    expect([...lireAccordSH(nom, registre)]).toEqual(attendu);
  });

  it("lit les deux orthographes d'une même fondamentale", () => {
    expect(lireAccordSH("C#m", 3)).toEqual(lireAccordSH("Dbm", 3));
    expect(lireAccordSH("A#7", 3)).toEqual(lireAccordSH("Bb7", 3));
  });

  it("lit Ab et Gb à leur place, là où SoundHelix 0.9 les échange", () => {
    // RELEVÉ SUR LE PROGRAMME le 2026-11-28 : sa table des bémols porte Ab au rang de fa dièse et Gb
    // au rang de sol dièse, si bien que `Ab` y sonne fa dièse majeur. L'écart est voulu : la bémol
    // est ici sol dièse.
    expect(lireAccordSH("Ab", 12)).toEqual([8, 12, 15]);
    expect(lireAccordSH("Gb", 12)).toEqual([6, 10, 13]);
    expect(lireAccordSH("Abm", 3)).toEqual(lireAccordSH("G#m", 3));
  });

  it("lit trois hauteurs écrites, triées, sans leur appliquer le registre", () => {
    expect(lireAccordSH("4:-3:0", 3)).toEqual([-3, 0, 4]);
    expect(() => lireAccordSH("0:0:4", 3)).toThrow(/égales/);
    expect(() => lireAccordSH("0:4:12", 3)).toThrow(/octave/);
  });

  it("refuse un nom qu'il ne connaît pas, en le nommant", () => {
    expect(() => lireAccordSH("Amaj7", 3)).toThrow(/Amaj7/);
    expect(() => lireAccordSH("am", 3)).toThrow(/am/);
  });
});

describe("les renversements", () => {
  it("normalise un premier renversement vers le bas et un second vers le haut", () => {
    expect(normaliserAccord(lireAccordSH("C4", 7))).toEqual([0, 4, 7]);
    // `C6` au registre 7 vaut -5,0,4 : sa basse monte d'une octave.
    expect(normaliserAccord(lireAccordSH("C6", 7))).toEqual([0, 4, 7]);
    expect(normaliserAccord(lireAccordSH("C", 7))).toEqual([0, 4, 7]);
  });

  it("garde la lecture de SoundHelix des sus : do-fa-sol se normalise en fa-sol-do", () => {
    expect(normaliserAccord(creerAccord(0, 5, 7))).toEqual([5, 7, 12]);
    expect(normaliserAccord(creerAccord(0, 2, 7))).toEqual([0, 2, 7]);
    expect(egauxNormalises(lireAccordSH("Csus4", 7), lireAccordSH("Fsus2", 7))).toBe(true);
  });

  it("ne normalise jamais un accord augmenté", () => {
    expect(normaliserAccord(creerAccord(0, 4, 8))).toEqual([0, 4, 8]);
  });

  it("rapproche du milieu de la cible, le moins déplacé à distance égale", () => {
    const am = lireAccordSH("Am", 3);
    expect(rapprocherAccord(lireAccordSH("E7", 3), am)).toEqual([-4, 2, 4]);
    expect(rapprocherAccord(lireAccordSH("C", 3), am)).toEqual([-5, 0, 4]);
    expect(rapprocherAccord(lireAccordSH("Dm6", 3), am)).toEqual([-3, 2, 5]);
    expect(rapprocherAccord(am, am)).toEqual(am);
  });
});

describe("les décalages sur l'accord", () => {
  const am: [number, number, number] = [-3, 0, 4];
  it.each([[0, -3], [1, 0], [2, 4], [3, 9], [4, 12], [-1, -8], [-2, -12], [-3, -15], [-4, -20]])(
    "le décalage %i vaut %i", (d, h) => {
      expect(hauteurSurAccord(am, d)).toBe(h);
    });

  it("reconnaît une note de l'accord à l'octave près", () => {
    expect(accordContient(am, 21)).toBe(true);
    expect(accordContient(am, 2)).toBe(false);
  });
});
