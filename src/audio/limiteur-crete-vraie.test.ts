// audio/limiteur-crete-vraie.test.ts — Le plafond tient entre les échantillons, et le grave n'est pas abîmé.
//
// LA PROMESSE SE MESURE PAR LA MÊME CRÊTE VRAIE QUE LE VU-MÈTRE, `crete-vraie.ts`, que ses propres
// cas ont calibrée sur des sinus de crête connue. Et la comparaison avec le limiteur existant porte
// sur ce qui les sépare : un sinus à fs/4 qui passe au-dessus de son plafond, et une basse à 50 Hz
// dont il module le gain à chaque période.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { creteVraie } from "./crete-vraie";
import { limiter } from "./effets-mastering";
import { limiterCreteVraie, type ReglagesLimiteur } from "./limiteur-crete-vraie";

const SR = 48000;
const db = (v: number) => 20 * Math.log10(v);
const REGLAGES: ReglagesLimiteur = { gainDb: 0, plafondDbtp: -1, anticipationMs: 2, maintienMs: 20, relachementMs: 100 };

const signal = (n: number, f: (i: number) => number) => Float32Array.from({ length: n }, (_, i) => f(i));
const sinus = (freq: number, amplitude: number, n = SR, phase = 0) =>
  signal(n, (i) => amplitude * Math.sin(2 * Math.PI * freq * i / SR + phase));

