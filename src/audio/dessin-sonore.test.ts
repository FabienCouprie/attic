// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { detecterFormesColorees, formesVersNotes } from "./dessin-sonore";
import type { PixelBuffer } from "./pixeltone";

function createPixelBuffer(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("dessin-sonore", () => {
  it("detecte deux formes de couleurs distinctes", () => {
    const pixels = createPixelBuffer(16, 8, (x, _y) => {
      if (x < 6) return [255, 0, 0];
      if (x > 9) return [0, 0, 255];
      return [255, 255, 255];
    });
    const formes = detecterFormesColorees(pixels, 3, 0.005);
    expect(formes.length).toBeGreaterThanOrEqual(2);
    const rouge = formes.find((f) => f.couleur.r > 200 && f.couleur.b < 50);
    const bleu = formes.find((f) => f.couleur.b > 200 && f.couleur.r < 50);
    expect(rouge).toBeDefined();
    expect(bleu).toBeDefined();
    expect(rouge!.x).toBeLessThan(bleu!.x);
  });

  it("genere des notes reparties sur la duree sans silence au debut", () => {
    const formes = [
      { couleur: { r: 255, g: 0, b: 0, h: 0, s: 1, l: 0.5, x: 0.2, y: 0.2, count: 100 }, x: 0.2, y: 0.2, area: 100, largeur: 0.1, hauteur: 0.1 },
      { couleur: { r: 0, g: 0, b: 255, h: 240, s: 1, l: 0.5, x: 0.8, y: 0.8, count: 100 }, x: 0.8, y: 0.8, area: 100, largeur: 0.1, hauteur: 0.1 },
    ];
    const notes = formesVersNotes(formes, {
      cle: "C",
      gamme: "majeur",
      mode: "melodie",
      octave: 4,
      portee: 2,
      duree: 4,
      nbCouleurs: 2,
      tailleMin: 0.01,
      modeRendu: "FM/Oscillateurs",
      instrument: 0,
      volume: 80,
      tempo: 120,
    });
    expect(notes.length).toBe(2);
    expect(notes[0].debut).toBe(0);
    expect(notes[1].debut).toBeGreaterThan(notes[0].debut);
    expect(notes[1].fin).toBeLessThanOrEqual(4);
  });

  it("genere un accord par forme en mode harmonie", () => {
    const formes = [
      { couleur: { r: 255, g: 0, b: 0, h: 0, s: 1, l: 0.5, x: 0.5, y: 0.5, count: 100 }, x: 0.5, y: 0.5, area: 100, largeur: 0.1, hauteur: 0.1 },
    ];
    const notes = formesVersNotes(formes, {
      cle: "C",
      gamme: "majeur",
      mode: "harmonie",
      octave: 4,
      portee: 2,
      duree: 4,
      nbCouleurs: 1,
      tailleMin: 0.01,
      modeRendu: "FM/Oscillateurs",
      instrument: 0,
      volume: 80,
      tempo: 120,
    });
    expect(notes.length).toBe(3);
    const midi = notes.map((n) => n.note).sort((a, b) => a - b);
    expect(midi[1] - midi[0]).toBe(4);
    expect(midi[2] - midi[1]).toBe(3);
  });
});
