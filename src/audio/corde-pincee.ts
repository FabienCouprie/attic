// audio/corde-pincee.ts — La corde pincée de Karplus et Strong, calculée échantillon par échantillon.
//
// POURQUOI HORS DU GRAPHE WEB AUDIO (2026-11-15). La boucle était faite de nœuds Tone.js : un retard,
// un passe-bas, un gain, et le retour au retard. Or un retard pris dans une boucle ne descend pas
// sous une tranche de rendu, 128 échantillons, et la corde ne jouait pas sa note. Chromium ajoute la
// tranche à chaque période : au 44,1 kHz de l'application, le do4 sortait à 147,5 Hz et le do6 à
// 256 Hz. Le polyfill de Node borne le retard à la tranche au lieu de l'ajouter : toute note au-dessus
// du fa♯4 sortait à 366 Hz. Une boucle d'échantillons n'a pas de tranche, et rend la même chose
// partout.
//
// L'ACCORD EST EXACT À LA FONDAMENTALE. La période se partage entre la ligne à retard, un nombre
// entier d'échantillons, le passe-tout d'accord de `audio/passe-tout.ts` pour la fraction, et le
// passe-bas, dont le retard de phase à la fondamentale est déduit. Sans cette déduction, le grave
// sortait d'une vingtaine de cents trop bas.
//
// LA BOUCLE NE REND JAMAIS PLUS QUE LA RÉSONANCE. Le passe-bas est un Butterworth, sans bosse à la
// coupure, et le passe-tout a un gain de 1 à toute fréquence.

import { creerAleatoire, resoudreGraine } from "../core/hasard";
import { bruitRoseKellet } from "../core/bruit-rose";
import { coefficientPasseTout, pasPasseTout } from "./passe-tout";

export interface ReglagesCorde {
  /** La fréquence de la note, en hertz. */
  frequence: number;
  sampleRate: number;
  /** La durée du rendu, en secondes. */
  duree: number;
  /** La durée de l'excitation par le bruit rose, en secondes. */
  bruit: number;
  /** La coupure du passe-bas de la boucle, en hertz. */
  coupure: number;
  /** Le gain de la boucle, borné à [0, 1]. */
  resonance: number;
  /** Où la résonance commence à descendre vers zéro, et en combien de temps, en secondes. */
  debutRelache: number;
  relache: number;
  /** Le gain de sortie, de 0 à 1. */
  volume: number;
  /**
   * Le hasard du bruit qui pince la corde, du générateur commun. Absent, il est tiré au sort, et deux
   * rendus diffèrent ; une graine le rend à l'identique.
   */
  aleatoire?: () => number;
}

/** Le passe-bas de Butterworth du second ordre, par les formules de Web Audio, normalisé. */
function passeBas(coupure: number, sr: number) {
  const w0 = (2 * Math.PI * Math.min(coupure, 0.45 * sr)) / sr;
  const alpha = Math.sin(w0) / Math.SQRT2, cw = Math.cos(w0), a0 = 1 + alpha;
  return { b0: (1 - cw) / 2 / a0, b1: (1 - cw) / a0, b2: (1 - cw) / 2 / a0, a1: (-2 * cw) / a0, a2: (1 - alpha) / a0 };
}

/** L'argument de `c0 + c1·e^(−jω) + c2·e^(−2jω)`. */
const argument = (c0: number, c1: number, c2: number, w: number) =>
  Math.atan2(-(c1 * Math.sin(w) + c2 * Math.sin(2 * w)), c0 + c1 * Math.cos(w) + c2 * Math.cos(2 * w));

/** Le retard de phase du passe-bas à la pulsation `w`, en échantillons, la phase déroulée depuis zéro. */
function retardDuPasseBas(f: ReturnType<typeof passeBas>, w: number): number {
  let phase = 0, avant = 0;
  for (let k = 1; k <= 64; k++) {
    const x = (w * k) / 64;
    const p = argument(f.b0, f.b1, f.b2, x) - argument(1, f.a1, f.a2, x);
    const pas = p - avant;
    phase += pas - 2 * Math.PI * Math.round(pas / (2 * Math.PI));
    avant = p;
  }
  return -phase / w;
}

/**
 * Le bruit rose de Paul Kellet, mis en régime avant d'être gardé : la corde reçoit une tranche prise
 * dans un bruit établi, et non le départ à froid de ses filtres.
 */
const bruitRose = (n: number, aleatoire: () => number) =>
  bruitRoseKellet(n, () => aleatoire() * 2 - 1, { regime: 4096 });

/** Calcule la corde pincée, un canal ; le tampon audio se fait chez l'appelant. */
export function calculerCordePincee(r: ReglagesCorde): Float32Array<ArrayBuffer> {
  const sr = r.sampleRate;
  const n = Math.max(1, Math.round(r.duree * sr));
  const filtre = passeBas(r.coupure, sr);
  const w = (2 * Math.PI * r.frequence) / sr;

  // LA PÉRIODE SE PARTAGE : la ligne à retard prend l'entier, le passe-tout la fraction, entre un
  // dixième et un échantillon un dixième, où son retard varie le moins avec la fréquence.
  const reste = sr / r.frequence - retardDuPasseBas(filtre, w);
  const ligne = Math.max(1, Math.floor(reste - 0.1));
  const eta = coefficientPasseTout(Math.max(0.1, reste - ligne), w);

  const resonance = Math.min(1, Math.max(0, r.resonance));
  const debut = r.debutRelache * sr, longueurRelache = r.relache * sr;
  const gain = (i: number) => {
    if (i < debut) return resonance;
    if (longueurRelache <= 0) return 0;
    return Math.max(0, resonance * (1 - (i - debut) / longueurRelache));
  };

  const excitation = bruitRose(Math.max(1, Math.round(r.bruit * sr)), r.aleatoire ?? creerAleatoire(resoudreGraine(0)));
  const retard = new Float32Array(ligne);
  const sortie = new Float32Array(n);
  let curseur = 0, entreeAvant = 0, passeToutAvant = 0;
  let y1 = 0, y2 = 0, f1 = 0, f2 = 0;
  for (let i = 0; i < n; i++) {
    const lu = retard[curseur];
    const y = pasPasseTout(eta, lu, entreeAvant, passeToutAvant);
    entreeAvant = lu;
    passeToutAvant = y;
    sortie[i] = y * r.volume;
    const f = filtre.b0 * y + filtre.b1 * y1 + filtre.b2 * y2 - filtre.a1 * f1 - filtre.a2 * f2;
    y2 = y1; y1 = y; f2 = f1; f1 = f;
    retard[curseur] = (i < excitation.length ? excitation[i] : 0) + gain(i) * f;
    curseur = (curseur + 1) % ligne;
  }
  return sortie;
}
