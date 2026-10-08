// audio/table-onde.ts — Une banque de cycles, et de quoi la lire sans replier.
//
// CE QU'UNE TABLE D'ONDE AJOUTE À UN OSCILLATEUR. Un oscillateur ordinaire tient une seule
// forme, et la régler revient à en choisir une autre. Une table d'onde en tient une banque,
// rangée dans un ordre, et le réglage qui compte n'est plus la forme mais la POSITION dans
// cette banque : on la balaie, et le timbre se déforme continûment d'un bout à l'autre sans
// que la hauteur bouge. C'est le procédé des synthétiseurs à table d'onde depuis le PPG.
//
// LE DÉPÔT EN AVAIT DEUX GÉNÉRALISATIONS ET PAS L'ORIGINAL. `audio/terrain-onde.ts` lit une
// surface à deux dimensions, et sa propre notice dit qu'un oscillateur à table d'onde en lit
// une à une seule ; `audio/scanning.ts` lit une table que la mécanique fabrique. Aucun des
// deux ne lit une table qu'on lui DONNE, ni ne balaie une banque.
//
// LE REPLIEMENT SE TRAITE EN AMONT ET NON EN AVAL, et c'est ce qui sépare ce fichier de
// `audio/oscillateur-analogique.ts`. Là-bas, la rupture est dans l'onde elle-même et il faut
// la replacer dans l'échantillon où elle tombe. Ici, la table est connue d'avance : on la
// REFABRIQUE pour la fréquence demandée, en jetant les harmoniques qui passeraient au-dessus
// de Nyquist. Ce qu'on lit est donc déjà borné, et il ne reste à surveiller que l'erreur de
// l'interpolation entre deux points de la table.
//
// LES CYCLES SONT GARDÉS EN HARMONIQUES, NON EN POINTS. Un cycle en points ne se borne pas
// sans être analysé d'abord, et il faudrait le réanalyser à chaque changement de fréquence.
// Gardés en amplitudes et en phases, les bornes sont un simple rang à ne pas dépasser, et la
// table se refait par une transformée inverse.

import { fft } from "./fft";
import { suivreHauteur } from "./hauteur";

/** Points d'un cycle rendu. Une puissance de deux : la transformée inverse en vit. */
export const TAILLE_TABLE = 2048;
/** Emplacements d'une banque livrée. */
export const CASES = 16;
/** Rangs harmoniques gardés d'un cycle. */
export const RANGS = TAILLE_TABLE / 2 - 1;

/** Un cycle, décrit par ses harmoniques : le rang 0 n'est pas employé. */
export interface Cycle { amplitudes: Float64Array; phases: Float64Array }
export type Banque = Cycle[];

const cycleVide = (): Cycle =>
  ({ amplitudes: new Float64Array(RANGS + 1), phases: new Float64Array(RANGS + 1) });

/**
 * Le cycle rendu en points, SANS AUCUNE HARMONIQUE AU-DESSUS DE NYQUIST.
 *
 * C'est tout le traitement du repliement de ce fichier : ce qui ne peut pas être représenté
 * à cette fréquence n'est pas écrit. Le rang le plus haut gardé est donc le plus grand
 * entier sous la moitié de la cadence divisée par la fréquence, et jamais plus que ce que la
 * taille de la table peut porter.
 */
export function cycleBorne(c: Cycle, frequence: number, echantillonnage: number,
  taille = TAILLE_TABLE): Float32Array {
  // LE RANG EST CELUI QUI PASSE STRICTEMENT SOUS NYQUIST, et non celui qui l'atteint : une
  // harmonique posée exactement à la moitié de la cadence n'est pas représentable, deux
  // échantillons par période ne décidant ni de son amplitude ni de sa phase. Un plancher
  // l'aurait gardée, et une fondamentale à un quart de la cadence serait ressortie deux fois
  // trop forte, l'harmonique de rang deux s'y ajoutant.
  const rangMax = Math.min(RANGS, taille / 2 - 1,
    Math.ceil((echantillonnage / 2) / Math.max(1e-6, frequence)) - 1);
  const re = new Float64Array(taille);
  const im = new Float64Array(taille);
  for (let h = 1; h <= rangMax; h++) {
    const a = c.amplitudes[h];
    if (a === 0) continue;
    // Un sinus d'amplitude a et de phase p vaut, en bins, deux conjugués d'argument a/2.
    // Le facteur de taille compense la division que la transformée inverse applique.
    const p = c.phases[h];
    re[h] = (a * taille * Math.sin(p)) / 2;
    im[h] = (-a * taille * Math.cos(p)) / 2;
    re[taille - h] = re[h];
    im[taille - h] = -im[h];
  }
  fft(re, im, true);
  const points = new Float32Array(taille);
  for (let i = 0; i < taille; i++) points[i] = re[i];
  return points;
}

