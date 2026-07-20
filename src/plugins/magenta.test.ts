// plugins/magenta.test.ts — Vérification de l’enregistrement des nœuds Magenta.
// Les modèles @magenta/music nécessitent un navigateur + WebGL + réseau ;
// on ne teste ici que l’enregistrement et les validations d’entrée.
import { describe, it, expect, beforeAll, vi } from "vitest";
import { fiches } from "./magenta";

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

function ctxMidi(file: any) {
  return {
    entree: (idx: number) => (idx === 0 ? file : null),
    paramTexte: (nom: string, defaut: string) => defaut,
    paramNombre: (_nom: string, defaut: number) => defaut,
  };
}

function ctxMidi2(file1: any, file2: any) {
  return {
    entree: (idx: number) => (idx === 0 ? file1 : idx === 1 ? file2 : null),
    paramTexte: (nom: string, defaut: string) => defaut,
    paramNombre: (_nom: string, defaut: number) => defaut,
  };
}

describe("nœuds Magenta", () => {
  it("les sept fiches sont enregistrées", () => {
    const ids = [
      "magenta-drums", "magenta-continuation", "magenta-improvisation",
      "magenta-generer-melodie", "magenta-interpoler-midi", "magenta-generer-batterie",
      "magenta-humaniser-groove",
    ];
    for (const id of ids) expect(trouver(id)).toBeDefined();
  });

  it("la continuation retourne une erreur si aucun MIDI n'est connecté", async () => {
    const f = trouver("magenta-continuation")!;
    const res = await f.executer(ctxMidi(null) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("MIDI");
  });

  it("le générateur de mélodie retourne une erreur si aucun MIDI n'est connecté", async () => {
    const f = trouver("magenta-generer-melodie")!;
    const res = await f.executer(ctxMidi(null) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("MIDI");
  });

  it("l'interpolation retourne une erreur si un MIDI est manquant", async () => {
    const f = trouver("magenta-interpoler-midi")!;
    const res = await f.executer(ctxMidi2(null, null) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("MIDI");
  });

  it("l'humaniseur de groove retourne une erreur si aucun MIDI n'est connecté", async () => {
    const f = trouver("magenta-humaniser-groove")!;
    const res = await f.executer(ctxMidi(null) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("MIDI");
  });

});
