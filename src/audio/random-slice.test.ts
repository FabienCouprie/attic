// audio/random-slice.test.ts
// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { appliquerDecoupeAleatoire, listeModesDecoupe } from "./random-slice";

function createRampBuffer(sr: number, duration: number): AudioBuffer {
  const len = Math.round(sr * duration);
  const buffer = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = i / len;
  }
  return buffer;
}

describe("random-slice", () => {
  it("liste les modes disponibles", () => {
    expect(listeModesDecoupe()).toContain("Random");
    expect(listeModesDecoupe()).toContain("Original");
    expect(listeModesDecoupe()).toContain("Reverse");
  });

  it("conserve le nombre de canaux et la fréquence d'échantillonnage", () => {
    const sr = 44100;
    const buffer = createRampBuffer(sr, 2);
    const out = appliquerDecoupeAleatoire(buffer, 8, 0, "Random", 42);
    expect(out.numberOfChannels).toBe(2);
    expect(out.sampleRate).toBe(sr);
  });

  it("mode Original sans crossfade = sortie identique à l'entrée", () => {
    const sr = 44100;
    const buffer = createRampBuffer(sr, 1);
    const out = appliquerDecoupeAleatoire(buffer, 4, 0, "Original", 0);
    expect(out.length).toBe(buffer.length);
    for (let c = 0; c < 2; c++) {
      const src = buffer.getChannelData(c);
      const dst = out.getChannelData(c);
      for (let i = 0; i < src.length; i++) {
        expect(dst[i]).toBeCloseTo(src[i], 10);
      }
    }
  });

  it("mode Reverse inverse les parts", () => {
    const sr = 44100;
    const buffer = new AudioBuffer({ numberOfChannels: 1, length: 100, sampleRate: sr });
    const src = buffer.getChannelData(0);
    for (let i = 0; i < 100; i++) src[i] = i;
    const out = appliquerDecoupeAleatoire(buffer, 4, 0, "Reverse", 0);
    expect(out.length).toBe(100);
    const dst = out.getChannelData(0);
    // 4 parts de 25 échantillons. Reverse => part 3,2,1,0.
    expect(dst[0]).toBe(75);
    expect(dst[25]).toBe(50);
    expect(dst[50]).toBe(25);
    expect(dst[75]).toBe(0);
  });

  it("mode Random avec même graine produit le même résultat", () => {
    const sr = 44100;
    const buffer = createRampBuffer(sr, 1);
    const out1 = appliquerDecoupeAleatoire(buffer, 8, 5, "Random", 123);
    const out2 = appliquerDecoupeAleatoire(buffer, 8, 5, "Random", 123);
    expect(out1.length).toBe(out2.length);
    for (let c = 0; c < 1; c++) {
      const a = out1.getChannelData(c);
      const b = out2.getChannelData(c);
      for (let i = 0; i < a.length; i++) {
        expect(a[i]).toBeCloseTo(b[i], 10);
      }
    }
  });

  it("mode Random avec graines différentes produit un ordre différent", () => {
    const sr = 44100;
    const buffer = createRampBuffer(sr, 1);
    const out1 = appliquerDecoupeAleatoire(buffer, 8, 0, "Random", 111);
    const out2 = appliquerDecoupeAleatoire(buffer, 8, 0, "Random", 222);
    let diff = 0;
    for (let c = 0; c < 2; c++) {
      const a = out1.getChannelData(c);
      const b = out2.getChannelData(c);
      for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) > 1e-6) diff++;
      }
    }
    expect(diff).toBeGreaterThan(0);
  });
});
