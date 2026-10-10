// audio/rotatifs.ts — Ce qui bouge dans le spectre plutôt que dans le niveau.
//
// DEUX EFFETS, UNE MÊME IDÉE, et c'est ce qui les met dans le même fichier. Un trémolo
// ordinaire monte et descend le niveau de tout le son d'un seul bloc : ce qu'on entend est
// une pulsation. Les deux effets d'ici coupent d'abord le son en deux bandes, puis font à
// chacune quelque chose de DIFFÉRENT, de sorte que c'est l'équilibre du spectre qui bouge
// et non le niveau. Le trémolo harmonique module les deux bandes en opposition : quand le
// grave monte, l'aigu descend, et la somme garde à peu près son niveau pendant que la
// couleur oscille. Le haut-parleur rotatif envoie les deux bandes à deux rotors de tailles
// et de vitesses différentes, dont chacun apporte son propre retard et son propre niveau.
//
// LE FILTRE DE SÉPARATION EST ÉCRIT ICI PLUTÔT QUE PRIS À WEB AUDIO. `audio/effets-filtres.ts`
// pose un biquad par `OfflineAudioContext`, qui n'existe pas dans l'environnement de test :
// deux cas du dépôt s'y sautent déjà. Un calcul qu'on ne peut pas mesurer hors du navigateur
// ne peut pas porter de garde, et c'est précisément la platitude de la somme des deux bandes
// qu'il faut tenir ici.
//
// LA SÉPARATION EST UN LINKWITZ-RILEY D'ORDRE QUATRE, c'est-à-dire deux sections de
// Butterworth en cascade de chaque côté. Sa propriété est que la somme des deux bandes est un
// passe-tout : le module est plat, seule la phase tourne. Un simple passe-bas et un simple
// passe-haut d'ordre deux laisseraient un creux de trois décibels à la coupure, qu'on
// entendrait comme un trou au milieu du son dès que la modulation est à zéro.
//
// LE DOPPLER EST UNE LONGUEUR, NON UN RAPPORT. Un rotor de rayon R tournant à f hertz
// présente un trajet qui s'allonge et se raccourcit de R, soit un retard qui varie de R sur
// la vitesse du son. La hauteur suit la DÉRIVÉE de ce retard, d'où un écart maximal de deux
// pi f R sur c. Écrire le retard en mètres plutôt qu'en cents fait que l'écart de hauteur
// sort du calcul au lieu d'y être posé à la main, et qu'il suit la vitesse comme il le doit.

import { valeurA } from "./courbe";
import { fft } from "./fft";

/** La vitesse du son dans l'air, en mètres par seconde, à vingt degrés. */
export const VITESSE_SON = 343;
/** Les rayons des deux rotors d'une cabine, en mètres : la trompe et le tambour. */
export const RAYON_AIGU = 0.17;
export const RAYON_GRAVE = 0.12;
/** La racine de deux sur deux : le facteur de qualité d'une section de Butterworth. */
const Q_BUTTERWORTH = Math.SQRT1_2;

export interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

const section = (fc: number, sr: number, haut: boolean): Biquad => {
  const w = (2 * Math.PI * Math.min(fc, sr / 2 - 1)) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Q_BUTTERWORTH);
  const a0 = 1 + alpha;
  const n = haut ? (1 + cos) / 2 : (1 - cos) / 2;
  return {
    b0: n / a0, b1: (haut ? -2 * n : 2 * n) / a0, b2: n / a0,
    a1: (-2 * cos) / a0, a2: (1 - alpha) / a0,
  };
};

export const passeBas = (fc: number, sr: number): Biquad => section(fc, sr, false);
export const passeHaut = (fc: number, sr: number): Biquad => section(fc, sr, true);

/** Une section de biquad, forme directe I, appliquée hors place. */
export function filtrer(x: Float32Array, b: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b.b0 * x[i] + b.b1 * x1 + b.b2 * x2 - b.a1 * y1 - b.a2 * y2;
    x2 = x1; x1 = x[i];
    y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * Les deux bandes d'un Linkwitz-Riley d'ordre quatre.
 *
 * Deux sections identiques en cascade de chaque côté : c'est ce qui porte la pente à
 * vingt-quatre décibels par octave et, surtout, ce qui met les deux bandes en phase à la
 * coupure, de sorte que leur somme ne creuse pas.
 */
export function separerEnDeuxBandes(x: Float32Array, fc: number, sr: number):
{ grave: Float32Array; aigu: Float32Array } {
  const pb = passeBas(fc, sr);
  const ph = passeHaut(fc, sr);
  return { grave: filtrer(filtrer(x, pb), pb), aigu: filtrer(filtrer(x, ph), ph) };
}

/** Le module du spectre, pour les mesures de platitude. */
export function moduleSpectre(x: Float32Array, debut: number, n: number): Float64Array {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[debut + i] ?? 0;
  fft(re, im, false);
  const m = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) m[k] = Math.hypot(re[k], im[k]);
  return m;
}

export interface ReglagesTremoloHarmonique {
  /** Vitesse de l'oscillation, en hertz. */
  vitesse: number;
  /** Profondeur, de 0 à 1. */
  profondeur: number;
  /** Fréquence qui sépare les deux bandes, en hertz. */
  coupure: number;
  /** Part de son traité, de 0 à 1. */
  melange: number | Float32Array;
}

/**
 * Le trémolo harmonique : les deux bandes montent et descendent en opposition.
 *
 * À profondeur pleine, le grave est au plus haut quand l'aigu est au plus bas. Le niveau de
 * la somme bouge donc beaucoup moins que celui de chaque bande, et c'est la couleur qui
 * oscille : un trémolo ordinaire se reconnaîtrait au contraire à sa pulsation de niveau.
 */
