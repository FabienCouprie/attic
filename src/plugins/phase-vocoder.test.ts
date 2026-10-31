// plugins/phase-vocoder.test.ts — Vérification des nœuds de phase vocoder.
import { describe, it, expect } from "vitest";
import { fiches } from "./phase-vocoder";
import { ctxDEssai } from "../core/contexte-essai";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

const SR = 44100;

function sinus(freq: number, dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new AudioBuffer({ numberOfChannels: channels, length: n, sampleRate: SR });
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return b;
}

function ctxAudio(buffer: any, params: Record<string, number>) {
  return ctxDEssai([buffer], params);
}

describe("nœuds Phase Vocoder", () => {
  it("les 2 fiches sont enregistrées", () => {
    expect(trouver("phase-vocoder-tempo")).toBeDefined();
    expect(trouver("phase-vocoder-tonalite")).toBeDefined();
  });

  it("phase-vocoder-tempo ralentit le signal à tempo 0.5", async () => {
    const f = trouver("phase-vocoder-tempo")!;
    const buffer = sinus(440, 1);
    const ctx = ctxAudio(buffer, { "Tempo": 0.5 });
    const res = await f.executer(ctx as any);
    expect(res.erreur).toBeFalsy();
    const out = res.valeurs[0] as AudioBuffer;
    expect(out).toBeDefined();
    expect(out.duration).toBeGreaterThan(1.8);
    expect(out.duration).toBeLessThan(2.2);
    expect(out.numberOfChannels).toBe(1);
  });

  it("phase-vocoder-tempo accélère le signal à tempo 2.0", async () => {
    const f = trouver("phase-vocoder-tempo")!;
    const buffer = sinus(440, 1);
    const ctx = ctxAudio(buffer, { "Tempo": 2.0 });
    const res = await f.executer(ctx as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.duration).toBeGreaterThan(0.4);
    expect(out.duration).toBeLessThan(0.6);
  });

  it("phase-vocoder-tonalite préserve la durée", async () => {
    const f = trouver("phase-vocoder-tonalite")!;
    const buffer = sinus(440, 1);
    const ctx = ctxAudio(buffer, { "Tonalité": 7 });
    const res = await f.executer(ctx as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.duration).toBeGreaterThan(0.9);
    expect(out.duration).toBeLessThan(1.1);
  });

  it("gère le stéréo", async () => {
    const f = trouver("phase-vocoder-tempo")!;
    const buffer = sinus(440, 0.5, 2);
    const ctx = ctxAudio(buffer, { "Tempo": 1.0 });
    const res = await f.executer(ctx as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    expect(out.duration).toBeGreaterThan(0.4);
    expect(out.duration).toBeLessThan(0.6);
  });

  it("retourne une erreur si aucun audio n'est connecté", async () => {
    const f = trouver("phase-vocoder-tempo")!;
    const ctx = ctxAudio(null, { "Tempo": 1.0 });
    const res = await f.executer(ctx as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
  });

  it("retourne une erreur si le tempo n'est pas positif", async () => {
    const f = trouver("phase-vocoder-tempo")!;
    const buffer = sinus(440, 0.5);
    const ctx = ctxAudio(buffer, { "Tempo": 0 });
    const res = await f.executer(ctx as any);
    expect(res.erreur).toBe(true);
  });
});
