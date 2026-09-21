// audio/dither.test.ts — La propriété qui définit le dither, éprouvée plutôt que citée.
//
// UN DITHER NE SE JUGE PAS SUR LE SIGNAL QUANTIFIÉ, QUI PARAÎT PLUS BRUYANT — c'est le contraire de
// ce qu'on cherche à première vue. Il se juge sur l'ERREUR : sans lui, elle suit le signal, donc
// c'est de la distorsion ; avec lui, elle en est indépendante, donc c'est du bruit. Les deux tests
// en capitales mesurent exactement cela, et ils échoueraient sur un dither uniforme comme sur une
// absence de dither.
import { describe, expect, it } from "vitest";
import { creerQuantificateur16, erreurQuantification, PLEINE_ECHELLE_16 } from "./dither";
import { fft } from "./fft";

const LSB = 1 / PLEINE_ECHELLE_16;

const moyenne = (x: Float32Array | number[]) => [...x].reduce((a, b) => a + b, 0) / x.length;
const variance = (x: Float32Array | number[]) => {
  const m = moyenne(x);
  return [...x].reduce((a, b) => a + (b - m) ** 2, 0) / x.length;
};
describe("l'arrondi, avant même le dither", () => {
  const sec = creerQuantificateur16({ dither: false });

  it("ARRONDIT AU LIEU DE TRONQUER — c'est la faute que `setInt16` faisait toute seule", () => {
    // setInt16 rendait 0 pour 0,6 LSB et 1 pour 1,9 LSB : l'erreur allait jusqu'à un LSB entier.
    expect(sec(0.6 * LSB)).toBe(1);
    expect(sec(1.9 * LSB)).toBe(2);
    expect(sec(-0.6 * LSB)).toBe(-1);
    expect(sec(-1.9 * LSB)).toBe(-2);
  });

  it("l'erreur d'arrondi ne dépasse jamais un demi-LSB", () => {
    for (let k = 0; k < 500; k++) {
      const x = (k / 500) * 2 - 1;
      expect(Math.abs(sec(x) - x * PLEINE_ECHELLE_16)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it("l'échelle est symétrique : une onde symétrique le reste", () => {
    for (const x of [0.25, 0.5, 0.75, 1]) expect(sec(-x)).toBe(-sec(x));
  });

  it("borne sans jamais reboucler", () => {
    for (const x of [1, 2, 50, -1, -2, -50, Infinity, -Infinity, NaN]) {
      const v = sec(x);
      expect(v).toBeGreaterThanOrEqual(-32768);
      expect(v).toBeLessThanOrEqual(32767);
    }
    expect(sec(NaN)).toBe(0);
  });
});

describe("LE DITHER REND L'ERREUR INDÉPENDANTE DU SIGNAL", () => {
  /** Un niveau continu entre deux codes : le pire cas, puisque l'erreur y est constante. */
  const palier = (niveauLsb: number, n = 4000) => new Float32Array(n).fill(niveauLsb * LSB);

  it("SANS DITHER, l'erreur SUIT le signal : elle change avec lui et ne bouge pas avec le temps", () => {
    const moyennes: number[] = [];
    for (let k = 0; k <= 10; k++) {
      const e = erreurQuantification(palier(100 + k / 10), { dither: false });
      moyennes.push(moyenne(e));
      // Sur un palier, l'erreur est la MÊME à chaque échantillon : une constante, pas un bruit.
      expect(variance(e)).toBeCloseTo(0, 12);
    }
    // Et cette constante parcourt tout l'intervalle [−0,5 ; 0,5] quand le niveau glisse d'un LSB.
    expect(Math.max(...moyennes) - Math.min(...moyennes)).toBeGreaterThan(0.8);
  });

  it("AVEC DITHER, la moyenne de l'erreur reste nulle quel que soit le niveau", () => {
    for (let k = 0; k <= 10; k++) {
      const e = erreurQuantification(palier(100 + k / 10, 20000), { graine: 7 + k });
      expect(Math.abs(moyenne(e))).toBeLessThan(0.02);
    }
  });

  it("AVEC DITHER, la variance de l'erreur ne dépend pas non plus du niveau", () => {
    // C'est ce second point qui exige une densité TRIANGULAIRE : un bruit uniforme laisserait la
    // variance respirer au rythme du signal, ce qui s'entend comme un souffle qui module.
    const variances: number[] = [];
    for (let k = 0; k <= 10; k++) {
      variances.push(variance(erreurQuantification(palier(100 + k / 10, 20000), { graine: 31 + k })));
    }
    const min = Math.min(...variances), max = Math.max(...variances);
    expect(max - min).toBeLessThan(0.05 * max);
  });

  it("SANS DITHER, L'ERREUR EST UNE FONCTION DU SIGNAL — la définition même d'une distorsion", () => {
    // La corrélation linéaire ne dirait rien ici : la dépendance n'est pas linéaire, elle est
    // TOTALE. Mesuré autrement : la même valeur d'entrée rencontrée deux fois donne deux fois la
    // même erreur. Un bruit ne fait jamais cela.
    const n = 6000;
    const signal = Float32Array.from({ length: n }, (_, i) => 2 * LSB * Math.sin((2 * Math.PI * i) / 60));
    const rencontres = (erreurs: Float32Array) => {
      const parValeur = new Map<number, Set<number>>();
      for (let i = 0; i < n; i++) {
        const cle = Math.round(signal[i] * 1e9);
        if (!parValeur.has(cle)) parValeur.set(cle, new Set());
        parValeur.get(cle)!.add(Math.round(erreurs[i] * 1e6));
      }
      // Combien de valeurs d'entrée donnent PLUSIEURS erreurs différentes ?
      return [...parValeur.values()].filter((s) => s.size > 1).length / parValeur.size;
    };
    expect(rencontres(erreurQuantification(signal, { dither: false }))).toBe(0);
    expect(rencontres(erreurQuantification(signal, { graine: 5 }))).toBeGreaterThan(0.9);
  });

  it("SUR UN SINUS TRÈS FAIBLE, LE DITHER SUPPRIME LES HARMONIQUES — c'est ce qui s'entend", () => {
    // Deux LSB d'amplitude : sans dither, la quantification ne rend plus un sinus mais un escalier
    // de quelques marches, dont le spectre est une série d'harmoniques. Mesuré dans le spectre de
    // l'erreur : la part d'énergie qui tombe sur les harmoniques 2 à 12 de la fondamentale.
    const n = 4096, periode = 64;          // 64 échantillons par période : la raie tombe sur une case
    const signal = Float32Array.from({ length: n }, (_, i) => 2 * LSB * Math.sin((2 * Math.PI * i) / periode));
    const partHarmonique = (erreurs: Float32Array) => {
      const re = Float64Array.from(erreurs), im = new Float64Array(n);
      fft(re, im, false);
      const puissance = (k: number) => re[k] * re[k] + im[k] * im[k];
      let totale = 0;
      for (let k = 1; k < n / 2; k++) totale += puissance(k);
      let harmoniques = 0;
      for (let h = 2; h <= 12; h++) harmoniques += puissance((n / periode) * h);
      return harmoniques / Math.max(1e-30, totale);
    };
    const sans = partHarmonique(erreurQuantification(signal, { dither: false }));
    const avec = partHarmonique(erreurQuantification(signal, { graine: 5 }));
    expect(sans).toBeGreaterThan(0.5);     // l'erreur EST la série d'harmoniques
    expect(avec).toBeLessThan(0.05);       // et elle est devenue un bruit plat
  });

  it("le bruit ajouté reste de l'ordre du LSB : le plancher monte de peu", () => {
    const e = erreurQuantification(new Float32Array(20000).fill(0.5), { graine: 3 });
    // Variance d'une erreur dithérée TPDF : un quart de LSB carré, plus le demi-LSB de l'arrondi.
    expect(variance(e)).toBeLessThan(0.5);
    expect(variance(e)).toBeGreaterThan(0.1);
  });
});

describe("la reproductibilité", () => {
  it("deux quantificateurs de même graine rendent les mêmes octets", () => {
    const a = creerQuantificateur16({ graine: 42 }), b = creerQuantificateur16({ graine: 42 });
    for (let k = 0; k < 200; k++) {
      const x = Math.sin(k / 3) * 0.4;
      expect(a(x)).toBe(b(x));
    }
  });

  it("deux graines différentes donnent deux bruits différents", () => {
    const a = creerQuantificateur16({ graine: 1 }), b = creerQuantificateur16({ graine: 2 });
    let differences = 0;
    for (let k = 0; k < 500; k++) {
      const x = 0.25 + (k % 3) * LSB * 0.3;
      if (a(x) !== b(x)) differences++;
    }
    expect(differences).toBeGreaterThan(20);
  });
});
