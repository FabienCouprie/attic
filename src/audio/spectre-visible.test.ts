// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { rgbToHsl, hexToRgb } from "./couleurs";
import { longueurOndeDepuisHue, frequenceAudibleDepuisCouleur, genererSpectreVisibleAudio } from "./spectre-visible";

describe("spectre-visible", () => {
  it("convertit un hex en RGB", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("00ff00")).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb("#00f")).toEqual({ r: 0, g: 0, b: 255 });
    expect(hexToRgb("invalid")).toBeNull();
  });

  it("convertit RGB en HSL", () => {
    expect(rgbToHsl(255, 0, 0)[0]).toBeCloseTo(0, 0);
    expect(rgbToHsl(0, 255, 0)[0]).toBeCloseTo(120, 0);
    expect(rgbToHsl(0, 0, 255)[0]).toBeCloseTo(240, 0);
  });

  it("associe une longueur d'onde à la teinte", () => {
    expect(longueurOndeDepuisHue(0)).toBeCloseTo(700, 0);
    expect(longueurOndeDepuisHue(360)).toBeCloseTo(380, 0);
  });

  it("calcule une fréquence audible depuis une couleur", () => {
    const { frequence, longueurOnde } = frequenceAudibleDepuisCouleur(255, 0, 0, 3);
    expect(longueurOnde).toBeGreaterThan(600);
    expect(frequence).toBeGreaterThan(20);
    expect(frequence).toBeLessThan(20000);
  });

  it("genere un drone audio", () => {
    const audio = genererSpectreVisibleAudio({
      r: 128, g: 64, b: 200,
      octave: 3,
      duree: 0.5,
      volume: 80,
      canaux: 2,
      sampleRate: 44100,
    });
    expect(audio.sampleRate).toBe(44100);
    expect(audio.numberOfChannels).toBe(2);
    expect(audio.length).toBe(Math.round(0.5 * 44100));
    let nonSilencieux = false;
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
      const d = audio.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        if (Math.abs(d[i]) > 1e-6) nonSilencieux = true;
      }
    }
    expect(nonSilencieux).toBe(true);
  });
});
