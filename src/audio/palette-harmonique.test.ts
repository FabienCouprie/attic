// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { rgbToHsl } from "./couleurs";
import { extrairePalette, couleursVersNotes, type CouleurExtraite } from "./palette-harmonique";
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

describe("palette-harmonique", () => {
  it("convertit RGB en HSL", () => {
    expect(rgbToHsl(255, 0, 0)[0]).toBeCloseTo(0, 0);
    expect(rgbToHsl(0, 255, 0)[0]).toBeCloseTo(120, 0);
    expect(rgbToHsl(0, 0, 255)[0]).toBeCloseTo(240, 0);
    expect(rgbToHsl(255, 255, 255)[2]).toBeCloseTo(1, 2);
    expect(rgbToHsl(0, 0, 0)[2]).toBeCloseTo(0, 2);
  });

  it("extrait les couleurs dominantes d'une image", () => {
    const pixels = createPixelBuffer(8, 8, (x, _y) => {
      if (x < 4) return [255, 0, 0]; // rouge à gauche
      return [0, 0, 255]; // bleu à droite
    });
    const palette = extrairePalette(pixels, 2);
    expect(palette.length).toBe(2);
    const rouge = palette.find((c) => c.r > 200 && c.b < 50);
    const bleu = palette.find((c) => c.b > 200 && c.r < 50);
    expect(rouge).toBeDefined();
    expect(bleu).toBeDefined();
    expect(rouge!.x).toBeLessThan(bleu!.x);
  });

  it("genere une note par couleur en mode melodie", () => {
    const couleurs: CouleurExtraite[] = [
      { r: 255, g: 0, b: 0, h: 0, s: 1, l: 0.5, x: 0, y: 0, count: 10 },
      { r: 0, g: 0, b: 255, h: 240, s: 1, l: 0.5, x: 0.5, y: 0, count: 10 },
    ];
    const notes = couleursVersNotes(couleurs, {
      cle: "C",
      gamme: "majeur",
      mode: "melodie",
      octave: 4,
      portee: 2,
      duree: 4,
      nbCouleurs: 2,
      ordre: "horizontal",
      modeRendu: "FM/Oscillateurs",
      instrument: 0,
      volume: 80,
      tempo: 120,
    });
    expect(notes.length).toBe(2);
    expect(notes[0].debut).toBe(0);
    expect(notes[1].debut).toBeGreaterThan(notes[0].debut);
    expect(notes[1].fin).toBeLessThanOrEqual(4);
    expect(notes[0].velocite).toBeGreaterThan(0);
    expect(notes[1].velocite).toBeGreaterThan(0);
  });

  it("genere un accord par couleur en mode harmonie", () => {
    const couleurs: CouleurExtraite[] = [
      { r: 255, g: 0, b: 0, h: 0, s: 1, l: 0.5, x: 0, y: 0, count: 10 },
    ];
    const notes = couleursVersNotes(couleurs, {
      cle: "C",
      gamme: "majeur",
      mode: "harmonie",
      octave: 4,
      portee: 2,
      duree: 4,
      nbCouleurs: 1,
      ordre: "horizontal",
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
