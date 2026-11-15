// audio/roule.test.ts — Le roulé, dans les cinq composants qui l'ont gagné le 2026-11-14.
//
// DÉCISION DE FABIEN : la façon de jouer un accord offre sa table entière, plaqué, arpégé et roulé.
// Chaque composant avait son arpège ; le roulé en garde les départs et tient chaque note jusqu'au
// bout de l'accord, de sorte qu'il ne se distingue de l'arpège que par là. Ce cas tient les deux
// propriétés pour chacun : les départs de l'arpège, et une fin commune.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { genererNotesCamelot } from "./camelot";
import { genererNotesColorLooper } from "./color-looper";
import { formesVersNotes } from "./dessin-sonore";
import { couleursVersNotes, type CouleurExtraite } from "./palette-harmonique";
import { genererNotesAutomateCellulaire } from "./automate-cellulaire";
import type { NoteEvenement } from "./midi-sequence";

/** Les départs, et les fins, du premier accord rendu. */
const premierAccord = (notes: NoteEvenement[], n: number) => [...notes].sort((a, b) => a.debut - b.debut).slice(0, n);

function memeDepartsFinCommune(arpege: NoteEvenement[], roule: NoteEvenement[], n: number) {
  const a = premierAccord(arpege, n), r = premierAccord(roule, n);
  expect(r.map((x) => x.debut)).toEqual(a.map((x) => x.debut));
  expect(new Set(r.map((x) => x.debut)).size, "les départs se décalent").toBe(n);
  expect(new Set(r.map((x) => x.fin.toFixed(9))).size, "les notes du roulé finissent ensemble").toBe(1);
  expect(new Set(a.map((x) => x.fin.toFixed(9))).size, "celles de l'arpège non").toBe(n);
}

describe("le roulé", () => {
  it("la roue de Camelot", () => {
    const de = (mode: "arpege" | "roule") => genererNotesCamelot({
      depart: "8A", parcours: "complet", pas: 2, tempo: 120, dureeNote: 1, octave: 3, mode,
      modeRendu: "FM/Oscillateurs", instrument: 0, volume: 80,
    }).notes;
    memeDepartsFinCommune(de("arpege"), de("roule"), 3);
  });

  it("le color looper", () => {
    const de = (mode: "arpeges" | "roule") => genererNotesColorLooper({
      couleurs: "#ff0000", cle: "C", gamme: "majeur", mode, octave: 4, portee: 2, tempo: 120, dureeNote: 0.5,
      mesures: 1, modeRendu: "FM/Oscillateurs", instrument: 0, volume: 80,
    });
    memeDepartsFinCommune(de("arpeges"), de("roule"), 3);
  });

  it("le dessin sonore", () => {
    const formes = [
      { couleur: { r: 255, g: 0, b: 0, h: 0, s: 1, l: 0.5, x: 0.5, y: 0.5, count: 100 }, x: 0.5, y: 0.5, area: 100, largeur: 0.1, hauteur: 0.1 },
    ];
    const de = (mode: "arpege" | "roule") => formesVersNotes(formes, {
      cle: "C", gamme: "majeur", mode, octave: 4, portee: 2, duree: 4, nbCouleurs: 1, tailleMin: 0.01,
      modeRendu: "FM/Oscillateurs", instrument: 0, volume: 80, tempo: 120,
    });
    memeDepartsFinCommune(de("arpege"), de("roule"), 3);
  });

  it("la palette harmonique", () => {
    const couleurs: CouleurExtraite[] = [{ r: 255, g: 0, b: 0, h: 0, s: 1, l: 0.5, x: 0, y: 0, count: 10 }];
    const de = (mode: "arpege" | "roule") => couleursVersNotes(couleurs, {
      cle: "C", gamme: "majeur", mode, octave: 4, portee: 2, duree: 4, nbCouleurs: 1, ordre: "horizontal",
      modeRendu: "FM/Oscillateurs", instrument: 0, volume: 80, tempo: 120,
    });
    memeDepartsFinCommune(de("arpege"), de("roule"), 3);
  });

  it("l'automate cellulaire : la polyphonie, ses départs répartis sur le pas et tenus", () => {
    const base = {
      regle: 90, reglePersonnalisee: 90, topologie: "1D" as const, mapping: "Hauteur" as const, largeur: 16, hauteur: 16,
      generations: 8, graine: 3, cle: "Do", gamme: "Pentatonique majeure", octave: 4, dureeNote: 0.25, velocite: 100,
      volume: 80, timbre: "FM/Oscillateurs" as const, instrument: 0, probabilite: 0, densiteMax: 4,
    };
    const plaque = genererNotesAutomateCellulaire({ ...base, modeVoix: "Polyphonie" });
    const roule = genererNotesAutomateCellulaire({ ...base, modeVoix: "Roulé" });
    const premierPas = (notes: NoteEvenement[]) => notes.filter((n) => n.debut < base.dureeNote - 1e-9);
    const p = premierPas(plaque), r = premierPas(roule);
    expect(r.length).toBe(p.length);
    expect(r.length).toBeGreaterThan(1);
    expect(new Set(p.map((n) => n.debut)).size, "le plaqué part ensemble").toBe(1);
    expect(new Set(r.map((n) => n.debut)).size, "le roulé décale ses départs").toBe(r.length);
    for (const n of r) expect(n.fin).toBeCloseTo(base.dureeNote, 9);
  });
});
