// @vitest-environment jsdom
// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { genererIRFractal, reverberationFractale, type OptionsReverbFractal } from "./reverb-fractal";

function bufferNonSilencieux(buf: AudioBuffer): boolean {
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      if (Math.abs(d[i]) > 1e-6) return true;
    }
  }
  return false;
}

function creerImpulsion(sr = 44100): AudioBuffer {
  const buf = new AudioBuffer({ numberOfChannels: 1, length: sr, sampleRate: sr });
  buf.getChannelData(0)[0] = 1;
  return buf;
}

describe("reverb fractale", () => {
  it("génère une réponse impulsionnelle non vide", () => {
    const ir = genererIRFractal({
      decay: 1,
      preDelay: 0,
      densite: 3,
      gainDecay: 0.7,
      damping: 20,
      diffusion: 0.5,
      graine: 42,
      sampleRate: 44100,
    });
    expect(ir.numberOfChannels).toBe(2);
    expect(ir.length).toBeGreaterThan(0);
    expect(bufferNonSilencieux(ir)).toBe(true);
  });

  it("respecte la durée demandée", () => {
    const ir = genererIRFractal({
      decay: 2,
      preDelay: 100,
      densite: 4,
      gainDecay: 0.6,
      damping: 30,
      diffusion: 0.6,
      graine: 42,
      sampleRate: 44100,
    });
    expect(ir.duration).toBeCloseTo(2.1, 1); // decay + pre-delay
  });

  it("augmente la densité avec la profondeur", () => {
    const opts: OptionsReverbFractal = {
      decay: 1, preDelay: 0, densite: 2, gainDecay: 0.7, damping: 0, diffusion: 0.5, graine: 42, sampleRate: 44100,
    };
    const irFaible = genererIRFractal(opts);
    const irDense = genererIRFractal({ ...opts, densite: 6 });
    let countFaible = 0, countDense = 0;
    for (let ch = 0; ch < 2; ch++) {
      const d = irFaible.getChannelData(ch);
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1e-4) countFaible++;
      const d2 = irDense.getChannelData(ch);
      for (let i = 0; i < d2.length; i++) if (Math.abs(d2[i]) > 1e-4) countDense++;
    }
    expect(countDense).toBeGreaterThan(countFaible);
  });

  it("convolue un signal d'entrée", async () => {
    const entree = creerImpulsion();
    const sortie = await reverberationFractale(entree, {
      decay: 0.5,
      preDelay: 0,
      densite: 3,
      gainDecay: 0.7,
      damping: 20,
      diffusion: 0.5,
      graine: 42,
    }, 50);
    expect(sortie.numberOfChannels).toBe(1);
    expect(sortie.duration).toBeGreaterThan(entree.duration);
    expect(bufferNonSilencieux(sortie)).toBe(true);
  });

  it("convolue une entrée stéréo en conservant 2 canaux", async () => {
    const entree = new AudioBuffer({ numberOfChannels: 2, length: 44100, sampleRate: 44100 });
    entree.getChannelData(0)[0] = 1;
    entree.getChannelData(1)[0] = 1;
    const sortie = await reverberationFractale(entree, {
      decay: 0.5,
      preDelay: 10,
      densite: 3,
      gainDecay: 0.7,
      damping: 20,
      diffusion: 0.5,
      graine: 42,
    }, 50);
    expect(sortie.numberOfChannels).toBe(2);
    expect(bufferNonSilencieux(sortie)).toBe(true);
  });
});