export function tremoloHarmonique(canaux: Float32Array[], sr: number,
  r: ReglagesTremoloHarmonique): Float32Array[] {
  const d = Math.max(0, Math.min(1, r.profondeur));
  // LE MÉLANGE PEUT VARIER AU FIL DU SON. `valeurA` rend un scalaire tel quel : il n'y a donc pas
  // deux chemins de calcul, un « modulé » et un « ordinaire », qui pourraient diverger un jour.
  const melangeA = (i: number) => Math.max(0, Math.min(1, valeurA(r.melange, i)));
  return canaux.map((x) => {
    const { grave, aigu } = separerEnDeuxBandes(x, r.coupure, sr);
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const c = Math.cos((2 * Math.PI * r.vitesse * i) / sr);
      // Les deux gains sont bâtis sur le MÊME cosinus et de signes opposés : c'est ce qui
      // garantit qu'ils se croisent, et qu'aucun instant ne les trouve tous deux au plus bas.
      const gGrave = 1 - (d * (1 - c)) / 2;
      const gAigu = 1 - (d * (1 + c)) / 2;
      const m = melangeA(i);
      y[i] = (1 - m) * x[i] + m * (grave[i] * gGrave + aigu[i] * gAigu);
    }
    return y;
  });
}

export interface ReglagesRotatif {
  /** Vitesse du rotor aigu, en tours par seconde. */
  vitesseAigu: number;
  /** Vitesse du rotor grave, en tours par seconde. */
  vitesseGrave: number;
  /** Fréquence qui sépare la trompe du tambour, en hertz. */
  coupure: number;
  /** Part de la variation de niveau, de 0 à 1. */
  profondeurAmplitude: number;
  /** Part du trajet parcouru, de 0 à 1 : c'est elle qui décide de l'écart de hauteur. */
  profondeurDoppler: number;
  /** Écart entre les deux micros, de 0 à 1. À zéro ils sont au même endroit. */
  largeur: number;
  melange: number | Float32Array;
}

/** Un retard fractionnaire, interpolé linéairement entre les deux échantillons voisins. */
const lire = (x: Float32Array, position: number): number => {
  if (position <= 0) return x[0] ?? 0;
  const i = Math.floor(position);
  if (i + 1 >= x.length) return x[x.length - 1] ?? 0;
  const f = position - i;
  return x[i] * (1 - f) + x[i + 1] * f;
};

/**
 * Un rotor : il éloigne et rapproche la source, ce qui donne à la fois un retard qui varie,
 * donc la hauteur, et un niveau qui varie, donc la pulsation.
 *
 * `dephasage` est la position du micro autour de l'axe. Deux micros opposés voient le rotor
 * arriver à un demi-tour d'intervalle, et c'est de là que vient la largeur du son.
 */
function rotor(x: Float32Array, sr: number, vitesse: number, rayon: number,
  profondeurAmplitude: number, profondeurDoppler: number, dephasage: number): Float32Array {
  const y = new Float32Array(x.length);
  const retardMax = (rayon / VITESSE_SON) * sr * profondeurDoppler;
  for (let i = 0; i < x.length; i++) {
    const phase = (2 * Math.PI * vitesse * i) / sr + dephasage;
    const c = Math.cos(phase);
    y[i] = lire(x, i - retardMax * (1 - c)) * (1 - (profondeurAmplitude * (1 - c)) / 2);
  }
  return y;
}

/**
 * Le haut-parleur rotatif : deux rotors de tailles et de vitesses différentes, pris par deux
 * micros opposés.
 *
 * LA SOURCE EST MONO, PARCE QU'UNE CABINE N'A QU'UN MOTEUR : les canaux d'entrée sont sommés
 * avant d'être séparés en bandes, et la stéréophonie de la sortie vient des deux micros, qui
 * ne voient pas passer les rotors au même instant. Une entrée à un seul canal ressort donc
 * stéréophonique.
 *
 * LE CHEMIN SEC, LUI, GARDE SES CANAUX, et c'est un balayage dans l'application qui l'a
 * imposé : sommé lui aussi, il rendait à mélange nul un son plus faible que l'entrée, les
 * deux canaux du signal d'essai n'étant pas identiques. Un réglage de mélange doit rendre
 * l'entrée telle quelle quand il est à zéro, sur une entrée stéréophonique comme sur une
 * autre.
 */
export function hautParleurRotatif(canaux: Float32Array[], sr: number,
  r: ReglagesRotatif): [Float32Array, Float32Array] {
  const melangeA = (i: number) => Math.max(0, Math.min(1, valeurA(r.melange, i)));
  const ecart = Math.PI * Math.max(0, Math.min(1, r.largeur));
  const n = canaux[0]?.length ?? 0;

  const source = new Float32Array(n);
  for (const x of canaux) for (let i = 0; i < n; i++) source[i] += x[i] / canaux.length;
  const { grave, aigu } = separerEnDeuxBandes(source, r.coupure, sr);

  const sortie: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  for (let micro = 0; micro < 2; micro++) {
    const dephasage = micro === 0 ? 0 : ecart;
    const t = rotor(aigu, sr, r.vitesseAigu, RAYON_AIGU,
      r.profondeurAmplitude, r.profondeurDoppler, dephasage);
    const b = rotor(grave, sr, r.vitesseGrave, RAYON_GRAVE,
      r.profondeurAmplitude, r.profondeurDoppler, dephasage);
    const sec = canaux[Math.min(micro, canaux.length - 1)];
    for (let i = 0; i < n; i++) {
      const m = melangeA(i);
      sortie[micro][i] = (1 - m) * sec[i] + m * (t[i] + b[i]);
    }
  }
  return sortie;
}
