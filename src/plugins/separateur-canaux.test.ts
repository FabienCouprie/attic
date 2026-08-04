// plugins/separateur-canaux.test.ts
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

function ctx(entrees: unknown[]) {
  return {
    entree: (idx: number) => entrees[idx],
    entrees: () => entrees,
    paramTexte: (_nom: string, def: string) => def,
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

describe("separateur-canaux", () => {
  it("sépare un stéréo en deux mono", async () => {
    const def = registre.trouverDef("separateur-canaux")!;
    const stereo = makeStereoBuffer(10, 44100);
    const res = await def.executer(ctx([stereo]) as any);
    expect(res.valeurs.length).toBe(2);
    const gauche = res.valeurs[0] as AudioBuffer;
    const droite = res.valeurs[1] as AudioBuffer;
    expect(gauche.numberOfChannels).toBe(1);
    expect(droite.numberOfChannels).toBe(1);
    expect(gauche.length).toBe(stereo.length);
    expect(droite.length).toBe(stereo.length);
    expect(gauche.getChannelData(0)).toEqual(stereo.getChannelData(0));
    expect(droite.getChannelData(0)).toEqual(stereo.getChannelData(1));
  });

  it("duplique un signal mono sur les deux sorties", async () => {
    const def = registre.trouverDef("separateur-canaux")!;
    const mono = new AudioBuffer({ numberOfChannels: 1, length: 8, sampleRate: 48000 });
    const data = mono.getChannelData(0);
    for (let i = 0; i < 8; i++) data[i] = i * 0.5;
    const res = await def.executer(ctx([mono]) as any);
    const gauche = res.valeurs[0] as AudioBuffer;
    const droite = res.valeurs[1] as AudioBuffer;
    expect(gauche.numberOfChannels).toBe(1);
    expect(droite.numberOfChannels).toBe(1);
    expect(gauche.getChannelData(0)).toEqual(data);
    expect(droite.getChannelData(0)).toEqual(data);
  });

  it("renvoie null sans entrée audio", async () => {
    const def = registre.trouverDef("separateur-canaux")!;
    const res = await def.executer(ctx([]) as any);
    expect(res.valeurs[0]).toBeNull();
    expect(res.valeurs[1]).toBeNull();
  });
});
