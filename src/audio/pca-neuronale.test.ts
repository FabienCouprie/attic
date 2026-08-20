// audio/pca-neuronale.test.ts — Tests de la PCA neuronale.
import { describe, it, expect, beforeAll } from "vitest";
import { appliquerPcaNeuronale } from "./pca-neuronale";

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

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

const SR = 44100;

function sinus(freq: number, dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: channels, length: n, sampleRate: SR });
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return b;
}

const optsBase = {
  fftSize: 256,
  hopPercent: 50,
  latentDim: 8,
  hiddenLayers: 1,
  activation: "relu" as const,
  epochs: 10,
  learningRate: 0.01,
  seed: 1,
  budgetMs: 10000,
};

describe("appliquerPcaNeuronale", () => {
  it("conserve la durée, le sample rate et le nombre de canaux", async () => {
    const buffer = sinus(440, 0.1, 2);
    const { audio } = await appliquerPcaNeuronale(buffer, optsBase);
    expect(audio.numberOfChannels).toBe(2);
    expect(audio.length).toBe(buffer.length);
    expect(audio.sampleRate).toBe(buffer.sampleRate);
  });

  it("obtient une perte inférieure à la base triviale sur un sinus simple", async () => {
    const buffer = sinus(440, 0.1, 1);
    const { message } = await appliquerPcaNeuronale(buffer, { ...optsBase, epochs: 20 });
    const match = message.match(/perte ([\d.]+) \(base ([\d.]+)\)/);
    expect(match).toBeTruthy();
    const loss = parseFloat(match![1]);
    const base = parseFloat(match![2]);
    expect(loss).toBeLessThan(base);
  });

  it("est reproductible avec la même graine", async () => {
    const buffer = sinus(440, 0.05, 1);
    const opts = { ...optsBase, activation: "tanh" as const, seed: 42 };
    const a = await appliquerPcaNeuronale(buffer, opts);
    const b = await appliquerPcaNeuronale(buffer, opts);
    const chA = a.audio.getChannelData(0);
    const chB = b.audio.getChannelData(0);
    let diff = 0;
    for (let i = 0; i < chA.length; i++) diff += Math.abs(chA[i] - chB[i]);
    expect(diff).toBeLessThan(1e-3);
  });
});
