// audio/effets-spectral.test.ts — Vérification des fonctions de changement de tonalité et glissando.
import { describe, it, expect, beforeAll } from "vitest";
import { changerTonalite, glissandoTonalite } from "./effets-spectral";

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
