// plugins/alignement-dtw.test.ts — Nœud Similarité audio (id alignement-dtw).
import { describe, it, expect, beforeAll } from "vitest";
import { fiches } from "./alignement-dtw";

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

// Suite de notes jouées en séquence, pas une sinusoïde fixe : donne un vrai
// chromagramme qui varie dans le temps, seul cas où DTW a quelque chose à
// aligner (une fréquence constante produit un chromagramme quasi constant).
function melodie(freqs: number[], dureeParNoteS: number): AudioBuffer {
  const nParNote = Math.floor(SR * dureeParNoteS);
  const n = nParNote * freqs.length;
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  freqs.forEach((freq, noteIdx) => {
    for (let i = 0; i < nParNote; i++) {
      d[noteIdx * nParNote + i] = Math.sin((2 * Math.PI * freq * i) / SR);
    }
  });
  return b;
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

const fiche = fiches.find((f) => f.id === "alignement-dtw")!;

describe("fiche similarité audio", () => {
  it("est dans Collections → Analyse", () => {
    expect(fiche.univers).toBe("Collections");
    expect(fiche.famille).toBe("Analyse");
  });
});

function ctxDe(entrees: any[], params: Record<string, number> = {}) {
  return {
    entree: (i: number) => entrees[i] ?? null,
    onProgress: () => {},
    paramNombre: (nom: string, defaut: number) => params[nom] ?? defaut,
  };
}

// A3 B3 C4 D4 E4 — classes de hauteur A,B,C,D,E.
const MELODIE_A = [220, 246.94, 261.63, 293.66, 329.63];
// F#4 G#4 A#4 C#5 D#5 — classes de hauteur disjointes de MELODIE_A.
const MELODIE_SANS_RAPPORT = [369.99, 415.3, 466.16, 554.37, 622.25];

describe("similarité audio (executer)", () => {
  it("similarité proche de 1 pour une piste comparée à elle-même", async () => {
    const piste = melodie(MELODIE_A, 0.3);
    const res = await fiche.executer(ctxDe([piste, piste]) as any);
    expect(res.erreur).toBeUndefined();
    const similarite = parseFloat(res.valeurs[0] as string);
    expect(similarite).toBeGreaterThan(0.95);
  }, 20000);

  it("chemin d'alignement : { chemin, debutEchantillonA } — chemin non vide, débute à (0,0), monotone en i et en j", async () => {
    const piste = melodie(MELODIE_A, 0.3);
    const res = await fiche.executer(ctxDe([piste, piste]) as any);
    const donnees = JSON.parse(res.valeurs[1] as string);
    expect(Array.isArray(donnees.chemin)).toBe(true);
    expect(donnees.chemin.length).toBeGreaterThan(5);
    expect(donnees.chemin[0]).toEqual({ i: 0, j: 0 });
    for (let k = 1; k < donnees.chemin.length; k++) {
      expect(donnees.chemin[k].i).toBeGreaterThanOrEqual(donnees.chemin[k - 1].i);
      expect(donnees.chemin[k].j).toBeGreaterThanOrEqual(donnees.chemin[k - 1].j);
    }
    // Piste plus courte que le plafond « Durée max analysée » (3 min par
    // défaut) : pas de troncature, donc aucun décalage.
    expect(donnees.debutEchantillonA).toBe(0);
  }, 20000);

  it("debutEchantillonA reflète le recentrage quand la piste dépasse le plafond de durée", async () => {
    const piste = melodie(MELODIE_A, 0.3); // 1.5 s
    const res = await fiche.executer(ctxDe([piste, piste], { "Durée max analysée": 1 }) as any);
    const donnees = JSON.parse(res.valeurs[1] as string);
    expect(donnees.debutEchantillonA).toBeGreaterThan(0);
    expect(donnees.debutEchantillonA).toBe(Math.floor((piste.length - Math.floor(1 * SR)) / 2));
  }, 20000);

  it("similarité nettement plus basse pour deux mélodies sans rapport (classes de hauteur disjointes)", async () => {
    const a = melodie(MELODIE_A, 0.3);
    const b = melodie(MELODIE_SANS_RAPPORT, 0.3);
    const res = await fiche.executer(ctxDe([a, b]) as any);
    const similarite = parseFloat(res.valeurs[0] as string);
    expect(similarite).toBeLessThan(0.7);
  }, 20000);

  it("reconnaît un alignement quasi parfait même si une piste est jouée 2x plus lentement", async () => {
    const rapide = melodie(MELODIE_A, 0.25);
    const lente = melodie(MELODIE_A, 0.5);
    const res = await fiche.executer(ctxDe([rapide, lente]) as any);
    const similarite = parseFloat(res.valeurs[0] as string);
    expect(similarite).toBeGreaterThan(0.8);
  }, 20000);

  it("message clair (pas de plantage) si une entrée n'est pas de l'audio", async () => {
    const piste = melodie(MELODIE_A, 0.3);
    const res = await fiche.executer(ctxDe([piste, null]) as any);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toBeTruthy();
  });
});
