// audio/cantor.test.ts — La poussière de Cantor, mesurée : combien il reste,
// où, et le fait que chaque étage répète le précédent en réduction.
import { describe, it, expect } from "vitest";
import { segmentsCantor, appliquerCantor, rendreCantorCanaux, planCantor } from "./cantor";

const SR = 44100;

describe("les fragments", () => {
  it.each([1, 2, 3, 5, 7])("à l'étage %i : 2ⁿ fragments de longueur 3⁻ⁿ", (n) => {
    const L = 3 ** 7 * 20; // divisible par 3⁷ : aucune erreur d'arrondi
    const s = segmentsCantor(L, n);
    expect(s.length).toBe(2 ** n);
    for (const { debut, fin } of s) expect(fin - debut).toBe(L / 3 ** n);
    const garde = s.reduce((a, { debut, fin }) => a + fin - debut, 0);
    expect(garde / L).toBeCloseTo((2 / 3) ** n, 10);
  });

  it("est auto-similaire : le premier tiers de l'étage n est l'étage n−1 réduit trois fois", () => {
    const L = 3 ** 7 * 20;
    for (let n = 1; n <= 6; n++) {
      const premierTiers = segmentsCantor(L, n).filter((s) => s.fin <= L / 3);
      const reduit = segmentsCantor(L, n - 1).map((s) => ({ debut: s.debut / 3, fin: s.fin / 3 }));
      expect(premierTiers).toEqual(reduit);
    }
  });

  it("place chaque fragment à un demi-échantillon de sa position exacte, sur une longueur quelconque", () => {
    // Position exacte du fragment i : la somme des 2·3⁻ᵉ·L dont le bit e de i
    // vaut 1. Arrondir à chaque étage, plutôt qu'à la fin, décale les fragments
    // jusqu'à 1,8 échantillon : ce test le verrait (vérifié par mutation). Une
    // première version vérifiait l'égalité des longueurs, que les deux méthodes
    // satisfont — elle ne distinguait rien.
    for (const L of [44_123, 30_001, 57_778]) {
      const n = 7;
      segmentsCantor(L, n).forEach((s, i) => {
        let exact = 0, longueur = L;
        for (let e = 0; e < n; e++) {
          longueur /= 3;
          if ((i >> (n - 1 - e)) & 1) exact += 2 * longueur;
        }
        expect(Math.abs(s.debut - exact)).toBeLessThanOrEqual(0.5);
      });
      const longueurs = segmentsCantor(L, n).map((x) => x.fin - x.debut);
      expect(Math.max(...longueurs) - Math.min(...longueurs)).toBeLessThanOrEqual(1);
    }
  });
});

describe("sur le son", () => {
  const bruit = (n: number) => {
    const a = new Float32Array(n);
    let g = 5;
    for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; a[i] = 0.5 * (g / 0x3fffffff - 1); }
    return a;
  };
  const energie = (a: Float32Array, d = 0, f = a.length) => { let s = 0; for (let i = d; i < f; i++) s += a[i] * a[i]; return s; };

  it("rend les parties retirées exactement silencieuses, même avec un fondu", () => {
    const x = bruit(3 ** 5 * 40);
    const segs = segmentsCantor(x.length, 3);
    const y = appliquerCantor(x, segs, 200);
    const tiersCentral = { d: x.length / 3, f: (2 * x.length) / 3 };
    expect(energie(y, tiersCentral.d, tiersCentral.f)).toBe(0);
  });

  it("garde (2/3)ⁿ de l'énergie d'un bruit stationnaire, sans fondu", () => {
    const x = bruit(SR * 4);
    for (const n of [1, 3, 5]) {
      const y = appliquerCantor(x, segmentsCantor(x.length, n), 0);
      expect(energie(y) / energie(x)).toBeCloseTo((2 / 3) ** n, 1);
    }
  });

  it("joue en mode Construction les étages 0 à n à la suite, chacun plus creusé", () => {
    const x = bruit(SR);
    const r = rendreCantorCanaux([x], SR, { etages: 3, mode: "construction", fonduSec: 0 });
    expect(r.plan.passages).toBe(4);
    expect(r.canaux[0].length).toBe(4 * SR);
    const ex = energie(x);
    for (let k = 0; k <= 3; k++) {
      expect(energie(r.canaux[0], k * SR, (k + 1) * SR) / ex).toBeCloseTo((2 / 3) ** k, 1);
    }
  });

  it("ne joue en mode Dernier étage que l'étage demandé, sur la durée du son", () => {
    const r = rendreCantorCanaux([bruit(SR)], SR, { etages: 4, mode: "dernier", fonduSec: 0.002 });
    expect(r.canaux[0].length).toBe(SR);
    expect(r.fragments).toBe(16);
    expect(r.fragmentMs).toBeCloseTo(1000 / 81, 1);
  });

  it("borne le fondu à la moitié du fragment : un fragment de 2 ms ne devient pas silence", () => {
    const x = new Float32Array(3 ** 6 * 4).fill(1);
    const y = appliquerCantor(x, segmentsCantor(x.length, 6), 10_000);
    // Chaque fragment de 4 échantillons garde un pic non nul.
    for (const { debut, fin } of segmentsCantor(x.length, 6)) {
      expect(Math.max(...y.slice(debut, fin))).toBeGreaterThan(0.4);
    }
  });

  it("limite la profondeur à 7 étages", () => {
    expect(planCantor(1000, SR, { etages: 12, mode: "dernier", fonduSec: 0 }).etages).toBe(7);
  });
});
