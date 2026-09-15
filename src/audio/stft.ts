// audio/stft.ts — Analyse-synthèse par transformée de Fourier à court terme.
//
// Générique, contrairement à celle de GTCRN (figée à 16 kHz et 512 points) :
// fenêtre de Hann en analyse ET en synthèse, recouvrement de 3/4, et division
// par la somme exacte des carrés de fenêtre à chaque échantillon. Cette
// division, et non une constante, est ce qui rend la reconstruction exacte
// jusqu'aux bords du signal, là où moins de trames se recouvrent.
//
// Le traitement se fait trame par trame, dans un rappel qui remplit un ou
// plusieurs spectres de sortie : on ne garde jamais tout le spectrogramme en
// mémoire — cinq minutes à 2048 points en tiendraient près d'un gigaoctet.

import { fft } from "./fft";

export type TraiterTrame = (
  entreeRe: Float64Array, entreeIm: Float64Array,
  sortiesRe: Float64Array[], sortiesIm: Float64Array[],
  indexTrame: number,
) => void;

export function fenetreHann(n: number): Float64Array {
  const w = new Float64Array(n);
  // Hann « périodique » : c'est elle dont les copies décalées de n/4 se somment
  // à une constante.
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/**
 * Analyse `x`, appelle `traiter` pour chaque trame, et resynthétise `nSorties`
 * signaux de la longueur de `x`.
 */
export function analyseSynthese(
  x: Float32Array, taille: number, nSorties: number, traiter: TraiterTrame,
): Float32Array[] {
  const hop = taille / 4;
  const w = fenetreHann(taille);
  // Bourrage d'une trame entière de chaque côté : chaque échantillon utile est
  // alors couvert par autant de trames que les autres.
  const longueur = x.length + 2 * taille;
  const nTrames = Math.ceil((longueur - taille) / hop) + 1;
  const sorties = Array.from({ length: nSorties }, () => new Float64Array(longueur + taille));
  const normalisation = new Float64Array(longueur + taille);

  const re = new Float64Array(taille), im = new Float64Array(taille);
  const sRe = Array.from({ length: nSorties }, () => new Float64Array(taille));
  const sIm = Array.from({ length: nSorties }, () => new Float64Array(taille));

  for (let t = 0; t < nTrames; t++) {
    const debut = t * hop;
    for (let i = 0; i < taille; i++) {
      const j = debut + i - taille; // indice dans x
      re[i] = (j >= 0 && j < x.length ? x[j] : 0) * w[i];
      im[i] = 0;
    }
    fft(re, im, false);
    for (let s = 0; s < nSorties; s++) { sRe[s].fill(0); sIm[s].fill(0); }
    traiter(re, im, sRe, sIm, t);
    for (let s = 0; s < nSorties; s++) {
      fft(sRe[s], sIm[s], true);
      const acc = sorties[s];
      // `fft` inverse normalise déjà par la taille : ne pas rediviser.
      for (let i = 0; i < taille; i++) acc[debut + i] += sRe[s][i] * w[i];
    }
    for (let i = 0; i < taille; i++) normalisation[debut + i] += w[i] * w[i];
  }

  return sorties.map((acc) => {
    const y = new Float32Array(x.length);
    for (let n = 0; n < x.length; n++) {
      const k = n + taille;
      y[n] = normalisation[k] > 1e-12 ? acc[k] / normalisation[k] : 0;
    }
    return y;
  });
}

/** Fréquence du bin k, en Hz. */
export const frequenceBin = (k: number, taille: number, sampleRate: number) => (k * sampleRate) / taille;
