// audio/ecart-reference-signal.ts — Les briques de « Écart à une référence » : spectres de puissance par
// trames, centiles, décibels, transformée en cosinus.
//
// LA PUISSANCE D'UNE TRAME EST NORMALISÉE PAR LA SOMME DES CARRÉS DE LA FENÊTRE ET PAR LA TAILLE, et le
// spectre est replié sur une seule face : la somme des cases vaut alors l'énergie moyenne par
// échantillon de la trame, quelle que soit la taille de la transformée. Un sinus d'amplitude A y somme
// à A²/2. C'est ce qui permet de comparer deux sons pris à deux fréquences d'échantillonnage : la
// grandeur ne dépend ni de la grille des cases ni du nombre d'échantillons par trame.
//
// UNE TRAME QUI DÉBORDE LA FIN DU SON EST COMPLÉTÉE DE ZÉROS, et un son plus court qu'une trame en fait
// une seule : un son de deux cents millisecondes a encore un spectre.

import { fft } from "./fft";
import { fenetreHann } from "./stft";

/** Le spectre de puissance d'une trame, `taille / 2 + 1` cases, et le rang de son premier échantillon. */
export type RappelTrame = (puissance: Float64Array, rang: number, debut: number) => void;

/**
 * Parcourt `x` par trames de `taille` échantillons au pas de `pas`, fenêtre de Hann, et rend à `rappel`
 * le spectre de puissance de chacune. Le tableau rendu est réutilisé d'une trame à l'autre. Rend le
 * nombre de trames.
 */
export function spectresDePuissance(x: ArrayLike<number>, taille: number, pas: number, rappel: RappelTrame): number {
  const w = fenetreHann(taille);
  let sommeCarres = 0;
  for (let i = 0; i < taille; i++) sommeCarres += w[i] * w[i];
  const norme = 1 / (sommeCarres * taille);
  const re = new Float64Array(taille), im = new Float64Array(taille);
  const cases = taille / 2 + 1;
  const p = new Float64Array(cases);
  const nTrames = Math.max(1, Math.floor((x.length - taille) / pas) + 1);
  for (let t = 0; t < nTrames; t++) {
    const debut = t * pas;
    for (let i = 0; i < taille; i++) {
      const j = debut + i;
      re[i] = (j < x.length ? x[j] : 0) * w[i];
      im[i] = 0;
    }
    fft(re, im, false);
    for (let k = 0; k < cases; k++) {
      const m = (re[k] * re[k] + im[k] * im[k]) * norme;
      p[k] = k === 0 || k === taille / 2 ? m : 2 * m;
    }
    rappel(p, t, debut);
  }
  return nTrames;
}

/** Une puissance en décibels, bornée à −200 dB pour le silence. */
export const db = (p: number): number => 10 * Math.log10(Math.max(p, 1e-20));

export const moyenne = (v: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return v.length > 0 ? s / v.length : NaN;
};

/** Le centile `q` (entre 0 et 1), interpolé entre les deux rangs voisins ; NaN sur une liste vide. */
export function quantile(valeurs: ArrayLike<number>, q: number): number {
  const s = Float64Array.from(valeurs).sort();
  if (s.length === 0) return NaN;
  const i = (s.length - 1) * q, bas = Math.floor(i), haut = Math.ceil(i);
  return s[bas] + (s[haut] - s[bas]) * (i - bas);
}

/** Les `nCoef` premiers coefficients de la transformée en cosinus discrète de type II, orthonormée. */
export function dct(v: ArrayLike<number>, nCoef: number): Float64Array {
  const N = v.length, out = new Float64Array(nCoef);
  for (let k = 0; k < nCoef; k++) {
    let s = 0;
    for (let i = 0; i < N; i++) s += v[i] * Math.cos((Math.PI * k * (i + 0.5)) / N);
    out[k] = s * Math.sqrt((k === 0 ? 1 : 2) / N);
  }
  return out;
}
