import { describe, it, expect, beforeAll } from "vitest";
import { griffinLim } from "./griffin-lim";

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

function makeSine(freq: number, sr: number, duration: number): AudioBuffer {
  const len = Math.round(sr * duration);
  const buf = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return buf as AudioBuffer;
}

function peakAbs(data: Float32Array): number {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > max) max = a;
  }
  return max;
}

function diffMax(a: Float32Array, b: Float32Array): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}

describe("griffinLim", () => {
  it("conserve la durée, le taux d'échantillonnage et le nombre de canaux", async () => {
    const src = makeSine(440, 44100, 0.5);
    const out = await griffinLim(src, 20, 2048, "75%", "aleatoire", 100);
    expect(out.sampleRate).toBe(src.sampleRate);
    expect(out.length).toBe(src.length);
    expect(out.numberOfChannels).toBe(src.numberOfChannels);
  });

  it("produit un signal non silencieux avec une phase aléatoire", async () => {
    const src = makeSine(440, 44100, 0.5);
    const out = await griffinLim(src, 30, 2048, "75%", "aleatoire", 100);
    expect(peakAbs(out.getChannelData(0))).toBeGreaterThan(0.1);
  });

  it("conserve approximativement la crête du signal original", async () => {
    const src = makeSine(440, 44100, 0.5);
    const out = await griffinLim(src, 30, 2048, "75%", "aleatoire", 100);
    const peakIn = peakAbs(src.getChannelData(0));
    const peakOut = peakAbs(out.getChannelData(0));
    expect(peakOut).toBeGreaterThan(0.5 * peakIn);
    expect(peakOut).toBeLessThanOrEqual(1.01);
  });

  it("avec phase originale, converge vers le signal original", async () => {
    const src = makeSine(440, 44100, 0.5);
    const out = await griffinLim(src, 60, 2048, "75%", "originale", 100);
    const diff = diffMax(src.getChannelData(0), out.getChannelData(0));
    expect(diff).toBeLessThan(0.05);
  });

  it("respecte le mix sec/mouillé", async () => {
    const src = makeSine(440, 44100, 0.5);
    const out = await griffinLim(src, 30, 2048, "75%", "aleatoire", 0);
    expect(diffMax(src.getChannelData(0), out.getChannelData(0))).toBeLessThan(1e-6);
  });

  it("produit un signal audible sur une entrée stéréo de 2 s", async () => {
    const sr = 48000;
    const len = 2 * sr;
    const buf = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = Math.sin((2 * Math.PI * 440 * i) / sr) + (Math.random() - 0.5) * 0.1;
      }
    }
    const out = await griffinLim(buf, 37, 2048, "75%", "aleatoire", 100);
    expect(out.numberOfChannels).toBe(2);
    const peakL = peakAbs(out.getChannelData(0));
    const peakR = peakAbs(out.getChannelData(1));
    expect(Math.max(peakL, peakR)).toBeGreaterThan(0.01);
  });

  it("produit un signal audible sur du bruit blanc", async () => {
    const sr = 44100;
    const len = sr;
    const buf = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() - 0.5) * 2;
    const out = await griffinLim(buf, 30, 2048, "75%", "aleatoire", 100);
    expect(peakAbs(out.getChannelData(0))).toBeGreaterThan(0.1);
  });
});
