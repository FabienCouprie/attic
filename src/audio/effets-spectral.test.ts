// audio/effets-spectral.test.ts — Vérification des fonctions de changement de tonalité et glissando.
import "node-web-audio-api/polyfill.js";
import { AudioBuffer as AudioBufferNWA } from "node-web-audio-api";
import { describe, it, expect, beforeAll } from "vitest";
import { changerTonalite, glissandoTonalite, equaliser } from "./effets-spectral";

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

function compterZeroCrossings(buf: AudioBuffer, debut = 0, fin = buf.length): number {
  const data = buf.getChannelData(0);
  let count = 0;
  for (let i = Math.max(1, debut); i < Math.min(fin, data.length); i++) {
    if (data[i] * data[i - 1] < 0) count++;
  }
  return count;
}

function sinusWebAudio(freq: number, dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new AudioBufferNWA({ numberOfChannels: channels, length: n, sampleRate: SR }) as any;
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return b;
}

function rms(buf: AudioBuffer): number {
  const data = buf.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

describe("changerTonalite", () => {
  it("transpose une sinusoïde de +12 demi-tons", () => {
    const buffer = sinus(440, 1);
    const out = changerTonalite(buffer, 12);
    expect(out.duration).toBeCloseTo(buffer.duration, 1);
    const zc = compterZeroCrossings(out);
    const originalZc = compterZeroCrossings(buffer);
    // Fréquence doublée → environ 2 fois plus de zero-crossings, avec une marge pour les artefacts.
    expect(zc).toBeGreaterThan(originalZc * 1.5);
  });
});

describe("glissandoTonalite", () => {
  it("préserve la durée totale", () => {
    const buffer = sinus(440, 1);
    const out = glissandoTonalite(buffer, 0, 12);
    expect(out.duration).toBeCloseTo(buffer.duration, 1);
  });

  it("retombe sur un pitch-shift statique quand début == fin", () => {
    const buffer = sinus(440, 1);
    const out = glissandoTonalite(buffer, 7, 7);
    expect(out.duration).toBeCloseTo(buffer.duration, 1);
    const zc = compterZeroCrossings(out);
    const originalZc = compterZeroCrossings(buffer);
    expect(zc).toBeGreaterThan(originalZc * 1.2);
  });

  it("fait monter la fréquence d'un glissando 0→+12 demi-tons", () => {
    const buffer = sinus(440, 1);
    const out = glissandoTonalite(buffer, 0, 12);
    const tailleFenetre = Math.floor(0.2 * SR);
    const zcFin = compterZeroCrossings(out, out.length - tailleFenetre, out.length);
    const zcOrigFin = compterZeroCrossings(buffer, buffer.length - tailleFenetre, buffer.length);
    // À la fin, la fréquence doit être nettement plus haute (autour de +12 semitones).
    expect(zcFin).toBeGreaterThan(zcOrigFin * 1.5);
  });

  it("fait descendre la fréquence d'un glissando 0→-12 demi-tons", () => {
    const buffer = sinus(440, 1);
    const out = glissandoTonalite(buffer, 0, -12);
    const tailleFenetre = Math.floor(0.2 * SR);
    const zcFin = compterZeroCrossings(out, out.length - tailleFenetre, out.length);
    const zcOrigFin = compterZeroCrossings(buffer, buffer.length - tailleFenetre, buffer.length);
    expect(zcFin).toBeLessThan(zcOrigFin * 0.7);
  });
});

describe("equaliser", () => {
  it("conserve la durée et le sample rate avec un EQ plat", async () => {
    const buffer = sinusWebAudio(1000, 1);
    const gains = Array.from({ length: 9 }, () => 0);
    const out = await equaliser(buffer, ...gains);
    expect(out.duration).toBeCloseTo(buffer.duration, 1);
    expect(out.sampleRate).toBe(buffer.sampleRate);
  });

  it("boost 1 kHz augmente le niveau d'un sinus 1 kHz", async () => {
    const buffer = sinusWebAudio(1000, 1);
    const gains = Array.from({ length: 9 }, () => 0);
    gains[5] = 12;
    const out = await equaliser(buffer, ...gains);
    expect(rms(out)).toBeGreaterThan(rms(buffer) * 1.5);
  });

  it("cut 1 kHz diminue le niveau d'un sinus 1 kHz", async () => {
    const buffer = sinusWebAudio(1000, 1);
    const gains = Array.from({ length: 9 }, () => 0);
    gains[5] = -12;
    const out = await equaliser(buffer, ...gains);
    expect(rms(out)).toBeLessThan(rms(buffer) * 0.7);
  });
});
