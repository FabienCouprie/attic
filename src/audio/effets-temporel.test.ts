// audio/effets-temporel.test.ts — Vérification de Paulstretch.
import { describe, it, expect, beforeAll } from "vitest";
import { appliquerPaulstretch, appliquerEchoInverse } from "./effets-temporel";

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
  it("étire la durée d'environ le facteur demandé", () => {
    const buffer = sinus(440, 1, 2);
    const stretch = 4;
    const out = appliquerPaulstretch(buffer, stretch, 0.25);
    expect(out.numberOfChannels).toBe(2);
    expect(out.duration).toBeGreaterThan(buffer.duration * 0.9);
    expect(out.duration).toBeLessThan(buffer.duration * (stretch + 0.5));
  });

  it("ne produit pas de NaN ni d'Inf", () => {
    const buffer = sinus(440, 0.5);
    const out = appliquerPaulstretch(buffer, 8, 0.25);
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        expect(Number.isFinite(d[i])).toBe(true);
      }
    }
  });

  it("conserve le nombre de canaux d'une entrée mono", () => {
    const buffer = sinus(220, 0.5, 1);
    const out = appliquerPaulstretch(buffer, 2, 0.25);
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
