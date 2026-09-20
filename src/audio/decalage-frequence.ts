// audio/decalage-frequence.ts — Décaler toutes les fréquences d'un même nombre de hertz.
//
// D'après Scott Wardle, « A Hilbert-Transformer Frequency Shifter for Audio », DAFx-98 —
// https://www.mikrocontroller.net/attachment/33905/Audio_Hilbert_WAR19.pdf
// L'original est analogique : Harald Bode et Robert Moog, « A High-Accuracy Frequency Shifter
// for Professional Audio Applications », JAES, 1972.
//
// CE QUE C'EST, ET CE QUE CE N'EST PAS. Attic a déjà un modulateur en anneau et un
// transpositeur, et le décaleur n'est ni l'un ni l'autre :
//
//   — le TRANSPOSITEUR multiplie les fréquences. 200-400-600 monté d'une octave donne
//     400-800-1200 : les rapports sont gardés, le son reste harmonique, on entend une note
//     plus haute ;
//   — le MODULATEUR EN ANNEAU multiplie deux signaux et rend les deux bandes latérales à la
//     fois, somme ET différence : 200 modulé par 50 donne 150 et 250 en même temps ;
//   — le DÉCALEUR ajoute le même nombre de hertz à tout, et une seule bande latérale.
//     200-400-600 décalé de 50 donne 250-450-650. Les rapports ne sont plus entiers : le son
//     n'est plus harmonique, il devient cloche, barre de métal, chose inouïe. C'est le seul
//     des trois qui DÉTRUIT l'harmonicité en gardant l'enveloppe intacte.
//
// COMMENT. On forme le signal analytique — le signal réel et sa transformée de Hilbert, qui
// est le même signal décalé de quatre-vingt-dix degrés à toutes les fréquences —, puis on le
// fait tourner dans le plan complexe à la vitesse voulue :
//
//     y(t) = x(t)·cos(2πft) − H{x}(t)·sin(2πft)
//
// La soustraction donne la bande latérale supérieure, l'addition l'inférieure ; un décalage
// négatif fait donc la seconde sans qu'on ait à l'écrire deux fois.
//
// LE DÉFAUT INHÉRENT, qu'il vaut mieux nommer que cacher : vers le bas, les partiels qui
// passeraient sous zéro hertz se REPLIENT autour de zéro et remontent. Ce n'est pas un bogue,
// c'est ce que fait un décalage à bande latérale unique, et c'est même une part de son
// caractère — mais cela explique qu'un décalage de −300 Hz sur une basse rende autre chose
// qu'une basse plus grave.

import { analyseSynthese } from "./stft";

/** Taille de trame par défaut. La transformée de Hilbert n'en demande pas de grande. */
export const TAILLE_TRAME = 2048;

/**
 * Transformée de Hilbert : le même signal, déphasé de 90° à toutes les fréquences.
 *
 * En fréquence, c'est une multiplication par −j sur les fréquences positives et par +j sur les
 * négatives — le continu et Nyquist, qui n'ont pas de phase à décaler, sont mis à zéro. On
 * passe par l'analyse-synthèse d'Attic plutôt que par une transformée du signal entier : une
 * minute de son demanderait sinon une transformée de seize millions de points.
 */
export function hilbert(x: Float32Array, taille = TAILLE_TRAME): Float32Array {
  const moitie = taille / 2;
  const [h] = analyseSynthese(x, taille, 1, (re, im, sRe, sIm) => {
    // Continu : rien à déphaser.
    sRe[0][0] = 0; sIm[0][0] = 0;
    for (let k = 1; k < moitie; k++) {
      // Fréquence positive : × (−j) — (a + jb)(−j) = b − ja.
      sRe[0][k] = im[k]; sIm[0][k] = -re[k];
      // Sa miroir négative : × (+j), pour que le résultat reste un signal réel.
      const n = taille - k;
      sRe[0][n] = -im[n]; sIm[0][n] = re[n];
    }
    sRe[0][moitie] = 0; sIm[0][moitie] = 0;
  });
  return h;
}

export interface OptionsDecalage {
  /** Fréquence d'échantillonnage, pour convertir le décalage en radians par échantillon. */
  sampleRate: number;
  /** Taille de trame de la transformée de Hilbert. */
  taille?: number;
  /** Phase initiale de l'oscillateur, en radians. Utile pour décaler deux canaux différemment. */
  phase?: number;
}

/**
 * Décale toutes les fréquences de `decalageHz`.
 *
 * Positif vers le haut, négatif vers le bas. Zéro rend le signal inchangé — et il le rend
 * VRAIMENT inchangé, la transformée de Hilbert n'étant alors multipliée que par zéro : on ne
 * paie pas une reconstruction approximative pour ne rien faire.
 */
export function decalerFrequence(
  x: Float32Array, decalageHz: number, o: OptionsDecalage,
): Float32Array {
  if (!Number.isFinite(decalageHz) || decalageHz === 0) return Float32Array.from(x);
  const h = hilbert(x, o.taille ?? TAILLE_TRAME);
  const w = (2 * Math.PI * decalageHz) / o.sampleRate;
  const phase0 = o.phase ?? 0;
  const y = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    const a = w * n + phase0;
    y[n] = x[n] * Math.cos(a) - h[n] * Math.sin(a);
  }
  return y;
}

/**
 * Où tombe une fréquence après décalage, repliement compris.
 *
 * Sert à dire dans l'interface ce que devient une note, et surtout à rendre le repliement
 * PRÉVISIBLE plutôt que surprenant : ce qui passerait sous zéro remonte de l'autre côté.
 */
export function frequenceDecalee(frequenceHz: number, decalageHz: number): number {
  return Math.abs(frequenceHz + decalageHz);
}