/** Les harmoniques d'un cycle donné en points. */
export function analyserCycle(points: Float32Array): Cycle {
  const n = points.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = points[i];
  fft(re, im, false);
  const c = cycleVide();
  for (let h = 1; h <= Math.min(RANGS, n / 2 - 1); h++) {
    c.amplitudes[h] = (2 * Math.hypot(re[h], im[h])) / n;
    // LA PHASE SE LIT DANS LA MÊME CONVENTION QUE CELLE QUI L'ÉCRIT, et c'est un plantage
    // qui l'a montré. Pour un sinus d'amplitude a et de phase p, la transformée rend une
    // partie réelle en sinus de p et une partie imaginaire en moins cosinus de p : prendre
    // l'arc tangente dans l'autre ordre rendait pi sur deux moins p. Les amplitudes étant
    // justes, un cycle tiré d'un son se refaisait avec le bon spectre et la mauvaise forme.
    c.phases[h] = Math.atan2(re[h], -im[h]);
  }
  return c;
}

export type FamilleId = "sinus-scie" | "sinus-carre" | "harmonique-glissante" | "impair-vers-pair";

export const FAMILLES: { id: FamilleId; fr: string; en: string }[] = [
  { id: "sinus-scie", fr: "Du sinus à la scie", en: "Sine to sawtooth" },
  { id: "sinus-carre", fr: "Du sinus au carré", en: "Sine to square" },
  { id: "harmonique-glissante", fr: "Harmonique glissante", en: "Sliding harmonic" },
  { id: "impair-vers-pair", fr: "Des impaires aux paires", en: "Odd towards even" },
];

/**
 * Une banque livrée, ENGENDRÉE et non stockée.
 *
 * Une table de nombres aurait à être tenue à jour, relue et vérifiée ; une règle en deux
 * lignes se lit et dit ce qu'elle fait. Les quatre familles balaient des choses différentes :
 * le nombre d'harmoniques, leur parité, ou le rang d'une seule d'entre elles.
 */
export function banqueEngendree(famille: FamilleId, cases = CASES, rangs = 64): Banque {
  const banque: Banque = [];
  for (let k = 0; k < cases; k++) {
    const t = cases === 1 ? 0 : k / (cases - 1);
    const c = cycleVide();
    if (famille === "harmonique-glissante") {
      c.amplitudes[Math.max(1, Math.round(1 + t * (rangs - 1)))] = 1;
    } else {
      const hautMax = Math.max(1, Math.round(1 + t * (rangs - 1)));
      for (let h = 1; h <= rangs; h++) {
        if (famille === "sinus-scie" && h <= hautMax) c.amplitudes[h] = 1 / h;
        else if (famille === "sinus-carre" && h % 2 === 1 && h <= hautMax) c.amplitudes[h] = 1 / h;
        else if (famille === "impair-vers-pair") {
          c.amplitudes[h] = (h % 2 === 1 ? 1 : t) / h;
        }
      }
    }
    banque.push(c);
  }
  return banque;
}

/**
 * Une banque bâtie depuis un son : sa période est détectée, puis des cycles en sont tirés.
 *
 * LE SUIVI DE HAUTEUR EST CELUI DU DÉPÔT, et non un second écrit ici. La fréquence retenue
 * est la MÉDIANE des trames confiantes et non leur moyenne : une seule trame mal décidée, à
 * l'octave par exemple, déplacerait une moyenne et laisserait une médiane en place, et la
 * période fausse découperait des cycles qui ne se referment pas.
 */
