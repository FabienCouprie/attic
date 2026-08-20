// plugins/etirement-dtw.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { fiches as fichesEtirement } from "./etirement-dtw";
import { fiches as fichesAlignement } from "./alignement-dtw";

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

function melodie(freqs: number[], dureeParNoteS: number): AudioBuffer {
  const nParNote = Math.floor(SR * dureeParNoteS);
  const n = nParNote * freqs.length;
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  freqs.forEach((freq, noteIdx) => {
    for (let i = 0; i < nParNote; i++) d[noteIdx * nParNote + i] = Math.sin((2 * Math.PI * freq * i) / SR);
  });
  return b;
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

const ficheEtirement = fichesEtirement.find((f) => f.id === "etirement-dtw")!;
const ficheAlignement = fichesAlignement.find((f) => f.id === "alignement-dtw")!;

function ctxAlignement(entrees: any[], params: Record<string, number> = {}) {
  return {
    entree: (i: number) => entrees[i] ?? null,
    onProgress: () => {},
    paramNombre: (nom: string, defaut: number) => params[nom] ?? defaut,
  };
}

function ctxEtirement(entrees: any[]) {
  return { entree: (i: number) => entrees[i] ?? null, onProgress: () => {} };
}

const MELODIE = [220, 246.94, 261.63, 293.66, 329.63];

describe("etirement-dtw (executer)", () => {
  it("bout en bout avec le vrai chemin produit par Similarité audio : sortie audio de durée cohérente", async () => {
    const rapide = melodie(MELODIE, 0.25);
    const lente = melodie(MELODIE, 0.5);
    const resAlignement = await ficheAlignement.executer(ctxAlignement([rapide, lente]) as any);
    expect(resAlignement.erreur).toBeUndefined();
    const cheminJson = resAlignement.valeurs[1] as string;

    const resEtirement = await ficheEtirement.executer(ctxEtirement([rapide, cheminJson]) as any);
    expect(resEtirement.erreur).toBeUndefined();
    const sortie = resEtirement.valeurs[0] as AudioBuffer;
    expect(sortie).toBeInstanceOf(AudioBuffer);
    // La sortie suit le nombre de trames de la piste étalon (plus lente,
    // donc plus longue) — pas la durée de la piste rapide d'origine.
    expect(sortie.duration).toBeGreaterThan(rapide.duration);
    expect(sortie.numberOfChannels).toBe(rapide.numberOfChannels);
    expect(sortie.sampleRate).toBe(rapide.sampleRate);
    const d = sortie.getChannelData(0);
    expect(d.some((v) => v !== 0)).toBe(true); // pas juste du silence
    for (const v of d) expect(Number.isFinite(v)).toBe(true);
  }, 20000);

  it("comparée à elle-même (chemin quasi diagonal), la sortie garde une durée proche de l'entrée", async () => {
    const piste = melodie(MELODIE, 0.3);
    const resAlignement = await ficheAlignement.executer(ctxAlignement([piste, piste]) as any);
    const cheminJson = resAlignement.valeurs[1] as string;
    const resEtirement = await ficheEtirement.executer(ctxEtirement([piste, cheminJson]) as any);
    const sortie = resEtirement.valeurs[0] as AudioBuffer;
    expect(sortie.duration).toBeCloseTo(piste.duration, 1);
  }, 20000);

  it("message clair si l'entrée audio manque", async () => {
    const res = await ficheEtirement.executer(ctxEtirement([null, JSON.stringify({ chemin: [{ i: 0, j: 0 }], debutEchantillonA: 0 })]) as any);
    expect(res.valeurs).toEqual([null]);
    expect(res.message).toBeTruthy();
  });

  it("message clair si le chemin d'alignement manque", async () => {
    const piste = melodie(MELODIE, 0.1);
    const res = await ficheEtirement.executer(ctxEtirement([piste, null]) as any);
    expect(res.valeurs).toEqual([null]);
    expect(res.message).toBeTruthy();
  });

  it("erreur claire si le chemin d'alignement est un JSON invalide", async () => {
    const piste = melodie(MELODIE, 0.1);
    const res = await ficheEtirement.executer(ctxEtirement([piste, "pas du json"]) as any);
    expect(res.erreur).toBe(true);
  });

  it("erreur claire si le JSON est valide mais n'a pas la forme attendue", async () => {
    const piste = melodie(MELODIE, 0.1);
    const res = await ficheEtirement.executer(ctxEtirement([piste, JSON.stringify({ pasLeBonChamp: true })]) as any);
    expect(res.erreur).toBe(true);
  });
});
