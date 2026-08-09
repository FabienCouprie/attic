// plugins/pca-neuronale.test.ts — Tests du nœud PCA neuronale.
import { describe, it, expect, beforeAll } from "vitest";
import { fiches } from "./pca-neuronale";

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

const fiche = fiches.find((f) => f.id === "pca-neuronale")!;

function ctxDe(entree: AudioBuffer, params: Record<string, number | string> = {}) {
  return {
    entree: (i: number) => (i === 0 ? entree : null),
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
    onProgress: () => {},
    signal: { aborted: false },
  };
}

describe("pca-neuronale", () => {
  it("est enregistrée dans la bonne famille", () => {
    expect(fiche).toBeDefined();
    expect(fiche.id).toBe("pca-neuronale");
    expect(fiche.univers).toBe("Autres");
    expect(fiche.famille).toBe("Test zone");
  });

  it("produit un audio de même durée et canaux sur un sinus court", async () => {
    const buffer = sinus(440, 0.05, 1);
    const res = await fiche.executer(ctxDe(buffer, { FFT: "256", Axes: 4, Couches: 1, Époques: 5 }) as any);
    const audio = res.valeurs[0] as AudioBuffer;
    expect(audio).toBeDefined();
    expect(audio.length).toBe(buffer.length);
    expect(audio.numberOfChannels).toBe(1);
    expect(typeof res.message).toBe("string");
  }, 20000);
});
