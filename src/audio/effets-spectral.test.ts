// audio/effets-spectral.test.ts — Vérification des fonctions de changement de tonalité et glissando.
import "node-web-audio-api/polyfill.js";
import { AudioBuffer as AudioBufferNWA } from "node-web-audio-api";
import { describe, it, expect, beforeAll } from "vitest";
import { changerTonalite, glissandoTonalite, equaliser, panLogistique, vibratoLogistique, tremoloLogistique, echoLogistique, chopperLogistique, spatialiserStereo } from "./effets-spectral";

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

function constant(dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: channels, length: n, sampleRate: SR });
  for (let ch = 0; ch < channels; ch++) b.getChannelData(ch).fill(1);
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

function rmsCanal(buf: AudioBuffer, canal: number): number {
  const data = buf.getChannelData(canal);
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

describe("panLogistique", () => {
  it("passe un signal mono de la gauche vers la droite", () => {
    const buffer = constant(1, 1);
    const out = panLogistique(buffer, 50, 10, 100);
    expect(out.numberOfChannels).toBe(2);
    const left = out.getChannelData(0);
    const right = out.getChannelData(1);
    expect(left[0]).toBeGreaterThan(0.95);
    expect(right[0]).toBeLessThan(0.05);
    expect(left[left.length - 1]).toBeLessThan(0.05);
    expect(right[right.length - 1]).toBeGreaterThan(0.95);
  });

  it("ne modifie pas le signal avec un mix à 0", () => {
    const buffer = constant(1, 1);
    const out = panLogistique(buffer, 50, 10, 0);
    expect(out.getChannelData(0)[0]).toBeCloseTo(1, 5);
    expect(out.getChannelData(1)[0]).toBeCloseTo(1, 5);
  });
});

function rmsTranche(buf: AudioBuffer, debut: number, fin: number): number {
  const data = buf.getChannelData(0);
  let sum = 0;
  for (let i = debut; i < fin; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / (fin - debut));
}

describe("vibratoLogistique", () => {
  it("conserve la durée, le sample rate et le nombre de canaux", () => {
    const buffer = sinus(440, 1, 2);
    const out = vibratoLogistique(buffer, 5, 50, 50, 10, 100);
    expect(out.duration).toBeCloseTo(buffer.duration, 1);
    expect(out.sampleRate).toBe(buffer.sampleRate);
    expect(out.numberOfChannels).toBe(buffer.numberOfChannels);
  });

  it("ne modifie pas le signal avec un mix à 0", () => {
    const buffer = sinus(440, 1, 1);
    const out = vibratoLogistique(buffer, 5, 100, 50, 10, 0);
    expect(out.getChannelData(0)).toEqual(buffer.getChannelData(0));
  });

  it("modifie le signal quand la profondeur et le mix sont non nuls", () => {
    const buffer = sinus(440, 1, 1);
    const out = vibratoLogistique(buffer, 10, 100, 50, 10, 100);
    let diff = 0;
    for (let i = 0; i < buffer.length; i++) diff += Math.abs(out.getChannelData(0)[i] - buffer.getChannelData(0)[i]);
    expect(diff / buffer.length).toBeGreaterThan(0.01);
  });
});

describe("tremoloLogistique", () => {
  it("conserve la durée, le sample rate et le nombre de canaux", () => {
    const buffer = constant(1, 2);
    const out = tremoloLogistique(buffer, 5, 50, 50, 10, 100);
    expect(out.duration).toBeCloseTo(buffer.duration, 1);
    expect(out.sampleRate).toBe(buffer.sampleRate);
    expect(out.numberOfChannels).toBe(buffer.numberOfChannels);
  });

  it("ne modifie pas le signal avec un mix à 0", () => {
    const buffer = constant(1, 1);
    const out = tremoloLogistique(buffer, 5, 100, 50, 10, 0);
    expect(out.getChannelData(0)).toEqual(buffer.getChannelData(0));
  });

  it("l'effet s'installe progressivement : début fort, fin affaiblie", () => {
    const buffer = constant(1, 1);
    const out = tremoloLogistique(buffer, 20, 100, 50, 10, 100);
    const quart = Math.floor(buffer.length / 4);
    const rmsDebut = rmsTranche(out, 0, quart);
    const rmsFin = rmsTranche(out, buffer.length - quart, buffer.length);
    expect(rmsDebut).toBeGreaterThan(0.95);
    expect(rmsFin).toBeLessThan(0.8);
  });
});

describe("echoLogistique", () => {
  it("conserve la durée, le sample rate et le nombre de canaux", () => {
    const buffer = sinus(440, 1, 2);
    const out = echoLogistique(buffer, 100, 40, 50, 10, 50);
    expect(out.duration).toBeCloseTo(buffer.duration, 1);
    expect(out.sampleRate).toBe(buffer.sampleRate);
    expect(out.numberOfChannels).toBe(buffer.numberOfChannels);
  });

  it("ne modifie pas le signal avec un mix à 0", () => {
    const buffer = sinus(440, 1, 1);
    const out = echoLogistique(buffer, 100, 40, 50, 10, 0);
    expect(out.getChannelData(0)).toEqual(buffer.getChannelData(0));
  });

  it("l'écho s'installe progressivement : peu de répétitions au début, plus à la fin", () => {
    const buffer = constant(1, 1);
    const out = echoLogistique(buffer, 100, 40, 50, 10, 100);
    const quart = Math.floor(buffer.length / 4);
    const rmsDebut = rmsTranche(out, 0, quart);
    const rmsFin = rmsTranche(out, buffer.length - quart, buffer.length);
    // La fin doit être plus riche en répétitions (énergie plus élevée) qu'au début.
    expect(rmsFin).toBeGreaterThan(rmsDebut);
    // On doit observer au moins une répétition audible après le délai initial.
    const data = out.getChannelData(0);
    expect(data.some((s: number) => Math.abs(s) > 0.1)).toBe(true);
  });
});

describe("chopperLogistique", () => {
  it("conserve la durée, le sample rate et le nombre de canaux", () => {
    const buffer = sinus(440, 1, 2);
    const out = chopperLogistique(buffer, 4, 50, 0, 50, 50, 10, 100);
    expect(out.duration).toBeCloseTo(buffer.duration, 1);
    expect(out.sampleRate).toBe(buffer.sampleRate);
    expect(out.numberOfChannels).toBe(buffer.numberOfChannels);
  });

  it("ne modifie pas le signal avec un mix à 0", () => {
    const buffer = sinus(440, 1, 1);
    const out = chopperLogistique(buffer, 4, 50, 0, 100, 50, 10, 0);
    expect(out.getChannelData(0)).toEqual(buffer.getChannelData(0));
  });

  it("ne modifie pas le signal avec une profondeur à 0", () => {
    const buffer = sinus(440, 1, 1);
    const out = chopperLogistique(buffer, 4, 50, 0, 0, 50, 10, 100);
    expect(out.getChannelData(0)).toEqual(buffer.getChannelData(0));
  });

  it("le gate s'installe progressivement : début intact, fin coupé", () => {
    const buffer = constant(1, 1);
    const out = chopperLogistique(buffer, 4, 50, 0, 100, 50, 10, 100);
    const quart = Math.floor(buffer.length / 4);
    const rmsDebut = rmsTranche(out, 0, quart);
    const rmsFin = rmsTranche(out, buffer.length - quart, buffer.length);
    // Le début est quasi intact (pas encore de gate), la fin est coupée (RMS ≈ 0.7 pour un carré 50% duty).
    expect(rmsDebut).toBeGreaterThan(0.95);
    expect(rmsFin).toBeLessThan(0.8);
    expect(rmsFin).toBeLessThan(rmsDebut);
  });
});

describe("spatialiserStereo", () => {
  it("mixe une entrée stéréo « droite seule » en mono avant de spatialiser", async () => {
    const n = Math.floor(SR * 0.2);
    const buffer = new AudioBufferNWA({ numberOfChannels: 2, length: n, sampleRate: SR }) as any;
    buffer.getChannelData(0).fill(0);
    buffer.getChannelData(1).fill(1);
    const out = await spatialiserStereo(buffer, 0, 1);
    expect(out.numberOfChannels).toBe(2);
    // Avant correction, le canal gauche restait à 0. Après mixage mono, les deux
    // canaux portent du signal (même si HRTF les balance légèrement).
    expect(rmsCanal(out, 0)).toBeGreaterThan(0.01);
    expect(rmsCanal(out, 1)).toBeGreaterThan(0.01);
  });
});
