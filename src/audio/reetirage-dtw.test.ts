// audio/reetirage-dtw.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { correspondanceIPourJ, reetirerParChemin } from "./reetirage-dtw";
import type { PointAlignement } from "./algebre";

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
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

function bufferDeRampe(n: number, canaux = 1): AudioBuffer {
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: 44100 });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = i + c * 1000; // rampe distincte par canal
  }
  return b;
}

function cheminDiagonal(n: number): PointAlignement[] {
  return Array.from({ length: n }, (_, k) => ({ i: k, j: k }));
}

describe("correspondanceIPourJ", () => {
  it("un chemin diagonal (n=m) donne iPourJ[j] = j exactement", () => {
    const chemin = cheminDiagonal(5);
    const iPourJ = correspondanceIPourJ(chemin, 5);
    expect(Array.from(iPourJ)).toEqual([0, 1, 2, 3, 4]);
  });

  it("moyenne les i quand plusieurs sont associés au même j", () => {
    // j=0 associé à i=0 ET i=1 (B attend un passage rapide de A) : moyenne 0.5.
    const chemin: PointAlignement[] = [{ i: 0, j: 0 }, { i: 1, j: 0 }, { i: 2, j: 1 }];
    const iPourJ = correspondanceIPourJ(chemin, 2);
    expect(iPourJ[0]).toBeCloseTo(0.5, 9);
    expect(iPourJ[1]).toBeCloseTo(2, 9);
  });
});

describe("reetirerParChemin", () => {
  const SAUT = 512;

  it("chemin diagonal (identité) : la sortie reproduit exactement l'entrée", () => {
    const n = 10 * SAUT;
    const audioA = bufferDeRampe(n);
    const chemin = cheminDiagonal(Math.floor(n / SAUT));
    const sortie = reetirerParChemin(audioA, chemin, SAUT);
    const src = audioA.getChannelData(0);
    const dst = sortie.getChannelData(0);
    expect(dst.length).toBe(chemin.length * SAUT);
    // S'arrête avant la toute dernière trame : limite connue et documentée
    // (pas de trame "suivante" pour interpoler tout au bout du signal).
    for (let n2 = 0; n2 < dst.length - SAUT; n2 += 97) {
      expect(dst[n2]).toBeCloseTo(src[n2], 6);
    }
  });

  it("préserve le nombre de canaux et les traite indépendamment", () => {
    const n = 6 * SAUT;
    const audioA = bufferDeRampe(n, 2);
    const chemin = cheminDiagonal(Math.floor(n / SAUT));
    const sortie = reetirerParChemin(audioA, chemin, SAUT);
    expect(sortie.numberOfChannels).toBe(2);
    const d0 = sortie.getChannelData(0);
    const d1 = sortie.getChannelData(1);
    // Canal 1 = canal 0 + 1000 (voir bufferDeRampe) : doit rester vrai après réétirement.
    for (let i = 0; i < d0.length; i += 113) {
      expect(d1[i] - d0[i]).toBeCloseTo(1000, 3);
    }
  });

  it("un run 2x plus lent de A (chaque trame de A dure 2 trames de B) allonge la sortie en conséquence", () => {
    // A a 3 trames, B en a 6 : chaque trame de A couvre 2 trames de B.
    const chemin: PointAlignement[] = [
      { i: 0, j: 0 }, { i: 0, j: 1 },
      { i: 1, j: 2 }, { i: 1, j: 3 },
      { i: 2, j: 4 }, { i: 2, j: 5 },
    ];
    const audioA = bufferDeRampe(3 * SAUT);
    const sortie = reetirerParChemin(audioA, chemin, SAUT);
    expect(sortie.length).toBe(6 * SAUT); // durée de B, pas de A
    const dst = sortie.getChannelData(0);
    for (const v of dst) expect(Number.isFinite(v)).toBe(true);
  });

  it("applique le décalage d'échantillons (piste A recentrée par extraitCentre en amont)", () => {
    const n = 10 * SAUT;
    const audioA = bufferDeRampe(n);
    const decalage = 3 * SAUT;
    const chemin = cheminDiagonal(4); // reste dans les bornes après décalage
    const sortie = reetirerParChemin(audioA, chemin, SAUT, decalage);
    const src = audioA.getChannelData(0);
    const dst = sortie.getChannelData(0);
    // dst[0] doit correspondre à src[decalage] (chemin diagonal ⇒ iInterp=0 à n=0).
    expect(dst[0]).toBeCloseTo(src[decalage], 6);
  });

  it("refuse un chemin vide", () => {
    const audioA = bufferDeRampe(SAUT);
    expect(() => reetirerParChemin(audioA, [], SAUT)).toThrow();
  });

  it("ne plante pas quand le décalage + la position déborde le buffer source (bords cliqués, pas d'exception)", () => {
    const audioA = bufferDeRampe(SAUT);
    const chemin = cheminDiagonal(4); // dépasse largement audioA (1 seule trame de matière)
    const sortie = reetirerParChemin(audioA, chemin, SAUT);
    const dst = sortie.getChannelData(0);
    for (const v of dst) expect(Number.isFinite(v)).toBe(true);
  });
});
