// audio/math-formules.test.ts — Tests des processeurs audio par formules mathématiques.
import { describe, it, expect, beforeAll } from "vitest";
import { appliquerFormuleEchantillons, genererAudioFormule, appliquerFormuleSpectrale } from "./math-formules";

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
  (globalThis as unknown as any).AudioBuffer = AudioBufferPolyfill;
});

const SR = 44100;

function bufferSinus(freq: number, dureeS: number, channels = 1, amplitude = 1): any {
  const len = Math.floor(SR * dureeS);
  const b = new AudioBufferPolyfill({ numberOfChannels: channels, length: len, sampleRate: SR });
  for (let c = 0; c < channels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return b;
}

function rms(buf: any, channel = 0): number {
  const d = buf.getChannelData(channel);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / d.length);
}

describe("math-formules", () => {
  it("génère un sinus de 440 Hz", () => {
    const b = genererAudioFormule("sin(t * 2 * pi * 440)", 0.1, SR, 1);
    expect(b.numberOfChannels).toBe(1);
    expect(b.sampleRate).toBe(SR);
    expect(b.length).toBe(Math.round(0.1 * SR));
    expect(rms(b)).toBeGreaterThan(0.3);
    expect(rms(b)).toBeLessThanOrEqual(0.5);
  });

  it("génère du silence avec une formule vide", () => {
    const b = genererAudioFormule("", 0.05, SR, 2);
    expect(b.numberOfChannels).toBe(2);
    expect(rms(b, 0)).toBe(0);
    expect(rms(b, 1)).toBe(0);
  });

  it("normalise 'y = ...' en extraissant l'expression", () => {
    const b = genererAudioFormule("y = 0.5", 0.02, SR, 1);
    const d = b.getChannelData(0);
    expect(d.every((v: number) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
  });

  it("applique une formule identité sans modifier le signal", () => {
    const src = bufferSinus(440, 0.05, 1, 0.4);
    const out = appliquerFormuleEchantillons(src, "x");
    expect(out.length).toBe(src.length);
    const dSrc = src.getChannelData(0);
    const dOut = out.getChannelData(0);
    for (let i = 0; i < dSrc.length; i++) expect(dOut[i]).toBeCloseTo(dSrc[i], 6);
  });

  it("divise l'amplitude par deux", () => {
    const src = bufferSinus(440, 0.05, 1, 0.4);
    const out = appliquerFormuleEchantillons(src, "x * 0.5");
    expect(rms(out)).toBeCloseTo(rms(src) * 0.5, 2);
  });

  it("ajoute une sinusoïde à un signal existant", () => {
    const src = bufferSinus(440, 0.05, 1, 0.1);
    const out = appliquerFormuleEchantillons(src, "x + sin(t * 2 * pi * 1000) * 0.2");
    expect(rms(out)).toBeGreaterThan(rms(src));
  });

  it("conserve une formule spectrale identité", () => {
    const src = bufferSinus(440, 0.1);
    const out = appliquerFormuleSpectrale(src, "mag", "", 1024);
    expect(out.length).toBe(src.length);
    expect(out.numberOfChannels).toBe(src.numberOfChannels);
    expect(rms(out)).toBeGreaterThan(0.3);
  });

  it("annule le signal avec une magnitude nulle", () => {
    const src = bufferSinus(440, 0.1);
    const out = appliquerFormuleSpectrale(src, "0", "", 1024);
    expect(rms(out)).toBeLessThan(0.01);
  });

  it("double l'amplitude spectrale", () => {
    const src = bufferSinus(440, 0.1, 1, 0.2);
    const out = appliquerFormuleSpectrale(src, "mag * 2", "", 1024);
    expect(rms(out)).toBeGreaterThan(rms(src) * 1.5);
  });

  it("limite les échantillons d'une formule générée hors plage", () => {
    const b = genererAudioFormule("1000", 0.02, SR, 1);
    const d = b.getChannelData(0);
    expect(Math.max(...d)).toBeLessThanOrEqual(0.5);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(-0.5);
  });

  it("limite les échantillons d'une formule échantillons hors plage", () => {
    const src = bufferSinus(440, 0.02);
    const out = appliquerFormuleEchantillons(src, "x * 1000");
    const d = out.getChannelData(0);
    expect(Math.max(...d)).toBeLessThanOrEqual(0.5);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(-0.5);
  });

  it("limite une formule spectrale à amplification extrême", () => {
    const src = bufferSinus(440, 0.1);
    const out = appliquerFormuleSpectrale(src, "mag * 10000", "", 1024);
    const d = out.getChannelData(0);
    expect(Math.max(...d)).toBeLessThanOrEqual(0.5);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(-0.5);
  });
});
