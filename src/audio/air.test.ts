// audio/air.test.ts — Ce que l'air retire, confronté à la norme.
//
// CE QUI EST TENU :
//   1. LA FORMULE REND LE TABLEAU 2 DE L'ISO 9613-2, six conditions de température et d'humidité,
//      huit bandes d'octave, à la précision où le tableau est imprimé. Les valeurs sont celles du
//      tableau, en décibels par kilomètre, aux fréquences exactes des bandes.
//   2. LE FILTRE RETIRE À UN SINUS CE QUE LA NORME DIT, sur les mètres qu'on lui donne.
//   3. ZÉRO MÈTRE REND LE SIGNAL, à la précision de la reconstruction près.
//   4. LA FRÉQUENCE À −3 dB descend quand les mètres montent, et reste dans la bande audible.
import { describe, expect, it } from "vitest";
import { AIR_STANDARD, absorptionAir, filtrerParLAir, frequenceAMoinsTrois } from "./air";

const BANDES = [-12, -9, -6, -3, 0, 3, 6, 9].map((k) => 1000 * Math.pow(10, k / 10));
const TABLEAU_9613_2: { t: number; hr: number; dbKm: number[] }[] = [
  { t: 10, hr: 70, dbKm: [0.1, 0.4, 1.0, 1.9, 3.7, 9.7, 32.8, 117] },
  { t: 20, hr: 70, dbKm: [0.1, 0.3, 1.1, 2.8, 5.0, 9.0, 22.9, 76.6] },
  { t: 30, hr: 70, dbKm: [0.1, 0.3, 1.0, 3.1, 7.4, 12.7, 23.1, 59.3] },
  { t: 15, hr: 20, dbKm: [0.3, 0.6, 1.2, 2.7, 8.2, 28.2, 88.8, 202] },
  { t: 15, hr: 50, dbKm: [0.1, 0.5, 1.2, 2.2, 4.2, 10.8, 36.2, 129] },
  { t: 15, hr: 80, dbKm: [0.1, 0.3, 1.1, 2.4, 4.1, 8.3, 23.7, 82.8] },
];

describe("l'absorption de l'air", () => {
  it("LA FORMULE REND LE TABLEAU 2 DE L'ISO 9613-2, à l'arrondi du tableau près", () => {
    for (const { t, hr, dbKm } of TABLEAU_9613_2) {
      BANDES.forEach((f, i) => {
        const calcule = absorptionAir(f, { temperature: t, humidite: hr, pression: 101.325 }) * 1000;
        // Le tableau imprime un dixième ou trois chiffres : la demi-unité du dernier chiffre, et un
        // centième de plus pour l'arrondi du tableau, dont le pire écart vaut 0,051 dB/km (4,15
        // calculés, 4,1 imprimés, à 15 °C, 80 % et 1 kHz).
        const tolerance = Math.max(0.06, 0.005 * dbKm[i]);
        expect(Math.abs(calcule - dbKm[i]), `${t} °C, ${hr} %, ${Math.round(f)} Hz : ${calcule.toFixed(2)}`)
          .toBeLessThanOrEqual(tolerance);
      });
    }
  });

  it("elle croît avec la fréquence, sur toute la bande audible", () => {
    let avant = 0;
    for (let f = 20; f <= 24000; f *= 1.05) {
      const a = absorptionAir(f, AIR_STANDARD);
      expect(a).toBeGreaterThan(avant);
      avant = a;
    }
  });
});

describe("le filtre de l'air", () => {
  const SR = 48000;
  const sinus = (f: number, n = SR) => Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * f * i) / SR));
  const rmsDb = (x: Float32Array, debut: number, fin: number) => {
    let s = 0;
    for (let i = debut; i < fin; i++) s += x[i] * x[i];
    return 10 * Math.log10(s / (fin - debut));
  };

  it("LE FILTRE RETIRE À UN SINUS CE QUE LA NORME DIT, à un dixième de décibel", () => {
    for (const metres of [10, 100, 400]) {
      for (const f of [1000, 4000, 8000, 12000]) {
        const x = sinus(f);
        const y = filtrerParLAir(x, SR, () => metres);
        const perte = rmsDb(x, 8000, 40000) - rmsDb(y, 8000, 40000);
        const attendu = absorptionAir(f) * metres;
        if (attendu > 60) continue;
        expect(Math.abs(perte - attendu), `${metres} m, ${f} Hz : ${perte.toFixed(2)} pour ${attendu.toFixed(2)} dB`)
          .toBeLessThan(0.1);
      }
    }
  });

  it("ZÉRO MÈTRE REND LE SIGNAL, à la précision de la reconstruction près", () => {
    const x = sinus(3000, 20000);
    const y = filtrerParLAir(x, SR, () => 0);
    let pire = 0;
    for (let i = 0; i < x.length; i++) pire = Math.max(pire, Math.abs(y[i] - x[i]));
    expect(pire).toBeLessThan(1e-5);
  });

  it("la courbe suit les mètres échantillon par échantillon", () => {
    // Zéro mètre sur la première moitié, trois cents sur la seconde : l'aigu ne tombe qu'à la fin.
    const x = sinus(8000);
    const y = filtrerParLAir(x, SR, (i) => (i < SR / 2 ? 0 : 300));
    expect(rmsDb(x, 2000, 20000) - rmsDb(y, 2000, 20000)).toBeLessThan(0.1);
    expect(rmsDb(x, 28000, 46000) - rmsDb(y, 28000, 46000)).toBeCloseTo(absorptionAir(8000) * 300, 0);
  });
});

describe("la fréquence à moins trois décibels", () => {
  it("elle descend quand les mètres montent, et reste dans la bande audible", () => {
    expect(frequenceAMoinsTrois(0)).toBe(20000);
    expect(frequenceAMoinsTrois(1)).toBe(20000);
    let avant = 20000;
    for (const m of [10, 50, 200, 1000, 5000]) {
      const f = frequenceAMoinsTrois(m);
      expect(f).toBeLessThan(avant);
      // C'est bien là que l'air retire trois décibels.
      expect(absorptionAir(f) * m).toBeCloseTo(3, 3);
      avant = f;
    }
    expect(frequenceAMoinsTrois(1e9)).toBe(20);
  });
});
