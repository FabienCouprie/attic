// plugins/melangeur-logistique.test.ts
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

function makeBuffer(len: number, value: number, sampleRate = 44100) {
  const b = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate });
  b.getChannelData(0).fill(value);
  return b;
}

function ctx(a1: AudioBuffer, a2: AudioBuffer | null, params: Record<string, number>) {
  return {
    entree: (idx: number) => (idx === 0 ? a1 : a2),
    entrees: () => [a1, a2],
    paramTexte: () => "",
    paramNombre: (nom: string, def: number) => params[nom] ?? def,
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

describe("mélangeur logistique", () => {
  it("renvoie null si une entrée manque", async () => {
    const f = registre.trouverDef("melangeur-logistique")!;
    const b = makeBuffer(100, 1);
    const res = await f.executer(ctx(b, null, {}) as any);
    expect(res.valeurs[0]).toBeNull();
  });

  it("passe de l'entrée 1 à l'entrée 2 selon une courbe logistique", async () => {
    const f = registre.trouverDef("melangeur-logistique")!;
    const b1 = makeBuffer(1000, 1, 44100);
    const b2 = makeBuffer(1000, 2, 44100);
    const res = await f.executer(ctx(b1, b2, { Centre: 50, Pente: 10, Volume: 100 }) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    const out = res.valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    expect(d[0]).toBeGreaterThan(0.99);
    expect(d[d.length - 1]).toBeGreaterThan(1.99);
    expect(d[Math.floor(d.length / 2)]).toBeCloseTo(1.5, 1);
  });

  it("respecte le paramètre Centre", async () => {
    const f = registre.trouverDef("melangeur-logistique")!;
    const b1 = makeBuffer(1000, 1, 44100);
    const b2 = makeBuffer(1000, 2, 44100);
    const res = await f.executer(ctx(b1, b2, { Centre: 25, Pente: 20, Volume: 100 }) as any);
    const out = res.valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    const i25 = Math.floor(d.length * 0.25);
    expect(d[i25]).toBeCloseTo(1.5, 1);
  });

  it("applique le volume", async () => {
    const f = registre.trouverDef("melangeur-logistique")!;
    const b1 = makeBuffer(1000, 1, 44100);
    const b2 = makeBuffer(1000, 2, 44100);
    const res = await f.executer(ctx(b1, b2, { Centre: 50, Pente: 10, Volume: 50 }) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.getChannelData(0)[0]).toBeCloseTo(0.5, 1);
  });
});
