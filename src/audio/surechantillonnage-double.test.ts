// audio/surechantillonnage-double.test.ts — L'aller et le retour à deux fois la cadence.
//
// Le module du noyau se calcule en clair, sa transformée de Fourier étant une somme finie : c'est ce
// qui permet d'affirmer une bande passante et une réjection en décibels.
import { describe, expect, it } from "vitest";
import { NOYAU, PROLONGEMENT, monter, redescendre } from "./surechantillonnage-double";

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-15));

/** Le gain du noyau à la fréquence f, exprimée en fraction de la cadence d'origine. */
function gain(f: number): number {
  const demi = (NOYAU.length - 1) / 2;
  let re = 0;
  // Le noyau est symétrique : sa transformée est réelle.
  for (let k = -demi; k <= demi; k++) re += NOYAU[k + demi] * Math.cos((2 * Math.PI * f * k) / 2);
  return Math.abs(re);
}

describe("le noyau demi-bande", () => {
  it("somme à un, et est symétrique", () => {
    expect(NOYAU.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
    for (let i = 0; i < NOYAU.length; i++) expect(NOYAU[i]).toBeCloseTo(NOYAU[NOYAU.length - 1 - i], 15);
  });

  it("laisse passer à 0,01 dB près jusqu'à 0,40 fois la cadence d'origine", () => {
    for (let f = 0; f <= 0.4; f += 0.005) expect(Math.abs(db(gain(f)))).toBeLessThan(0.01);
  });

  it("retire au moins 70 dB au-delà de 0,60 fois la cadence d'origine", () => {
    for (let f = 0.6; f <= 1; f += 0.005) expect(db(gain(f))).toBeLessThan(-70);
  });
});

describe("l'aller et le retour", () => {
  it("rendent la longueur reçue, et la voie double a 2n échantillons plus le prolongement", () => {
    const x = new Float32Array(1000).fill(0.25);
    const double = monter(x);
    expect(double.length).toBe(2000 + PROLONGEMENT);
    expect(redescendre(double, x.length).length).toBe(1000);
  });

  it("ne déplacent pas le son : un sinus de 0,1 fois la cadence revient à l'échantillon près", () => {
    const n = 4096, x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 0.1 * i);
    const y = redescendre(monter(x), n);
    // Loin des bords, où le noyau voit des deux côtés.
    let ecart = 0;
    for (let i = 100; i < n - 100; i++) ecart = Math.max(ecart, Math.abs(y[i] - x[i]));
    expect(ecart).toBeLessThan(1e-3);
  });

  it("la voie double interpole : ses échantillons pairs sont ceux de la voie reçue", () => {
    const n = 512, x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin(0.3 * i) * 0.4;
    const double = monter(x);
    let ecart = 0;
    for (let m = 0; m < n; m++) ecart = Math.max(ecart, Math.abs(double[2 * m] - x[m]));
    expect(ecart).toBeLessThan(1e-6);
  });
});
