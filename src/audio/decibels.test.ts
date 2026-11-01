// audio/decibels.test.ts — Les canoniques rendent les bits des formules qu'ils remplacent.
//
// DEUX CHOSES À TENIR. Que `versDb` et `depuisDb` soient la formule, au bit près, c'est l'évidence
// qu'un témoin recopié vérifie. Que `Math.pow` rende les mêmes bits que `**`, ce n'en est pas une :
// onze sites écrivaient `2 ** x` ou `10 ** x` et appellent désormais une fonction qui écrit
// `Math.pow`. La spécification permet aux deux de différer ; V8 les a alignés, et ce cas le MESURE
// sur les arguments que le dépôt leur donne, au lieu de le croire.
import { describe, expect, it } from "vitest";
import { depuisDb, versDb } from "./decibels";
import { frequenceDeNoteMidi, noteMidiDeFrequence } from "./commun";

describe("décibels", () => {
  it("versDb et depuisDb sont la formule, au bit près", () => {
    for (let i = 0; i <= 2000; i++) {
      const x = i / 1000 + 1e-7;
      expect(versDb(x)).toBe(20 * Math.log10(x));
      const db = -120 + i * 0.07;
      expect(depuisDb(db)).toBe(Math.pow(10, db / 20));
    }
    expect(versDb(0)).toBe(-Infinity);
  });

  it("`**` ET `Math.pow` RENDENT LES MÊMES BITS sur ce que le dépôt leur donne", () => {
    // Les exposants des sites migrés : (note - 69) / 12 pour les hauteurs, db / 20 pour les gains.
    for (let note = -24; note <= 160; note++) {
      for (const frac of [0, 0.25, 0.5, 1 / 3, 0.99]) {
        const e = (note + frac - 69) / 12;
        expect(Math.pow(2, e)).toBe(2 ** e);
      }
    }
    for (let d = -240; d <= 60; d++) {
      for (const frac of [0, 0.1, 0.5, 0.75]) {
        const e = (d + frac) / 20;
        expect(Math.pow(10, e)).toBe(10 ** e);
      }
    }
  });

  it("Hz ↔ MIDI : les deux écritures de l'addition rendent les mêmes bits", () => {
    for (let i = 1; i <= 3000; i++) {
      const f = i * 7.3;
      expect(noteMidiDeFrequence(f)).toBe(12 * Math.log2(f / 440) + 69);
      expect(noteMidiDeFrequence(f)).toBe(69 + 12 * Math.log2(f / 440));
    }
    for (let n = 0; n <= 127; n++) {
      expect(frequenceDeNoteMidi(n)).toBe(440 * 2 ** ((n - 69) / 12));
      expect(frequenceDeNoteMidi(n + 0.37)).toBe(440 * Math.pow(2, (n + 0.37 - 69) / 12));
    }
  });
});
