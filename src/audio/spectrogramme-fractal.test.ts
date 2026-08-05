// @vitest-environment jsdom
// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { rendreSpectrogrammeFractal, synthetiserDepuisSpectrogramme } from "./spectrogramme-fractal";

function bufferNonSilencieux(buf: AudioBuffer): boolean {
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      if (Math.abs(d[i]) > 1e-6) return true;
    }
  }
  return false;
}

describe("spectrogramme fractal", () => {
  it("synthétise un audio depuis un spectrogramme", () => {
    const sr = 44100;
    const fftSize = 512;
    const bins = fftSize / 2 + 1;
    const frames = 10;
    const spectro = Array.from({ length: frames }, () => Array.from({ length: bins }, () => Math.random()));
    const audio = synthetiserDepuisSpectrogramme(spectro, sr, fftSize, 0.75);
    expect(audio.sampleRate).toBe(sr);
    expect(audio.duration).toBeGreaterThan(0);
    expect(bufferNonSilencieux(audio)).toBe(true);
  });

  it("génère audio et optionnellement image", async () => {
    const result = await rendreSpectrogrammeFractal({
      duree: 1,
      sampleRate: 44100,
      fftSize: 512,
      overlap: 0.75,
      octaves: 3,
      roughness: 0.5,
      graine: 42,
      forme: "logarithmic",
    });
    expect(result.audio).toBeInstanceOf(AudioBuffer);
    expect(result.audio.duration).toBeGreaterThan(0.5);
    expect(bufferNonSilencieux(result.audio)).toBe(true);
    // Image is only available in browser with canvas.
  });

  it("produit des durées cohérentes", async () => {
    const a = await rendreSpectrogrammeFractal({ duree: 1, octaves: 2, roughness: 0.5, graine: 1 });
    const b = await rendreSpectrogrammeFractal({ duree: 3, octaves: 2, roughness: 0.5, graine: 1 });
    expect(b.audio.duration).toBeGreaterThan(a.audio.duration);
  });
});
