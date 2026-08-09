// audio/continuation-spectrale.test.ts — Tests de la prolongation spectrale.
import { describe, it, expect } from "vitest";
import { appliquerContinuationSpectrale } from "./continuation-spectrale";

class AudioBufferPolyfill {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private canaux: Float32Array[];
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.duration = opts.length / opts.sampleRate;
    this.canaux = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(c: number): Float32Array { return this.canaux[c]; }
  copyToChannel(src: Float32Array, c: number): void { this.canaux[c].set(src.subarray(0, this.length)); }
}

(globalThis as any).AudioBuffer = AudioBufferPolyfill;

const SR = 16000;

function sinus(freq: number, dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: channels, length: n, sampleRate: SR });
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return b;
}

describe("appliquerContinuationSpectrale", () => {
  const optionsBase = {
    fftSize: 256,
    hopPercent: 25,
    dureeGenereS: 0.1,
    history: 2,
    hiddenUnits: 16,
    activation: "relu" as const,
    epochs: 5,
    learningRate: 0.001,
    seed: 1,
    budgetMs: 5000,
    onProgress: () => {},
  };

  it("AR : prolonge un sinus court et conserve le sample rate / canaux", async () => {
    const buffer = sinus(440, 0.2, 1);
    const { audio, message } = await appliquerContinuationSpectrale(buffer, { ...optionsBase, mode: "ar" });
    expect(audio.sampleRate).toBe(SR);
    expect(audio.numberOfChannels).toBe(1);
    expect(audio.length).toBeGreaterThan(buffer.length);
    expect(message).toContain("AR");
  }, 20000);

  it("LSTM : prolonge un sinus court et conserve le sample rate / canaux", async () => {
    const buffer = sinus(880, 0.2, 2);
    const { audio, message } = await appliquerContinuationSpectrale(buffer, { ...optionsBase, mode: "lstm" });
    expect(audio.sampleRate).toBe(SR);
    expect(audio.numberOfChannels).toBe(2);
    expect(audio.length).toBeGreaterThan(buffer.length);
    expect(message).toContain("LSTM");
  }, 20000);

  it("AR : le résultat est déterministe avec la même graine", async () => {
    const buffer = sinus(220, 0.15, 1);
    const res1 = await appliquerContinuationSpectrale(buffer, { ...optionsBase, mode: "ar" });
    const res2 = await appliquerContinuationSpectrale(buffer, { ...optionsBase, mode: "ar" });
    expect(res1.audio.length).toBe(res2.audio.length);
    expect(res1.audio.sampleRate).toBe(res2.audio.sampleRate);
    const a = res1.audio.getChannelData(0);
    const b = res2.audio.getChannelData(0);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    expect(diff).toBeLessThan(1e-3);
  }, 20000);
});