let graine = 7;
const hasard = () => ((graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;

/** Le taux de distorsion harmonique, harmoniques 2 à 10, sur une seconde de régime établi. */
function thd(x: Float32Array, f0: number, debut: number): number {
  const amplitude = (h: number) => {
    let re = 0, im = 0;
    for (let i = debut; i < debut + SR; i++) { const w = 2 * Math.PI * f0 * h * i / SR; re += x[i] * Math.cos(w); im += x[i] * Math.sin(w); }
    return Math.hypot(re, im);
  };
  let harmoniques = 0;
  for (let h = 2; h <= 10; h++) harmoniques += amplitude(h) ** 2;
  return Math.sqrt(harmoniques) / amplitude(1);
}

describe("le limiteur à crête vraie", () => {
  it("TIENT LE PLAFOND EN CRÊTE VRAIE sur le sinus à fs/4 déphasé de 45°, que le limiteur existant laisse passer", () => {
    const x = sinus(SR / 4, 1, SR / 2, Math.PI / 4);
    const r = limiterCreteVraie([x], SR, REGLAGES);
    expect(db(creteVraie(r.canaux))).toBeLessThanOrEqual(-1 + 1e-4);
    // LA VÉRIFICATION FINALE N'A PAS À FAIRE LE TRAVAIL : une détection qui ne verrait que les
    // échantillons serait rattrapée par elle, au prix d'un décibel sur tout le son, sans rien dire.
    expect(r.correctionDb).toBeGreaterThan(-0.05);
    const ancien = new AudioBuffer({ numberOfChannels: 1, length: x.length, sampleRate: SR });
    ancien.getChannelData(0).set(x);
    // L'ancien ne voit que des échantillons à −3 dB, sous son seuil : il ne fait rien, et la crête
    // vraie passe un décibel au-dessus de son plafond.
    const sortieAncien = limiter(ancien, -1, 100, -1).getChannelData(0);
    expect(db(creteVraie([sortieAncien]))).toBeGreaterThan(-0.2);
  });

  it("tient le plafond sur un bruit poussé de 12 dB, et sur des clics isolés", () => {
    const bruit = signal(SR, (i) => 0.5 * hasard() * (1 + Math.sin(i / 3000)));
    const clics = signal(SR, (i) => (i % 4800 === 100 ? 1 : i % 4800 === 101 ? -1 : 0));
    for (const x of [bruit, clics]) {
      const r = limiterCreteVraie([x], SR, { ...REGLAGES, gainDb: 12 });
      expect(r.creteVraieDb).toBeLessThanOrEqual(-1 + 1e-4);
      expect(db(creteVraie(r.canaux))).toBeLessThanOrEqual(-1 + 1e-4);
      expect(r.correctionDb).toBeGreaterThan(-0.05);
    }
  });

  it("SOUS LE PLAFOND, IL NE TOUCHE À RIEN, à l'échantillon près", () => {
    const x = sinus(440, 0.5);
    const r = limiterCreteVraie([x], SR, REGLAGES);
    expect(Array.from(r.canaux[0])).toEqual(Array.from(x));
    expect(r.reductionMaxDb).toBe(0);
    expect(r.correctionDb).toBe(0);
  });

  it("« GAIN » POUSSE LE SON : +6 dB sur un son qui reste sous le plafond", () => {
    const x = sinus(440, 0.2);
    const r = limiterCreteVraie([x], SR, { ...REGLAGES, gainDb: 6 });
    expect(db(Math.max(...r.canaux[0].map(Math.abs)) / 0.2)).toBeCloseTo(6, 1);
  });

  it("L'ANTICIPATION ABAISSE LE GAIN AVANT LA CRÊTE, sur la longueur réglée", () => {
    const x = signal(SR / 4, (i) => (i === 6000 ? 1 : 0.1 * Math.sin(i * 0.05)));
    const gainA = (ms: number, i: number) => {
      const r = limiterCreteVraie([x], SR, { ...REGLAGES, anticipationMs: ms });
      return r.canaux[0][i] / x[i];
    };
    // 2 ms font 96 échantillons : à 150 avant la crête rien n'a bougé, à 50 la rampe est engagée.
    expect(gainA(2, 6000 - 150)).toBeCloseTo(1, 6);
    expect(gainA(2, 6000 - 50)).toBeLessThan(0.99);
    expect(gainA(5, 6000 - 150)).toBeLessThan(0.99);
  });

  it("LE RELÂCHEMENT DÉCIDE DE LA REMONTÉE après une crête", () => {
    const x = signal(SR / 2, (i) => (i === 4800 ? 1 : 0.3 * Math.sin(i * 0.05)));
    const apres = (ms: number) => {
      const r = limiterCreteVraie([x], SR, { ...REGLAGES, relachementMs: ms });
      const i = 4800 + 2400;
      return r.canaux[0][i] / x[i];
    };
    expect(apres(10)).toBeGreaterThan(0.99);
    expect(apres(500)).toBeLessThan(0.97);
  });

  it("UN SEUL GAIN POUR TOUS LES CANAUX : une crête à gauche réduit la droite d'autant", () => {
    const gauche = signal(SR / 4, (i) => (i === 6000 ? 1 : 0.2 * Math.sin(i * 0.03)));
    const droite = signal(SR / 4, (i) => 0.2 * Math.sin(i * 0.03 + 1));
    const r = limiterCreteVraie([gauche, droite], SR, REGLAGES);
    for (const i of [5990, 6000, 6100]) expect(r.canaux[1][i] / droite[i]).toBeCloseTo(r.canaux[0][i] / gauche[i], 5);
  });

  it("UNE BASSE À 50 HZ SORT DIX FOIS MOINS DISTORDUE que par le limiteur existant, au même plafond", () => {
    const x = sinus(50, 1, 3 * SR);
    const nouveau = limiterCreteVraie([x], SR, { ...REGLAGES, plafondDbtp: -6 }).canaux[0];
    const ancien = new AudioBuffer({ numberOfChannels: 1, length: x.length, sampleRate: SR });
    ancien.getChannelData(0).set(x);
    const sortieAncien = limiter(ancien, -6, 100, -6).getChannelData(0);
    const tNouveau = thd(nouveau, 50, SR), tAncien = thd(sortieAncien, 50, SR);
    expect(tNouveau * 10).toBeLessThan(tAncien);
  });

  it("C'EST LE MAINTIEN QUI TIENT LE GRAVE : sans lui, le gain ondule entre deux alternances", () => {
    const x = sinus(50, 1, 3 * SR);
    const sans = limiterCreteVraie([x], SR, { ...REGLAGES, plafondDbtp: -6, maintienMs: 0 }).canaux[0];
    const avec = limiterCreteVraie([x], SR, { ...REGLAGES, plafondDbtp: -6 }).canaux[0];
    expect(thd(sans, 50, SR)).toBeGreaterThan(0.005);
    expect(thd(avec, 50, SR)).toBeLessThan(0.0001);
  });

  it("UNE CRÊTE ARRIVÉE AVANT LA FIN DE LA PREMIÈRE ANTICIPATION est vue, sans rabattre tout le son", () => {
    // Première crête à 5 ms, anticipation de 10 ms : la moyenne d'avant le début doit l'avoir vue.
    const r = limiterCreteVraie([sinus(50, 1, SR)], SR, { ...REGLAGES, plafondDbtp: -6, anticipationMs: 10 });
    expect(r.correctionDb).toBe(0);
    expect(r.reductionMaxDb).toBeCloseTo(-6, 1);
  });
});
