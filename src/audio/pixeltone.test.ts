// @vitest-environment jsdom
// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { frequenceDepuisValeur, pixelsEnOrdre, sonifierDepuisPixels } from "./pixeltone";

function bufferNonSilencieux(buf: AudioBuffer): boolean {
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      if (Math.abs(d[i]) > 1e-6) return true;
    }
  }
  return false;
}

function createPixelBuffer(width: number, height: number, fill: (x: number, y: number) => [number, number, number]) {
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

describe("pixeltone", () => {
  it("mappe une valeur 0-255 sur une plage de fréquences", () => {
    expect(frequenceDepuisValeur(0, 100, 1000)).toBe(100);
    expect(frequenceDepuisValeur(255, 100, 1000)).toBe(1000);
    expect(frequenceDepuisValeur(127, 100, 1000)).toBeCloseTo(548, 0);
  });

  it("énumère les pixels dans l'ordre horizontal", () => {
    const coords = Array.from(pixelsEnOrdre(2, 2, "horizontal"));
    expect(coords).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 },
    ]);
  });

  it("énumère les pixels dans l'ordre vertical", () => {
    const coords = Array.from(pixelsEnOrdre(2, 2, "vertical"));
    expect(coords).toEqual([
      { x: 0, y: 0 }, { x: 0, y: 1 },
      { x: 1, y: 0 }, { x: 1, y: 1 },
    ]);
  });

  it("énumère les pixels en zigzag", () => {
    const coords = Array.from(pixelsEnOrdre(3, 2, "zigzag"));
    expect(coords).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
      { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ]);
  });

  it("sonifie une image synthétique en audio stéréo non silencieux", () => {
    const imageData = createPixelBuffer(4, 4, (x, y) => [x * 60, y * 60, (x + y) * 30]);
    const audio = sonifierDepuisPixels(imageData, {
      dureePixel: 0.01,
      rouge: [100, 1000],
      vert: [500, 3000],
      bleu: [1000, 5000],
      balayage: "horizontal",
      sampleRate: 44100,
      volume: 80,
      canaux: 2,
    });
    expect(audio.sampleRate).toBe(44100);
    expect(audio.numberOfChannels).toBe(2);
    expect(audio.length).toBe(4 * 4 * 441);
    expect(bufferNonSilencieux(audio)).toBe(true);
  });

  it("produit un audio mono quand Canaux = Mono", () => {
    const imageData = createPixelBuffer(2, 2, () => [128, 128, 128]);
    const audio = sonifierDepuisPixels(imageData, {
      dureePixel: 0.005,
      rouge: [100, 1000],
      vert: [500, 3000],
      bleu: [1000, 5000],
      balayage: "horizontal",
      sampleRate: 22050,
      volume: 50,
      canaux: 1,
    });
    expect(audio.numberOfChannels).toBe(1);
    expect(audio.sampleRate).toBe(22050);
    expect(bufferNonSilencieux(audio)).toBe(true);
  });
});
