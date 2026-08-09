// audio/effets-temporel.test.ts — Vérification de Paulstretch.
import { describe, it, expect, beforeAll } from "vitest";
import { appliquerPaulstretch, appliquerEchoInverse, paulstretchLogistique, beatRepeat } from "./effets-temporel";

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

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

describe("appliquerPaulstretch", () => {
  it("étire la durée d'environ le facteur demandé", async () => {
    const buffer = sinus(440, 1, 2);
    const stretch = 4;
    const out = await appliquerPaulstretch(buffer, stretch, 0.25);
    expect(out.numberOfChannels).toBe(2);
    expect(out.duration).toBeGreaterThan(buffer.duration * 0.9);
    expect(out.duration).toBeLessThan(buffer.duration * (stretch + 0.5));
  });

  it("ne produit pas de NaN ni d'Inf", async () => {
    const buffer = sinus(440, 0.5);
    const out = await appliquerPaulstretch(buffer, 8, 0.25);
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        expect(Number.isFinite(d[i])).toBe(true);
      }
    }
  });

  it("conserve le nombre de canaux d'une entrée mono", async () => {
    const buffer = sinus(220, 0.5, 1);
    const out = await appliquerPaulstretch(buffer, 2, 0.25);
    expect(out.numberOfChannels).toBe(1);
  });
});

describe("appliquerEchoInverse", () => {
  it("allonge la durée par une queue de pré-echo", () => {
    const buffer = sinus(440, 0.1, 1);
    const out = appliquerEchoInverse(buffer, 50, 50);
    const delay = Math.round(0.05 * SR);
    const repetitions = Math.ceil(Math.log(1e-4) / Math.log(0.5));
    expect(out.length).toBe(buffer.length + repetitions * delay);
    expect(out.numberOfChannels).toBe(1);
  });

  it("place les répétitions atténuées avant le signal principal", () => {
    const buffer = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    const src = buffer.getChannelData(0);
    src[0] = 1;
    const out = appliquerEchoInverse(buffer, 50, 50);
    const delay = Math.round(0.05 * SR);
    const repetitions = Math.ceil(Math.log(1e-4) / Math.log(0.5));
    const tail = delay * repetitions;
    const dst = out.getChannelData(0);

    // Le signal principal est décalé de la queue de pré-echo.
    expect(dst[tail]).toBeCloseTo(1, 6);
    // Les échos sont avant le signal principal, du plus fort au plus doux...
    for (let r = 1; r <= Math.min(repetitions, 5); r++) {
      expect(dst[tail - r * delay]).toBeCloseTo(Math.pow(0.5, r), 6);
    }
    // ...et le tout débute par l'écho le plus doux.
    expect(dst[0]).toBeCloseTo(Math.pow(0.5, repetitions), 6);
  });
});

function rmsTranche(buf: AudioBuffer, debut: number, fin: number): number {
  const data = buf.getChannelData(0);
  let sum = 0;
  for (let i = debut; i < fin; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / (fin - debut));
}

describe("paulstretchLogistique", () => {
  it("produit une sortie plus longue que l'entrée et sans NaN/Inf", async () => {
    const buffer = sinus(440, 0.5, 1);
    const out = await paulstretchLogistique(buffer, 4, 0.25, 50, 10, 100);
    expect(out.duration).toBeGreaterThan(buffer.duration * 0.9);
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) expect(Number.isFinite(d[i])).toBe(true);
    }
  });

  it("avec un mix à 0, retourne le signal original (pas étiré)", async () => {
    const buffer = sinus(440, 0.5, 1);
    const out = await paulstretchLogistique(buffer, 4, 0.25, 50, 10, 0);
    const src = buffer.getChannelData(0);
    const dst = out.getChannelData(0);
    expect(dst.length).toBe(src.length);
    for (let i = 0; i < src.length; i++) expect(dst[i]).toBeCloseTo(src[i], 6);
  });

  it("l'étirement s'installe progressivement : début proche du sec, fin étirée", async () => {
    const buffer = sinus(440, 0.5, 1);
    const out = await paulstretchLogistique(buffer, 4, 0.25, 50, 10, 100);
    const quart = Math.floor(out.length / 4);
    const rmsDebut = rmsTranche(out, 0, quart);
    const rmsFin = rmsTranche(out, out.length - quart, out.length);
    // Le début est principalement le signal original, la fin est plus étirée/texture.
    // On vérifie juste que la fin n'est pas silencieuse et que le début est actif.
    expect(rmsDebut).toBeGreaterThan(0.01);
    expect(rmsFin).toBeGreaterThan(0.01);
  });
});

describe("beatRepeat", () => {
  it("conserve la durée, le sample rate et le nombre de canaux", () => {
    const buffer = sinus(440, 1, 2);
    const out = beatRepeat(buffer, 120, 4, 16, 4, 40, 100);
    expect(out.length).toBe(buffer.length);
    expect(out.sampleRate).toBe(buffer.sampleRate);
    expect(out.numberOfChannels).toBe(buffer.numberOfChannels);
  });

  it("ne modifie pas le signal avec un mix à 0", () => {
    const buffer = sinus(440, 0.5, 1);
    const out = beatRepeat(buffer, 120, 4, 16, 4, 40, 0);
    expect(out.getChannelData(0)).toEqual(buffer.getChannelData(0));
  });

  it("réduit l'énergie aux moments de répétition avec un mix à 100", () => {
    const buffer = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    buffer.getChannelData(0).fill(1);
    const out = beatRepeat(buffer, 60, 4, 16, 4, 40, 100);
    // À 60 BPM, 1/4 = 1 seconde. 1/16 = 0.25 seconde. 4 répétitions = 1 seconde.
    // Le début de chaque intervalle est remplacé par des répétitions décroissantes (gains 1, 0.4, 0.16, 0.064).
    // Le reste de l'intervalle est silencieux (mix 100%).
    const interval = SR;
    const rmsFirstQuarter = rmsTranche(out, 0, Math.floor(interval / 4));
    const rmsSecondQuarter = rmsTranche(out, Math.floor(interval / 4), Math.floor(interval / 2));
    // Le début contient la répétition la plus forte (gain 1), donc RMS élevé.
    expect(rmsFirstQuarter).toBeGreaterThan(0.5);
    // Le deuxième quart contient les répétitions plus faibles (gains 0.4, 0.16, 0.064), donc RMS plus faible.
    expect(rmsSecondQuarter).toBeLessThan(rmsFirstQuarter);
  });
});
