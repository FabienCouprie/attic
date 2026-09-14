// audio/miroir.test.ts — Le miroir de l'inversion, mesuré : où vont les
// fréquences, ce qui reste en place, ce qui se perd, et le retour par un second
// passage.
import { describe, it, expect } from "vitest";
import { miroirFrequence, miroirCanal, miroirCanaux } from "./miroir";

const SR = 44100;
const PIVOT = 632;

const sinus = (fs: number[], n = SR * 2) => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) for (const f of fs) a[i] += (0.3 / fs.length) * Math.sin((2 * Math.PI * f * i) / SR);
  return a;
};
/** Amplitude d'une fréquence, au milieu du signal. */
const amplitude = (a: Float32Array, f: number) => {
  const c = a.length >> 1, d = 8192;
  let s = 0, co = 0, n = 0;
  for (let i = c - d; i < c + d; i++) { const w = (2 * Math.PI * f * i) / SR; s += a[i] * Math.sin(w); co += a[i] * Math.cos(w); n++; }
  return (2 * Math.hypot(s, co)) / n;
};
/** Fréquence de plus forte amplitude dans [bas, haut], au hertz près. */
const pic = (a: Float32Array, bas: number, haut: number) => {
  let meilleure = bas, max = 0;
  for (let f = bas; f <= haut; f += 1) { const v = amplitude(a, f); if (v > max) { max = v; meilleure = f; } }
  return meilleure;
};

describe("la géométrie", () => {
  it("est une involution qui laisse le pivot en place", () => {
    for (const f of [20, 100, 440, 5000, 20000]) expect(miroirFrequence(miroirFrequence(f, PIVOT), PIVOT)).toBeCloseTo(f, 9);
    expect(miroirFrequence(PIVOT, PIVOT)).toBe(PIVOT);
    expect(miroirFrequence(20, PIVOT)).toBeCloseTo(19971, 0); // la bande audible sur elle-même
  });
});

describe("sur le son", () => {
  it("renvoie 440 Hz à 908 Hz", () => {
    const { y } = miroirCanal(sinus([440]), PIVOT, SR);
    expect(Math.abs(pic(y, 850, 960) - 632 ** 2 / 440)).toBeLessThanOrEqual(2);
    expect(amplitude(y, 908)).toBeGreaterThan(20 * amplitude(y, 440));
  });

  it("laisse une fréquence égale au pivot à sa place", () => {
    const { y } = miroirCanal(sinus([PIVOT]), PIVOT, SR);
    expect(Math.abs(pic(y, 590, 680) - PIVOT)).toBeLessThanOrEqual(2);
  });

  it("inverse l'ordre des partiels : le plus grave devient le plus aigu", () => {
    const { y } = miroirCanal(sinus([200, 500, 1000]), PIVOT, SR);
    const attendus = [632 ** 2 / 200, 632 ** 2 / 500, 632 ** 2 / 1000]; // 1997, 799, 399
    for (const f of attendus) expect(Math.abs(pic(y, Math.round(f * 0.95), Math.round(f * 1.05)) - f)).toBeLessThanOrEqual(3);
    // Trois partiels égaux en entrée restent du même ordre de grandeur.
    const niveaux = attendus.map((f) => 20 * Math.log10(amplitude(y, f)));
    expect(Math.max(...niveaux) - Math.min(...niveaux)).toBeLessThan(3);
  });

  it("rend l'original par un second passage : 440 → 908 → 440", () => {
    const { y } = miroirCanal(sinus([440]), PIVOT, SR);
    const { y: z } = miroirCanal(y, PIVOT, SR);
    expect(Math.abs(pic(z, 400, 480) - 440)).toBeLessThanOrEqual(2);
  });

  it("chiffre ce qui sort de la bande : 10 Hz serait renvoyé à 40 kHz", () => {
    expect(miroirCanal(sinus([10]), PIVOT, SR).perdue).toBeGreaterThan(0.95);
    expect(miroirCanal(sinus([440]), PIVOT, SR).perdue).toBeLessThan(0.01);
  });

  it("garde le niveau d'un son dont rien ne se perd", () => {
    const x = sinus([300, 700, 1500]);
    const { y } = miroirCanal(x, PIVOT, SR);
    const r = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    expect(20 * Math.log10(r(y) / r(x))).toBeCloseTo(0, 1);
  });
});

describe("les tours", () => {
  it("alternent miroir et original : le deuxième tour est le son d'origine", () => {
    const x = sinus([440], SR);
    const r = miroirCanaux([x], SR, { pivotHz: PIVOT, tours: 2, fonduSec: 0 });
    const sortie = r.canaux[0];
    expect(sortie.length).toBe(2 * SR);
    const second = sortie.slice(SR);
    let ecart = 0;
    for (let i = 0; i < SR; i++) ecart = Math.max(ecart, Math.abs(second[i] - x[i]));
    expect(ecart).toBe(0);
  });
});
