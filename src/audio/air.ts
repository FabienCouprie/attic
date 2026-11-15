// audio/air.ts — Ce que l'air retire d'un son, mètre par mètre.
//
// LA NORME. L'ISO 9613-1 (1993) donne l'absorption atmosphérique en décibels par mètre, pour une
// fréquence, une température, une humidité relative et une pression. Elle a trois parts : la
// viscosité de l'air, et la relaxation de ses deux molécules, l'oxygène et l'azote, dont les
// fréquences propres dépendent de l'humidité. La formule est celle de la norme, sans approximation ;
// elle rend le tableau 2 de l'ISO 9613-2 à son arrondi : 0,051 dB/km au pire là où il imprime un
// dixième, 0,33 % là où il imprime trois chiffres.
//
// CE QUE CELA FAIT À UN SON. Sous 2 kHz l'air ne retire trois décibels qu'au-delà de trois cents
// mètres ; à 8 kHz il retire
// environ un décibel par dix mètres, à 16 kHz près de quatre. Une source à quelques mètres n'en est
// donc presque pas changée, une source à quelques dizaines de mètres perd son aigu. La perte croît
// à peu près comme le carré de la fréquence : aucun filtre du premier ordre ne la suit, et le filtre
// d'ici applique la courbe de la norme fréquence par fréquence.

import { analyseSynthese, frequenceBin } from "./stft";

export interface ConditionsAir {
  /** En degrés Celsius. */
  temperature: number;
  /** L'humidité relative, en pour cent. */
  humidite: number;
  /** La pression atmosphérique, en kilopascals. */
  pression: number;
}

/** Les conditions de référence : 20 °C, 50 % d'humidité, la pression au niveau de la mer. */
export const AIR_STANDARD: ConditionsAir = { temperature: 20, humidite: 50, pression: 101.325 };

/** L'absorption de l'air à la fréquence `f`, en décibels par mètre (ISO 9613-1, équations 3 à 5). */
export function absorptionAir(f: number, c: ConditionsAir = AIR_STANDARD): number {
  const pr = 101.325;
  const pa = c.pression / pr;
  const t = c.temperature + 273.15;
  const t0 = 293.15;
  const t01 = 273.16;
  // La concentration molaire de vapeur d'eau, en pour cent, depuis l'humidité relative ; la pression
  // de vapeur saturante est rapportée à la pression de référence.
  const psat = Math.pow(10, -6.8346 * Math.pow(t01 / t, 1.261) + 4.6151);
  const h = (c.humidite * psat) / pa;
  // Les fréquences de relaxation de l'oxygène et de l'azote.
  const frO = pa * (24 + (4.04e4 * h * (0.02 + h)) / (0.391 + h));
  const frN = pa * Math.pow(t / t0, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(t / t0, -1 / 3) - 1)));
  const f2 = f * f;
  return 8.686 * f2 * (
    1.84e-11 * (1 / pa) * Math.sqrt(t / t0)
    + Math.pow(t / t0, -2.5) * (
      (0.01275 * Math.exp(-2239.1 / t)) / (frO + f2 / frO)
      + (0.1068 * Math.exp(-3352 / t)) / (frN + f2 / frN)
    )
  );
}

/**
 * La fréquence où `metres` d'air retirent trois décibels : au-dessus, l'aigu est fermé.
 *
 * L'absorption croît avec la fréquence, d'où une recherche par dichotomie, en échelle logarithmique.
 * Elle est bornée à la bande audible : vingt kilohertz quand l'air n'y retire pas encore trois
 * décibels, vingt hertz quand il les retire déjà là.
 */
export function frequenceAMoinsTrois(metres: number, c: ConditionsAir = AIR_STANDARD): number {
  const perte = (f: number) => absorptionAir(f, c) * metres;
  if (!(metres > 0) || perte(20000) <= 3) return 20000;
  if (perte(20) >= 3) return 20;
  let bas = Math.log(20), haut = Math.log(20000);
  for (let i = 0; i < 50; i++) {
    const milieu = (bas + haut) / 2;
    if (perte(Math.exp(milieu)) < 3) bas = milieu;
    else haut = milieu;
  }
  return Math.exp((bas + haut) / 2);
}

/** La taille des trames du filtre : 43 ms à 48 kHz, et un pas de 512 échantillons, 11 ms. */
const TAILLE = 2048;

/**
 * Fait traverser au signal `x` les mètres d'air que `metres` rend à chaque échantillon.
 *
 * Par trames de Fourier recouvrantes : chaque fréquence est atténuée de ce que la norme lui retire
 * sur les mètres du centre de la trame. La courbe change donc d'une trame à l'autre, toutes les
 * 11 ms, et suit un son qui s'éloigne. La phase n'est pas touchée. Zéro mètre rend le signal à la
 * précision de la reconstruction près ; qui veut le signal exact ne l'appelle pas.
 */
export function filtrerParLAir(
  x: Float32Array, sampleRate: number, metres: (indice: number) => number, c: ConditionsAir = AIR_STANDARD,
): Float32Array {
  const demi = TAILLE / 2;
  const pas = TAILLE / 4;
  const alpha = new Float64Array(demi + 1);
  for (let k = 0; k <= demi; k++) alpha[k] = absorptionAir(frequenceBin(k, TAILLE, sampleRate), c);
  const gains = new Float64Array(demi + 1);
  const [y] = analyseSynthese(x, TAILLE, 1, (re, im, sRe, sIm, t) => {
    // La trame t couvre x de t·pas − TAILLE à t·pas : `analyseSynthese` borde d'une trame entière.
    const centre = Math.min(x.length - 1, Math.max(0, t * pas - demi));
    const m = Math.max(0, metres(centre));
    for (let k = 0; k <= demi; k++) gains[k] = Math.pow(10, (-alpha[k] * m) / 20);
    for (let k = 0; k < TAILLE; k++) {
      const g = gains[k <= demi ? k : TAILLE - k];
      sRe[0][k] = re[k] * g;
      sIm[0][k] = im[k] * g;
    }
  });
  return y;
}
