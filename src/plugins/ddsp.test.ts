// plugins/ddsp.test.ts — Vérification de l’enregistrement du nœud DDSP.
import { describe, it, expect, beforeAll } from "vitest";
import { fiches } from "./ddsp";

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

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

describe("nœud DDSP", () => {
  it("le nœud tone-transfer est enregistré", () => {
    expect(trouver("ddsp-tone-transfer")).toBeDefined();
  });

  it("retourne une erreur si aucun audio n'est connecté", async () => {
    const f = trouver("ddsp-tone-transfer")!;
    const ctx = {
      entree: () => null,
      paramTexte: (_nom: string, defaut: string) => defaut,
      paramNombre: (_nom: string, defaut: number) => defaut,
    };
    const res = await f.executer(ctx as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("audio");
  });
});
