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
//
// LA BOUCLE DE 1983, À CÔTÉ (2026-11-27). Avec `etirement`, le filtre de la boucle est la moyenne
// de deux échantillons de Karplus et Strong, pondérée `(1 − s) + s·z⁻¹` comme chez Jaffe et Smith :
// son module vaut `√(1 − 4s(1−s)·sin²(ω/2))`, jamais plus que 1, et son retard de phase se déduit
// comme celui du Butterworth. `melange` est le facteur b de la variante tambour, `excitation` ce qui
// pince la corde, déjà mis en forme (`audio/excitation-corde.ts`), et `priseALEntree` prend la
// sortie là où l'article l'écrit, y(n) = x(n) + …, sans le retard d'une période. Sans ces quatre
// options, le calcul est celui d'avant, échantillon pour échantillon : `corde-pincee.test.ts` le
// tient par son empreinte.

import { creerAleatoire, resoudreGraine } from "../core/hasard";
import { bruitRoseKellet } from "../core/bruit-rose";
import { coefficientPasseTout, pasPasseTout } from "./passe-tout";

export interface ReglagesCorde {
  /** La fréquence de la note, en hertz. */
  frequence: number;
  sampleRate: number;
  /** La durée du rendu, en secondes. */
  duree: number;
  /** La durée de l'excitation par le bruit rose, en secondes, quand `excitation` est absente. */
  bruit?: number;
  /** La coupure du passe-bas de la boucle, en hertz, quand `etirement` est absent. */
  coupure?: number;
  /**
   * L'étirement S de la décroissance, au moins 1. Présent, la boucle moyenne deux échantillons au
   * lieu du passe-bas : à 1, la moyenne de 1983 ; à S, les partiels graves durent S fois plus.
   */
  etirement?: number;
  /** Le facteur b de la variante tambour : le signe gardé avec la probabilité b, inversé sinon. */
  melange?: number;
  /** Ce qui pince la corde, ajouté à l'entrée de la boucle ; absente, le bruit rose sur `bruit`. */
  excitation?: Float32Array;
  /** La sortie prise à l'entrée de la boucle plutôt qu'à la sortie de la ligne. */
  priseALEntree?: boolean;
  /**
   * Le temps, en secondes, en lequel la corde perd 60 dB à partir de `debutRelache`. Présent, il
   * remplace la descente linéaire de `relache` : le gain par période devient 10^(−3 / (f·T)), et la
   * corde s'éteint en ce temps quelle que soit sa hauteur. À 0, elle se tait d'un coup.
   */
  t60Relache?: number;
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

/**
 * Le poids s de la moyenne `(1 − s) + s·z⁻¹` qui étire la décroissance de S.
 *
 * S EST CELUI DE KARPLUS ET STRONG (1983), la durée de chaque partiel multipliée par S ; leur forme
 * tire au sort, à chaque échantillon, la recopie ou la moyenne. La moyenne pondérée est celle de
 * Jaffe et Smith (1983, équation 20), sans hasard. Le partiel de pulsation ω y perd
 * `−ln|H| ≈ 2s(1−s)·sin²(ω/2)` par tour, quand la moyenne d'origine, s = ½, en perd `½·sin²(ω/2)` :
 * durer S fois plus demande donc s(1−s) = 1/(4S), dont la racine sous ½ est celle-ci, exactement ½ à
 * S = 1. La forme multiplicative que Karplus et Strong proposent, d = 1/(2S), n'en est qu'une
 * approximation : au do6, à S = 4, elle ne fait durer le fondamental que 2,29 fois plus.
 */
export const poidsDEtirement = (etirement: number) => (1 - Math.sqrt(1 - 1 / Math.max(1, etirement))) / 2;

/** La moyenne pondérée de deux échantillons, sous la forme du biquad de la boucle. */
const moyennePonderee = (s: number) => ({ b0: 1 - s, b1: s, b2: 0, a1: 0, a2: 0 });

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
export const bruitRose = (n: number, aleatoire: () => number) =>
  bruitRoseKellet(n, () => aleatoire() * 2 - 1, { regime: 4096 });

/** Calcule la corde pincée, un canal ; le tampon audio se fait chez l'appelant. */
export function calculerCordePincee(r: ReglagesCorde): Float32Array<ArrayBuffer> {
  const sr = r.sampleRate;
  const n = Math.max(1, Math.round(r.duree * sr));
  const filtre = r.etirement !== undefined ? moyennePonderee(poidsDEtirement(r.etirement)) : passeBas(r.coupure ?? 4000, sr);
  const w = (2 * Math.PI * r.frequence) / sr;

  // LA PÉRIODE SE PARTAGE : la ligne à retard prend l'entier, le passe-tout la fraction, entre un
  // dixième et un échantillon un dixième, où son retard varie le moins avec la fréquence.
  const reste = sr / r.frequence - retardDuPasseBas(filtre, w);
  const ligne = Math.max(1, Math.floor(reste - 0.1));
  const eta = coefficientPasseTout(Math.max(0.1, reste - ligne), w);

  const resonance = Math.min(1, Math.max(0, r.resonance));
  const debut = r.debutRelache * sr, longueurRelache = r.relache * sr;
  // LA DESCENTE LINÉAIRE ÉTEINT LA CORDE BIEN AVANT SA FIN : le gain passe sous 0,9 en un dixième du
  // relâchement, et à 0,9 par période un la2 perd déjà cent décibels par seconde. Mesuré par `varier`
  // sur la corde de Karplus-Strong : un relâchement de 0 et un de 1 s ne s'y séparaient que de
  // 0,4 dB. Le T60 dit ce qu'il fait, et c'est la loi de la corde neuve ; « Pluck Synth » garde la sienne.
  const apresRelache = r.t60Relache === undefined ? null
    : r.t60Relache > 0 ? resonance * Math.pow(10, -3 / (r.frequence * r.t60Relache)) : 0;
  const gain = (i: number) => {
    if (i < debut) return resonance;
    if (apresRelache !== null) return apresRelache;
    if (longueurRelache <= 0) return 0;
    return Math.max(0, resonance * (1 - (i - debut) / longueurRelache));
  };

  const aleatoire = r.aleatoire ?? creerAleatoire(resoudreGraine(0));
  const excitation = r.excitation ?? bruitRose(Math.max(1, Math.round((r.bruit ?? 0) * sr)), aleatoire);
  // À b = 1, AUCUN SIGNE N'EST TIRÉ : la suite du hasard reste celle de la corde sans tambour.
  const melange = Math.min(1, Math.max(0, r.melange ?? 1));
  const retard = new Float32Array(ligne);
  const sortie = new Float32Array(n);
  let curseur = 0, entreeAvant = 0, passeToutAvant = 0;
  let y1 = 0, y2 = 0, f1 = 0, f2 = 0;
  for (let i = 0; i < n; i++) {
    const lu = retard[curseur];
    const y = pasPasseTout(eta, lu, entreeAvant, passeToutAvant);
    entreeAvant = lu;
    passeToutAvant = y;
    const f = filtre.b0 * y + filtre.b1 * y1 + filtre.b2 * y2 - filtre.a1 * f1 - filtre.a2 * f2;
    y2 = y1; y1 = y; f2 = f1; f1 = f;
    const signe = melange < 1 && aleatoire() >= melange ? -1 : 1;
    const entree = (i < excitation.length ? excitation[i] : 0) + gain(i) * signe * f;
    retard[curseur] = entree;
    sortie[i] = (r.priseALEntree ? entree : y) * r.volume;
    curseur = (curseur + 1) % ligne;
  }
  return sortie;
}
