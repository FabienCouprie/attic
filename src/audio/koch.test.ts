// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { genererNotesKoch, subdiviserKoch, snapperNote, type AccordKoch, type DirectionKoch } from "./koch";

describe("koch arpeggio", () => {
  it("subdivides a pitch interval recursively", () => {
    const notes = subdiviserKoch(60, 64, 1, 1, 3);
    expect(notes.length).toBe(4); // 4^1 segment starts
    expect(notes[0]).toBe(60);
    expect(notes[3]).toBeCloseTo(62.67, 2);
  });

  it("snaps chromatic pitches to a scale", () => {
    const scale = [0, 2, 4, 5, 7, 9, 11];
    expect(snapperNote(60, scale)).toBe(60); // C in C major
    expect(snapperNote(61, scale)).toBe(60); // C# -> C
    expect(snapperNote(62, scale)).toBe(62); // D
    expect(snapperNote(63, scale)).toBe(62); // D# -> D
    expect(snapperNote(64, scale)).toBe(64); // E
  });

  it("generates notes for each Koch side", () => {
    const { notes, dureeTotale } = genererNotesKoch({
      cle: "Do",
      gamme: "Majeur",
      octave: 4,
      accord: "Majeur" as AccordKoch,
      profondeur: 2,
      direction: "alternée" as DirectionKoch,
      hauteur: 3,
      tempo: 120,
      mesures: 1,
      dureeNote: 0.2,
      timbre: "Douce",
      volume: 80,
    });
    expect(notes.length).toBeGreaterThan(0);
    expect(dureeTotale).toBeCloseTo(2, 1); // 120 BPM, 1 measure = 2 s
    for (const n of notes) {
      expect(n.note).toBeGreaterThanOrEqual(0);
      expect(n.note).toBeLessThanOrEqual(127);
      expect(n.debut).toBeGreaterThanOrEqual(0);
      expect(n.fin).toBeGreaterThan(n.debut);
    }
  });

  it("produces different notes for different chord types", () => {
    const opt = {
      cle: "Do",
      gamme: "Majeur",
      octave: 4,
      accord: "Majeur" as AccordKoch,
      profondeur: 1,
      direction: "alternée" as DirectionKoch,
      hauteur: 3,
      tempo: 120,
      mesures: 1,
      dureeNote: 0.2,
      timbre: "Douce" as const,
      volume: 80,
    };
    const major = genererNotesKoch(opt);
    const minor = genererNotesKoch({ ...opt, accord: "Mineur" as AccordKoch });
    expect(minor.notes.some((n) => n.note !== major.notes[0].note)).toBe(true);
  });

  it("obeys min/max note bounds", () => {
    const { notes } = genererNotesKoch({
      cle: "Do",
      gamme: "Chromatique",
      octave: 1,
      accord: "Majeur" as AccordKoch,
      profondeur: 4,
      direction: "extérieure" as DirectionKoch,
      hauteur: 12,
      tempo: 60,
      mesures: 1,
      dureeNote: 0.5,
      timbre: "Douce" as const,
      volume: 80,
    });
    const maxNote = Math.max(...notes.map((n) => n.note));
    expect(maxNote).toBeLessThanOrEqual(127);
    const minNote = Math.min(...notes.map((n) => n.note));
    expect(minNote).toBeGreaterThanOrEqual(0);
  });
});
