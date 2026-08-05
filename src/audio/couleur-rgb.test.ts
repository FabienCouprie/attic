// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { genererCouleurRGBAudio, parsePlage } from "./couleur-rgb";
import { frequenceDepuisValeur } from "./commun";

describe("couleur-rgb", () => {
  it("mappe une valeur 0-255 sur une plage de fréquences", () => {
    expect(frequenceDepuisValeur(0, 100, 1000)).toBe(100);
    expect(frequenceDepuisValeur(255, 100, 1000)).toBe(1000);
    expect(frequenceDepuisValeur(127, 100, 1000)).toBeCloseTo(548, 0);
  });

  it("parse une plage texte", () => {
    expect(parsePlage("100,1000", [50, 500])).toEqual([100, 1000]);
    expect(parsePlage("abc", [50, 500])).toEqual([50, 500]);
  });

  it("genere un audio stereo non silencieux", () => {
    const audio = genererCouleurRGBAudio({
      r: 255, g: 128, b: 64,
      duree: 0.5,
      volume: 80,
      canaux: 2,
      rouge: [100, 1000],
      vert: [500, 3000],
      bleu: [1000, 5000],
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

  it("genere un audio mono quand Canaux = Mono", () => {
    const audio = genererCouleurRGBAudio({
      r: 64, g: 64, b: 64,
      duree: 0.2,
      volume: 80,
      canaux: 1,
      rouge: [100, 1000],
      vert: [500, 3000],
      bleu: [1000, 5000],
      sampleRate: 22050,
    });
    expect(audio.numberOfChannels).toBe(1);
    expect(audio.sampleRate).toBe(22050);
  });
});
