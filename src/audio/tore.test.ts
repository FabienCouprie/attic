// audio/tore.test.ts — Le tore, mesuré sur le signal : la position revient à
// chaque tour, le niveau à sa propre période, et les deux ensemble au tour q.
import { describe, it, expect } from "vitest";
import { tordreTore, vitesseEtFermeture, plusProcheRetour, NOMBRE_OR } from "./tore";

const SR = 44100;

const bruit = (n: number, graine = 99) => {
  const a = new Float32Array(n);
  let g = graine;
  for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; a[i] = 0.5 * (g / 0x3fffffff - 1); }
  return a;
};
const energie = (a: Float32Array, c: number, d = 1024) => {
  let s = 0;
  for (let i = Math.max(0, c - d); i < Math.min(a.length, c + d); i++) s += a[i] * a[i];
  return s;
};
const dB = (x: number) => 10 * Math.log10(x);

describe("vitesses et fermeture", () => {
  it.each([
    ["1:1", 1], ["1:2", 2], ["2:3", 3], ["3:5", 5], ["5:8", 8],
  ] as const)("%s se referme au tour %i", (r, q) => {
    const { vitesseBeta, fermeture } = vitesseEtFermeture(r);
    expect(fermeture).toBe(q);
    // Au tour q, β a fait un nombre ENTIER de tours ; avant, jamais.
    expect((q * vitesseBeta) % 1).toBeCloseTo(0, 10);
    for (let u = 1; u < q; u++) expect(Math.abs(((u * vitesseBeta) % 1))).toBeGreaterThan(0.01);
  });

  it("ne se referme jamais pour le nombre d'or, mais frôle son départ aux termes de Fibonacci", () => {
    expect(vitesseEtFermeture("or").fermeture).toBeNull();
    // Sur 13 tours, les meilleurs retours successifs tombent sur 1, 2, 3, 5, 8, 13.
    const records: number[] = [];
    let meilleur = 360;
    for (let u = 1; u <= 13; u++) {
      const e = plusProcheRetour(1 / NOMBRE_OR, u);
      if (e.ecartDeg < meilleur - 1e-9) { meilleur = e.ecartDeg; records.push(e.tour); }
    }
    expect(records).toEqual([1, 2, 3, 5, 8, 13]);
    expect(plusProcheRetour(1 / NOMBRE_OR, 13).ecartDeg).toBeGreaterThan(0);
  });
});

describe("les deux cercles, mesurés", () => {
  // Son mono de 2 s posé sur le bord, rapport 1:2 : la position fait un tour par
  // tour, le niveau un tour tous les deux tours. Aucun fondu.
  const r = tordreTore([bruit(SR * 2)], SR, { rapport: "1:2", tours: 4, fonduSec: 0, profondeur: 1 });
  const [L, R] = r.canaux;
  const pas = r.plan.pas;
  const total = (c: number) => energie(L, c) + energie(R, c);
  const balance = (c: number) => dB(energie(L, c) / energie(R, c));
  const ref = total(Math.round(pas * 0.02));

  it("fait tourner la position d'un tour complet par tour : droite à mi-tour, gauche au tour entier", () => {
    expect(r.poseeSurLeBord).toBe(true);
    expect(balance(Math.round(pas * 0.02))).toBeGreaterThan(20);
    expect(balance(Math.round(pas * 0.5))).toBeLessThan(-20);
    expect(balance(pas * 2)).toBeGreaterThan(20);
  });

  it("éteint le niveau quand β = π, c'est-à-dire au premier tour pour 1:2", () => {
    expect(dB(total(pas) / ref)).toBeLessThan(-25);
  });

  it("rend le niveau entier au deuxième tour, où les deux cercles se referment ensemble", () => {
    expect(Math.abs(dB(total(2 * pas) / ref))).toBeLessThan(0.5);
    expect(r.refermee).toBe(true);
  });

  it("garde l'image en place pendant l'extinction : le mélange n'écrase pas la stéréo", () => {
    // À 0,75 tour pour 1:2, β = 3π/4 : le niveau a baissé, mais la position (α =
    // 3π/2, donc centre) doit être celle prévue et non un effondrement.
    const c = Math.round(pas * 0.75);
    expect(Math.abs(balance(c))).toBeLessThan(1.5);
    // Et à 1,5 tour (α = 3π, droite), l'image est bien à droite malgré β = 3π/2.
    expect(balance(Math.round(pas * 1.5))).toBeLessThan(-20);
  });
});

describe("fermeture annoncée", () => {
  it("dit « non refermé » quand les tours ne sont pas un multiple de q", () => {
    const r = tordreTore([bruit(SR / 2)], SR, { rapport: "2:3", tours: 4, fonduSec: 0, profondeur: 1 });
    expect(r.refermee).toBe(false);
    expect(r.fermeture).toBe(3);
  });

  it("à profondeur nulle, le niveau ne bouge pas : il ne reste que la position", () => {
    const r = tordreTore([bruit(SR * 2)], SR, { rapport: "1:2", tours: 2, fonduSec: 0, profondeur: 0 });
    const [L, R] = r.canaux;
    const t = (c: number) => energie(L, c) + energie(R, c);
    expect(Math.abs(dB(t(r.plan.pas) / t(Math.round(r.plan.pas * 0.02))))).toBeLessThan(0.5);
  });
});
