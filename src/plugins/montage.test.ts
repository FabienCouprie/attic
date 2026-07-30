// plugins/montage.test.ts — Tests rapides des nœuds de montage.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

function ctx(audio: AudioBuffer, zones: any[], action: string) {
  return {
    entree: (idx: number) => idx === 0 ? audio : zones,
    entrees: () => [audio, zones],
    paramTexte: (nom: string, def: string) => {
      const params: Record<string, string> = { Action: action };
      return params[nom] ?? def;
    },
    paramNombre: (nom: string, def: number) => {
      const params: Record<string, number> = { Fondu: 0 };
      return params[nom] ?? def;
    },
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

const SR = 3000;

function makeBuffer(len: number, sampleRate = SR) {
  const b = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate });
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = 1;
  return b;
}

function ctxExtraire(audio: AudioBuffer, zones: any[], mode: string, fondu = 0) {
  return {
    entree: (idx: number) => idx === 0 ? audio : zones,
    entrees: () => [audio, zones],
    paramTexte: (nom: string, def: string) => ({ Mode: mode }[nom] ?? def),
    paramNombre: (nom: string, def: number) => ({ Fondu: fondu }[nom] ?? def),
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

describe("montage plugin", () => {
  it("Masque de zones : Supprimer les zones coupe l'intérieur des zones", async () => {
    const f = registre.trouverDef("masque-zones")!;
    const audio = makeBuffer(SR);
    const zones = [{ debut: 0.2, duree: 0.1 }]; // samples 600..899
    const res = await f.executer(ctx(audio, zones, "mute") as any);
    expect(res.valeurs.length).toBe(1);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    const out = res.valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    for (let i = 0; i < SR; i++) {
      if (i >= 600 && i < 900) expect(d[i]).toBe(0);
      else expect(d[i]).toBe(1);
    }
  });

  it("Masque de zones : Conserver les zones coupe l'extérieur des zones", async () => {
    const f = registre.trouverDef("masque-zones")!;
    const audio = makeBuffer(SR);
    const zones = [{ debut: 0.2, duree: 0.1 }];
    const res = await f.executer(ctx(audio, zones, "keep") as any);
    expect(res.valeurs.length).toBe(1);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    const out = res.valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    for (let i = 0; i < SR; i++) {
      if (i >= 600 && i < 900) expect(d[i]).toBe(1);
      else expect(d[i]).toBe(0);
    }
  });

  it("Masque de zones : le fondu reste à l'extérieur des zones courtes", async () => {
    const f = registre.trouverDef("masque-zones")!;
    const SR_FADE = 10000;
    const audio = makeBuffer(SR_FADE, SR_FADE);
    const zones = [{ debut: 3000 / SR_FADE, duree: 15 / SR_FADE }];
    const ctxFade = (action: string) => ({
      entree: (idx: number) => idx === 0 ? audio : zones,
      entrees: () => [audio, zones],
      paramTexte: (nom: string, def: string) => ({ Action: action }[nom] ?? def),
      paramNombre: (nom: string, def: number) => ({ Fondu: 20 }[nom] ?? def),
      onProgress: () => {},
      noeud: { data: {} },
      runtime: null,
    });

    const resSupprimer = await f.executer(ctxFade("mute") as any);
    const outSupprimer = resSupprimer.valeurs[0] as AudioBuffer;
    const dSupprimer = outSupprimer.getChannelData(0);
    for (let i = 3000; i < 3015; i++) expect(dSupprimer[i]).toBe(0);
    for (let i = 0; i < 2900; i++) expect(dSupprimer[i]).toBe(1);
    for (let i = 3115; i < SR_FADE; i++) expect(dSupprimer[i]).toBe(1);

    const resConserver = await f.executer(ctxFade("keep") as any);
    const outConserver = resConserver.valeurs[0] as AudioBuffer;
    const dConserver = outConserver.getChannelData(0);
    for (let i = 3000; i < 3015; i++) expect(dConserver[i]).toBe(1);
    for (let i = 0; i < 2900; i++) expect(dConserver[i]).toBe(0);
    for (let i = 3115; i < SR_FADE; i++) expect(dConserver[i]).toBe(0);
  });

  it("Extraire zones : concatène les zones sélectionnées", async () => {
    const f = registre.trouverDef("extraire-zones-selecteur")!;
    const audio = makeBuffer(SR);
    const zones = [{ debut: 0.1, duree: 0.1 }, { debut: 0.5, duree: 0.1 }]; // 300..599, 1500..1799
    const res = await f.executer(ctxExtraire(audio, zones, "selected") as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(res.valeurs[1]).toHaveLength(2);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.duration).toBeCloseTo(0.2, 2);
    const d = out.getChannelData(0);
    for (let i = 0; i < d.length; i++) expect(d[i]).toBe(1);
  });

  it("Extraire zones : mode inverse ne conserve que les zones non sélectionnées", async () => {
    const f = registre.trouverDef("extraire-zones-selecteur")!;
    const audio = makeBuffer(SR);
    const zones = [{ debut: 0.2, duree: 0.1 }]; // 600..899
    const res = await f.executer(ctxExtraire(audio, zones, "unselected") as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.duration).toBeCloseTo(1 - 0.1, 2); // 0.9s
    const d = out.getChannelData(0);
    expect(d.length).toBe(2700);
    expect(d[0]).toBe(1);
    expect(d[599]).toBe(1);
    expect(d[600]).toBe(1);
    expect(d[d.length - 1]).toBe(1);
  });

  it("Extraire zones : retourne une erreur si aucune zone n'est connectée", async () => {
    const f = registre.trouverDef("extraire-zones-selecteur")!;
    const audio = makeBuffer(SR);
    const res = await f.executer(ctxExtraire(audio, [], "selected") as any);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("Aucune zone");
  });
});