export function banqueDepuisSon(x: Float32Array, echantillonnage: number, cases = CASES):
{ banque: Banque; frequence: number } | null {
  const suivi = suivreHauteur(x, echantillonnage, { fMin: 40, fMax: 2000, cadence: 100 });
  const retenues: number[] = [];
  for (let i = 0; i < suivi.hauteurs.length; i++) {
    if (suivi.confiances[i] > 0.5 && suivi.hauteurs[i] > 0) retenues.push(suivi.hauteurs[i]);
  }
  if (retenues.length === 0) return null;
  retenues.sort((a, b) => a - b);
  const frequence = retenues[Math.floor(retenues.length / 2)];
  const periode = echantillonnage / frequence;
  if (!(periode > 2) || x.length < periode * 2) return null;

  const banque: Banque = [];
  const dernier = Math.max(0, x.length - Math.ceil(periode) - 1);
  for (let k = 0; k < cases; k++) {
    const depart = cases === 1 ? 0 : Math.floor((k / (cases - 1)) * dernier);
    const points = new Float32Array(TAILLE_TABLE);
    for (let i = 0; i < TAILLE_TABLE; i++) {
      const p = depart + (i / TAILLE_TABLE) * periode;
      const j = Math.floor(p);
      const f = p - j;
      points[i] = (x[j] ?? 0) * (1 - f) + (x[j + 1] ?? 0) * f;
    }
    banque.push(analyserCycle(points));
  }
  return { banque, frequence };
}

/**
 * Un point de la table, interpolé par Catmull-Rom.
 *
 * L'INTERPOLATION LINÉAIRE NE SUFFIT PAS AUX FRÉQUENCES GRAVES. À cinquante hertz, la table
 * porte quatre cents harmoniques et la plus haute n'a que cinq points par période : une
 * droite entre deux points en manque la courbure, et l'erreur s'entend comme une distorsion.
 * Catmull-Rom passe par les quatre points voisins et son erreur décroît comme la puissance
 * quatrième du pas.
 */
export function lireTable(table: Float32Array, position: number): number {
  const n = table.length;
  const i = Math.floor(position);
  const f = position - i;
  // LE RESTE EST RAMENÉ DANS LES POSITIFS, parce que celui de JavaScript garde le signe de
  // son premier terme : à une position négative, `i % n` vaut un indice négatif et la table
  // rend undefined, donc NaN. La phase ne descend jamais sous zéro aujourd'hui, mais une
  // fonction qui boucle doit boucler des deux côtés.
  const a = (k: number) => table[((k % n) + n) % n];
  const p0 = a(i - 1);
  const p1 = a(i);
  const p2 = a(i + 1);
  const p3 = a(i + 2);
  return p1 + 0.5 * f * (p2 - p0
    + f * (2 * p0 - 5 * p1 + 4 * p2 - p3
      + f * (3 * (p1 - p2) + p3 - p0)));
}

export interface ReglagesTable {
  frequence: number;
  duree: number;
  /** Où lire dans la banque, de 0 à 1. */
  position: number;
  /** Profondeur du balayage de position, de 0 à 1. */
  modulationPosition: number;
  /** Vitesse du balayage, en hertz. */
  vitesseModulation: number;
}

/**
 * L'onde lue dans la banque, la position balayée.
 *
 * LES CYCLES SONT BORNÉS UNE FOIS POUR TOUTES avant la boucle : la fréquence ne bouge pas
 * pendant une note, donc le rang le plus haut non plus, et les refaire à chaque échantillon
 * coûterait une transformée par échantillon pour un résultat identique.
 */
export function synthetiserTable(banque: Banque, r: ReglagesTable,
  echantillonnage: number): Float32Array {
  const tables = banque.map((c) => cycleBorne(c, r.frequence, echantillonnage));
  const total = Math.max(1, Math.floor(echantillonnage * r.duree));
  const sortie = new Float32Array(total);
  const pas = (TAILLE_TABLE * r.frequence) / echantillonnage;
  const pasLfo = r.vitesseModulation / echantillonnage;
  const ampleur = Math.max(0, Math.min(1, r.modulationPosition));
  const base = Math.max(0, Math.min(1, r.position));
  let phase = 0;
  let lfo = 0;

  for (let i = 0; i < total; i++) {
    const p = Math.max(0, Math.min(1, base + ampleur * Math.sin(2 * Math.PI * lfo)));
    lfo += pasLfo;
    if (lfo >= 1) lfo -= Math.floor(lfo);

    const rang = p * (tables.length - 1);
    const bas = Math.floor(rang);
    const haut = Math.min(tables.length - 1, bas + 1);
    const melange = rang - bas;
    const a = lireTable(tables[bas], phase);
    sortie[i] = melange === 0 ? a : a * (1 - melange) + lireTable(tables[haut], phase) * melange;

    phase += pas;
    if (phase >= TAILLE_TABLE) phase -= TAILLE_TABLE * Math.floor(phase / TAILLE_TABLE);
  }
  return sortie;
}
