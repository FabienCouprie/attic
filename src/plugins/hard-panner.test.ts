// plugins/hard-panner.test.ts
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

function ctx(entrees: unknown[], params: Record<string, string> = {}) {
  return {
    entree: (idx: number) => entrees[idx],
    entrees: () => entrees,
    paramTexte: (nom: string, def: string) => params[nom] ?? def,
    paramNombre: (_nom: string, def: number) => def,
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

function makeStereoBuffer(len: number, sampleRate: number) {
  const b = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate });
  const l = b.getChannelData(0);
  const r = b.getChannelData(1);
  for (let i = 0; i < len; i++) {
    l[i] = i;
    r[i] = -i;
  }
  return b;
}

describe("hard-panner", () => {
  it("hard-pan à gauche ne garde que le canal gauche", async () => {
    const def = registre.trouverDef("hard-panner")!;
    const stereo = makeStereoBuffer(10, 44100);
    const res = await def.executer(ctx([stereo], { Position: "Gauche" }) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    expect(out.getChannelData(0)).toEqual(stereo.getChannelData(0));
    expect(out.getChannelData(1)).toEqual(new Float32Array(10));
  });

  it("hard-pan à droite ne garde que le canal droit", async () => {
    const def = registre.trouverDef("hard-panner")!;
    const stereo = makeStereoBuffer(10, 44100);
    const res = await def.executer(ctx([stereo], { Position: "Droite" }) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    expect(out.getChannelData(0)).toEqual(new Float32Array(10));
    expect(out.getChannelData(1)).toEqual(stereo.getChannelData(1));
  });

  it("centre laisse passer le signal inchangé", async () => {
    const def = registre.trouverDef("hard-panner")!;
    const stereo = makeStereoBuffer(10, 44100);
    const res = await def.executer(ctx([stereo], { Position: "Centre" }) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    expect(out.getChannelData(0)).toEqual(stereo.getChannelData(0));
    expect(out.getChannelData(1)).toEqual(stereo.getChannelData(1));
  });

  it("accepte les labels anglais", async () => {
    const def = registre.trouverDef("hard-panner")!;
    const stereo = makeStereoBuffer(10, 44100);
    const res = await def.executer(ctx([stereo], { Position: "Left" }) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.getChannelData(1)).toEqual(new Float32Array(10));
  });

  it("renvoie null sans entrée audio", async () => {
    const def = registre.trouverDef("hard-panner")!;
    const res = await def.executer(ctx([]) as any);
    expect(res.valeurs[0]).toBeNull();
  });
});
