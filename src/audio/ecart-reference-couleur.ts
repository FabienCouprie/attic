// audio/ecart-reference-couleur.ts — La couleur d'un son : son spectre moyen de puissance rangé en tiers
// d'octave et en registres, chaque bande rapportée à l'énergie totale.
//
// ═══ LE SPECTRE SE PREND À 32 768 POINTS, ET LES CASES DU BORD COMPTENT AU PRORATA ═══
//
// C'est la taille que l'instrument d'origine a payée. À 8 192 points, le tiers d'octave de 31,5 Hz,
// large de 7,3 Hz, ne tenait qu'une ou deux cases de 5,4 ou 5,9 Hz selon la fréquence
// d'échantillonnage, et le même son pris à 44,1 puis à 48 kHz s'y écartait de 4 dB. À 32 768 points
// une case fait 1,35 ou 1,46 Hz, et une case qui chevauche le bord d'une bande y verse la part de sa
// largeur qui tombe dedans, au lieu de tout ou rien. Sur le même morceau aux deux fréquences, l'écart
// à 31,5 Hz est tombé de 4 à 0,6 dB, et l'écart efficace des bandes à 0,13 dB.
//
// ═══ LA MOYENNE EST CELLE DES PUISSANCES ═══
//
// Pas celle des amplitudes : sur un grave tenu et des médiums transitoires, les deux ne coïncident pas,
// et seule la première dit où est l'énergie. Le pas est d'une demi-trame.

import { db, spectresDePuissance } from "./ecart-reference-signal";

/** La taille de la transformée de la couleur. */
export const TAILLE_COULEUR = 32768;

/** Les centres normalisés des tiers d'octave, de 25 Hz à 20 kHz. */
export const TIERS = [25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250,
  1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000] as const;

/** Les bandes comparées : de 31,5 Hz à 16 kHz, que tient toute fréquence d'échantillonnage usuelle. */
export const TIERS_COMPARES = TIERS.filter((f) => f >= 31.5 && f <= 16000);

/** Les registres, de bord à bord, en hertz. */
export const REGISTRES = [
  { id: "grave-profond", fr: "Grave profond", en: "Sub-bass", bas: 20, haut: 60 },
  { id: "grave", fr: "Grave", en: "Bass", bas: 60, haut: 250 },
  { id: "bas-medium", fr: "Bas médium", en: "Low midrange", bas: 250, haut: 500 },
  { id: "medium", fr: "Médium", en: "Midrange", bas: 500, haut: 2000 },
  { id: "haut-medium", fr: "Haut médium", en: "Upper midrange", bas: 2000, haut: 4000 },
  { id: "presence", fr: "Présence", en: "Presence", bas: 4000, haut: 6000 },
  { id: "brillance", fr: "Brillance", en: "Brilliance", bas: 6000, haut: 12000 },
  { id: "air", fr: "Air", en: "Air", bas: 12000, haut: 16000 },
  { id: "extreme-aigu", fr: "Au-delà de 16 kHz", en: "Above 16 kHz", bas: 16000, haut: 24000 },
] as const;

export interface Couleur {
  /** Le niveau de chaque tiers d'octave sous la demi-fréquence d'échantillonnage, en dB de l'énergie totale. */
  tiers: Map<number, number>;
  /** La part de l'énergie de chaque registre, en pour cent, dans l'ordre de `REGISTRES`. */
  registres: number[];
}

/** La couleur du signal `x`, pris à `fe`. */
export function couleurDe(x: ArrayLike<number>, fe: number): Couleur {
  const n = TAILLE_COULEUR, df = fe / n, cases = n / 2 + 1;
  const moyen = new Float64Array(cases);
  const nTrames = spectresDePuissance(x, n, n / 2, (p) => {
    for (let k = 0; k < cases; k++) moyen[k] += p[k];
  });
  let total = 0;
  for (let k = 0; k < cases; k++) { moyen[k] /= nTrames; total += moyen[k]; }
  const part = (bas: number, haut: number): number => {
    let s = 0;
    for (let k = Math.max(1, Math.floor(bas / df)); k <= Math.min(cases - 1, Math.ceil(haut / df)); k++) {
      const recouvre = Math.min(haut, (k + 0.5) * df) - Math.max(bas, (k - 0.5) * df);
      if (recouvre > 0) s += (moyen[k] * recouvre) / df;
    }
    return total > 0 ? s / total : 0;
  };
  const tiers = new Map<number, number>();
  for (const f of TIERS) if (f < fe / 2) tiers.set(f, db(part(f / 2 ** (1 / 6), f * 2 ** (1 / 6))));
  return { tiers, registres: REGISTRES.map((r) => 100 * part(r.bas, r.haut)) };
}
