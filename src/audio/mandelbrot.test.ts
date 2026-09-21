// audio/mandelbrot.test.ts — Le mappeur Mandelbrot.
//
// Chaque test répond à un défaut relevé le 2026-09-21 : des notes bloquées au plafond MIDI, un mode
// Escape time à l'envers de sa notice, un mode Dwell à deux notes, une octave décalée, un timbre
// sans effet, un mode Octave qui suivait le temps.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { genererNotesMandelbrot, itererMandelbrot, iterationsNormalisees, type OptionsMandelbrot } from "./mandelbrot";

// Les valeurs que le nœud transmet par défaut : vue entière centrée sur −0,5, 200 itérations, 32 notes, Do4.
const VUE = { xMin: -2.25, xMax: 1.25, yMin: -1.25, yMax: 1.25 };
const BASE: OptionsMandelbrot = {
  ...VUE, maxIter: 200, mode: "escape", nbNotes: 32, dureeNote: 0.5, tempo: 100, cle: "C", gamme: "majeur",
  octaveBase: 60, sensibilite: 1, interieur: "silence", timbre: "douce", volume: 80, graine: 42,
};
const hauteurs = (n: { note: number }[]) => new Set(n.map((x) => x.note)).size;

describe("mappeur Mandelbrot", () => {
  it("AUCUNE NOTE NE SE BLOQUE AU PLAFOND : deux octaves de gamme au-dessus de la base, pas plus", () => {
    for (const mode of ["escape", "dwell", "octave"] as const) {
      for (const n of genererNotesMandelbrot({ ...BASE, mode, interieur: "tonique" })) {
        expect(n.note, mode).toBeLessThan(127);
        expect(n.note, mode).toBeGreaterThanOrEqual(48);
        if (mode !== "octave") expect(n.note, mode).toBeLessThanOrEqual(60 + 24);
      }
    }
  });

  it("ESCAPE TIME : PLUS UN POINT MET DE TEMPS À DIVERGER, PLUS IL SONNE AIGU — comme le dit la notice", () => {
    // Un point qui s'échappe tout de suite, et un point du bord, qui met des dizaines d'itérations.
    const vite = genererNotesMandelbrot({ ...BASE, xMin: 1.5, xMax: 1.6, yMin: 1, yMax: 1.1, nbNotes: 4 });
    const bord = genererNotesMandelbrot({ ...BASE, xMin: -0.76, xMax: -0.74, yMin: 0.1, yMax: 0.12, nbNotes: 4 });
    expect(itererMandelbrot(1.55, 1.05, 200)).toBeLessThan(5);
    expect(Math.max(...vite.map((n) => n.note))).toBeLessThan(Math.min(...bord.map((n) => n.note)));
    expect(Math.max(...vite.map((n) => n.velocite))).toBeLessThan(Math.min(...bord.map((n) => n.velocite)));
  });

  it("LA VUE PAR DÉFAUT DONNE UNE MÉLODIE, et non deux notes", () => {
    expect(hauteurs(genererNotesMandelbrot(BASE))).toBeGreaterThanOrEqual(7);
    expect(hauteurs(genererNotesMandelbrot({ ...BASE, mode: "dwell" }))).toBeGreaterThanOrEqual(7);
  });

  it("DWELL : les points du bord s'attardent — des durées qui suivent les itérations", () => {
    const n = genererNotesMandelbrot({ ...BASE, mode: "dwell" });
    const durees = n.map((x) => x.fin - x.debut);
    expect(Math.max(...durees) / Math.min(...durees)).toBeGreaterThan(2);
    // Et la plus longue est une des plus aiguës.
    const longue = n[durees.indexOf(Math.max(...durees))];
    expect(longue.note).toBeGreaterThanOrEqual(Math.max(...n.map((x) => x.note)) - 5);
  });

  it("L'INTÉRIEUR : silence par défaut, ou la tonique une octave sous la base", () => {
    const silence = genererNotesMandelbrot(BASE);
    const tonique = genererNotesMandelbrot({ ...BASE, interieur: "tonique" });
    expect(tonique.length).toBeGreaterThan(silence.length);
    const ajoutees = tonique.filter((n) => n.note === 48);
    expect(ajoutees.length).toBe(tonique.length - silence.length);
  });

  it("OCTAVE : l'octave suit la hauteur dans l'image, et non plus le temps", () => {
    const n = genererNotesMandelbrot({ ...BASE, mode: "octave", nbNotes: 64, interieur: "silence" });
    // Parcours par colonnes : dans la première moitié du morceau déjà, les trois octaves apparaissent.
    const moitie = n.filter((x) => x.debut < n[n.length - 1].debut / 2);
    const octaves = new Set(moitie.map((x) => Math.floor((x.note - 60) / 12)));
    expect(octaves.size).toBeGreaterThanOrEqual(2);
  });

  it("l'échelle logarithmique : 0 pour une itération, 1 au maximum", () => {
    expect(iterationsNormalisees(200, 200)).toBeCloseTo(1, 9);
    expect(iterationsNormalisees(1, 200)).toBe(0);
    expect(iterationsNormalisees(14, 200)).toBeCloseTo(0.51, 1);
  });

  it("à graine égale, la même mélodie ; la sensibilité resserre ou élargit la plage", () => {
    expect(JSON.stringify(genererNotesMandelbrot(BASE))).toBe(JSON.stringify(genererNotesMandelbrot(BASE)));
    const etroite = genererNotesMandelbrot({ ...BASE, sensibilite: 0.5 });
    expect(Math.max(...etroite.map((n) => n.note))).toBeLessThanOrEqual(60 + 12);
  });
});
