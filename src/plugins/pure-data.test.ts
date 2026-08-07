// plugins/pure-data.test.ts — Vérification de l'enregistrement du nœud Pure Data.
import { describe, it, expect } from "vitest";
import { fiches } from "./pure-data";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

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

describe("nœud Pure Data", () => {
  it("le nœud pure-data est enregistré", () => {
    expect(trouver("pure-data")).toBeDefined();
  });

  it("retourne une erreur si aucun patch n'est chargé", async () => {
    const f = trouver("pure-data")!;
    (globalThis as any).AudioBuffer = AudioBufferPolyfill;
    const ctx = {
      noeud: { data: {} },
      paramTexte: (nom: string, defaut: string) => defaut,
      paramNombre: (nom: string, defaut: number) => defaut,
    };
    const res = await f.executer(ctx as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("Aucun patch");
  });
});
