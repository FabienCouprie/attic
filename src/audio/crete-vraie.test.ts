// audio/crete-vraie.test.ts — Ce qu'une crête vraie doit voir, et que la crête des échantillons ne voit pas.
//
// LE CAS D'ÉCOLE EST LE PREMIER : un sinus à un quart de la cadence, déphasé de 45°, a tous ses
// échantillons à 0,707 de sa crête. Une mesure qui interpole en ligne droite le lit 3 dB trop bas,
// et c'est exactement ce que faisait le VU-mètre jusqu'au 2026-10-28.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { creteVraie, creteVraieDb, enveloppeCreteVraie } from "./crete-vraie";
import { mesurerNiveau } from "./vumetre";

const SR = 48000;
const db = (v: number) => 20 * Math.log10(v);
// LES SINUS ENTRENT ET SORTENT PAR UN FONDU DE 10 MS. Coupé net, un sinus reconstruit avec du silence
// avant et après déborde réellement près de ses bords, et la mesure le voit à juste titre : la
// première version de ce test le lisait 1,09 dB au-dessus de son amplitude pour cette seule raison.
const FONDU = 480;
const sinus = (f: number, phase: number, amplitude = 0.5, n = 4800) =>
  Float32Array.from({ length: n }, (_, i) => {
    const bord = Math.min(1, i / FONDU, (n - 1 - i) / FONDU);
    return amplitude * (0.5 - 0.5 * Math.cos(Math.PI * bord)) * Math.sin(2 * Math.PI * f * i / SR + phase);
  });

describe("la crête vraie", () => {
  it("LIT LE SINUS À FS/4 DÉPHASÉ DE 45° À SA CRÊTE, là où ses échantillons restent 3 dB dessous", () => {
    const x = sinus(SR / 4, Math.PI / 4);
    const echantillons = Math.max(...x.map(Math.abs));
    expect(db(echantillons / 0.5)).toBeCloseTo(-3.01, 1);
    expect(Math.abs(db(creteVraie([x]) / 0.5))).toBeLessThan(0.01);
  });

  it("lit la crête d'un sinus à moins de 0,01 dB, de 50 Hz à 20 kHz et sous cinq phases", () => {
    let pire = 0;
    for (let f = 50; f <= 20000; f *= 1.19) {
      for (const phase of [0, 0.3, Math.PI / 4, 1.1, 2]) pire = Math.max(pire, Math.abs(db(creteVraie([sinus(f, phase)]) / 0.5)));
    }
    expect(pire).toBeLessThan(0.01);
  });

  it("SAUTER LES INTERVALLES BORNÉS NE CHANGE RIEN : même résultat que l'enveloppe interpolée partout", () => {
    let graine = 12345;
    const hasard = () => ((graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    const bruit = Float32Array.from({ length: 9600 }, (_, i) => hasard() * 0.3 * (1 + Math.sin(i / 700)));
    const musique = Float32Array.from({ length: 9600 }, (_, i) => 0.4 * Math.sin(i * 0.31) + 0.2 * Math.sin(i * 1.7) + 0.05 * hasard());
    for (const canaux of [[bruit], [musique], [bruit, musique]]) {
      // L'enveloppe est rangée en flottants de 32 bits : la comparaison se fait à cette précision.
      expect(Math.fround(creteVraie(canaux))).toBe(Math.max(...enveloppeCreteVraie(canaux, 0)));
    }
  });

  it("prend le plus haut des canaux, et rend −120 dB pour un silence", () => {
    const fort = sinus(SR / 4, Math.PI / 4, 0.8), faible = sinus(1000, 0, 0.1);
    expect(creteVraie([faible, fort])).toBeCloseTo(creteVraie([fort]), 6);
    expect(creteVraieDb(new AudioBuffer({ numberOfChannels: 2, length: 480, sampleRate: SR }))).toBe(-120);
  });

  it("tient sur des tampons de un et deux échantillons", () => {
    expect(creteVraie([Float32Array.of(0.5)])).toBeGreaterThanOrEqual(0.5);
    expect(Number.isFinite(creteVraie([Float32Array.of(0.5, -0.5)]))).toBe(true);
  });

  it("L'ENVELOPPE RESTE SOUS LE SEUIL OÙ ELLE N'INTERPOLE PAS, et le dépasse là où le signal le dépasse", () => {
    const x = sinus(SR / 4, Math.PI / 4, 0.5);
    const env = enveloppeCreteVraie([x], 0.45);
    expect(Math.max(...env)).toBeGreaterThan(0.495);
    expect(Math.max(...enveloppeCreteVraie([sinus(1000, 0, 0.1)], 0.45))).toBeLessThanOrEqual(0.45);
  });
});

describe("le VU-mètre, qui la prend désormais", () => {
  it("ANNONCE EN dBTP LA CRÊTE VRAIE, et non plus celle des échantillons", () => {
    const b = new AudioBuffer({ numberOfChannels: 1, length: 4800, sampleRate: SR });
    b.getChannelData(0).set(sinus(SR / 4, Math.PI / 4));
    const m = mesurerNiveau(b);
    expect(m.peakDb).toBeCloseTo(db(0.5) - 3.01, 1);
    expect(Math.abs(m.vraiPicDb - db(0.5))).toBeLessThan(0.01);
  });
});
