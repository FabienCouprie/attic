// audio/mandelbrot.test.ts
import { describe, it, expect } from "vitest";
import { genererNotesMandelbrot, itererMandelbrot, GAMMES } from "./mandelbrot";

describe("mandelbrot", () => {
  it("itère correctement un point de l'ensemble (divergence lente)", () => {
    const it = itererMandelbrot(0, 0, 100);
    expect(it).toBe(100); // z=0 reste borné
  });

  it("détecte un point extérieur à l'ensemble", () => {
    const it = itererMandelbrot(2, 0, 100);
    expect(it).toBeLessThan(100);
  });

  it("génère des notes depuis la région Mandelbrot", () => {
    const notes = genererNotesMandelbrot({
      xMin: -2.5, xMax: 1, yMin: -1.25, yMax: 1.25,
      maxIter: 100, mode: "escape", nbNotes: 16, dureeNote: 0.25, tempo: 100,
      cle: "Do", gamme: "Majeur", octaveBase: 48, sensibilite: 1,
      timbre: "Douce", volume: 80, graine: 42,
    });
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.note).toBeGreaterThanOrEqual(0);
      expect(n.note).toBeLessThanOrEqual(127);
      expect(n.velocite).toBeGreaterThan(0);
      expect(n.velocite).toBeLessThanOrEqual(127);
      expect(n.fin).toBeGreaterThan(n.debut);
    }
  });

  it("produit des notes différentes selon le mode", () => {
    const opts = {
      xMin: -2.5, xMax: 1, yMin: -1.25, yMax: 1.25,
      maxIter: 100, nbNotes: 16, dureeNote: 0.25, tempo: 100,
      cle: "Do", gamme: "Majeur", octaveBase: 48, sensibilite: 1,
      timbre: "Douce" as const, volume: 80, graine: 42,
    };
    const e = genererNotesMandelbrot({ ...opts, mode: "escape" as const });
    const d = genererNotesMandelbrot({ ...opts, mode: "dwell" as const });
    const o = genererNotesMandelbrot({ ...opts, mode: "octave" as const });
    expect(e.length).toBeGreaterThan(0);
    expect(d.length).toBeGreaterThan(0);
    expect(o.length).toBeGreaterThan(0);
    const diff = e.some((n, i) => n.note !== d[i]?.note || n.velocite !== d[i]?.velocite);
    expect(diff).toBe(true);
  });

  it("respecte la gamme demandée", () => {
    const notes = genererNotesMandelbrot({
      xMin: -2.5, xMax: 1, yMin: -1.25, yMax: 1.25,
      maxIter: 100, mode: "escape", nbNotes: 32, dureeNote: 0.25, tempo: 100,
      cle: "Do", gamme: "Pentatonique majeure", octaveBase: 48, sensibilite: 1,
      timbre: "Douce" as const, volume: 80, graine: 42,
    });
    const gamme = GAMMES["Pentatonique majeure"];
    for (const n of notes) {
      const classe = n.note % 12;
      const base = 48 % 12;
      const relative = (classe - base + 12) % 12;
      expect(gamme).toContain(relative);
    }
  });
});
