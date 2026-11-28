// audio/excitation-corde.ts — Ce qui pince une corde de Karplus-Strong, mis en forme avant la boucle.
//
// L'EXCITATION REMPLIT LA LIGNE. Karplus et Strong (1983) y posent une période de bruit blanc ;
// Jaffe et Smith (1983) la passent d'abord par des filtres, que J. O. Smith reprend dans « Physical
// Audio Signal Processing », section « Extended Karplus-Strong Algorithm » :
//
//   · la direction du pincement, `(1 − p) / (1 − p·z⁻¹)` ;
//   · la nuance, `(1 − R) / (1 − R·z⁻¹)`, dont le pôle se calcule note par note (`poleDeNuance`) ;
//   · la position du pincement, `1 − z^(−⌊βN + ½⌋)`, N étant la période en échantillons.
//
// TOUS TROIS SONT HORS DE LA BOUCLE, et c'est ce qui les rend exacts à mesurer : chacun multiplie le
// partiel k par son module à la pulsation de ce partiel, et ne touche ni à la hauteur ni à la
// décroissance. Le peigne de position éteint les partiels multiples de 1/β : pincée au cinquième,
// la corde perd ses partiels 5, 10, 15.
//
// UN FILTRE RÉCURSIF NE S'ARRÊTE PAS AVEC SON ENTRÉE. Une période d'un do7 vaut 21 échantillons, et
// un pôle à 0,95 n'est descendu qu'à 0,34 au bout de ce temps : couper la queue là changeait le
// spectre que le filtre est censé donner. L'excitation se prolonge donc jusqu'à ce que chaque pôle
// soit sous un millionième.

import { bruitRose } from "./corde-pincee";

/** Les quatre façons de pincer la corde. */
export type GenreExcitation = "blanc" | "rose" | "impulsion" | "audio";

export interface OptionsExcitation {
  genre: GenreExcitation;
  /** La période de la note, en échantillons, fraction comprise. */
  periode: number;
  /** La longueur de l'excitation, en périodes ; l'impulsion ne dure qu'un échantillon. */
  longueur: number;
  /** Le son reçu, mono, pour le genre « audio ». */
  audio?: Float32Array | null;
  /** Où commencer à lire le son reçu, en échantillons : l'instant de la note. */
  debutAudio?: number;
  /** La position du pincement β, de 0 à ½ ; 0 retire le peigne. */
  position: number;
  /** La direction du pincement p, de 0 à moins de 1. */
  direction: number;
  /** La bande L du filtre de nuance, en hertz. */
  bande: number;
  sampleRate: number;
  aleatoire: () => number;
}

/** La fréquence de référence de la nuance : la moyenne géométrique de 20 Hz et de la moitié de `sr`. */
export const referenceDeNuance = (sr: number) => Math.sqrt(20 * (sr / 2));

/** Le gain de `(1 − r) / (1 − r·z⁻¹)` à la fréquence `f`. */
export const gainUnPole = (r: number, f: number, sr: number) =>
  (1 - r) / Math.hypot(1 - r * Math.cos((2 * Math.PI * f) / sr), r * Math.sin((2 * Math.PI * f) / sr));

/**
 * Le pôle du filtre de nuance d'une note de fréquence `frequence`, pour une nuance de `bande` hertz.
 *
 * C'EST LA CONSTRUCTION DE JAFFE ET SMITH (1983, « Dynamics », équation 23 et la suite). Un pôle
 * fixe, e^(−πL/fs), ferait sonner le grave plus fort que l'aigu à nuance égale. Le passe-bas de bande
 * L donne d'abord un gain G_L à la fréquence de référence ; puis le pôle de chaque note est choisi
 * pour que son filtre ait ce même gain G_L à sa fondamentale. À nuance égale, le fondamental a donc
 * la même amplitude à toutes les hauteurs. La racine retenue est celle de module inférieur à 1.
 */
export function poleDeNuance(bande: number, frequence: number, sr: number): number {
  const rL = Math.exp((-Math.PI * Math.min(Math.max(bande, 1), sr / 2)) / sr);
  const g = gainUnPole(rL, referenceDeNuance(sr), sr), g2 = g * g;
  if (g2 >= 1 - 1e-12) return 0;
  const demi = (Math.PI * frequence) / sr;
  const base = (1 - g2 * Math.cos(2 * demi)) / (1 - g2);
  const ecart = (2 * g * Math.sin(demi) * Math.sqrt(Math.max(0, 1 - g2 * Math.cos(demi) ** 2))) / (1 - g2);
  return Math.abs(base - ecart) < 1 ? base - ecart : base + ecart;
}

/** Le décalage du peigne de position, en échantillons ; 0 quand il n'y a pas de peigne. */
export const decalageDePosition = (position: number, periode: number) =>
  position > 0 ? Math.max(1, Math.floor(position * periode + 0.5)) : 0;

/** Combien d'échantillons il faut à un pôle `c` pour tomber sous un millionième. */
const queue = (c: number) => (c > 0 ? Math.ceil(Math.log(1e-6) / Math.log(c)) : 0);

/** Le signal brut, avant les trois filtres. */
function source(o: OptionsExcitation): Float32Array {
  const n = Math.max(1, Math.round(o.longueur * o.periode));
  switch (o.genre) {
    case "impulsion": return Float32Array.of(1);
    case "rose": return bruitRose(n, o.aleatoire);
    case "audio": {
      const x = new Float32Array(n), a = o.audio, d = Math.max(0, o.debutAudio ?? 0);
      if (a) for (let i = 0; i < n && d + i < a.length; i++) x[i] = a[d + i];
      return x;
    }
    default: {
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = o.aleatoire() * 2 - 1;
      return x;
    }
  }
}

/** Passe `x` dans `(1 − c) / (1 − c·z⁻¹)`, en place. */
function unPole(x: Float32Array, c: number): void {
  if (c <= 0) return;
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y = (1 - c) * x[i] + c * y;
    x[i] = y;
  }
}

/** L'excitation de la corde : sa source, puis la direction, la nuance et la position du pincement. */
export function excitationDeCorde(o: OptionsExcitation): Float32Array {
  const brut = source(o);
  const p = Math.min(0.999, Math.max(0, o.direction));
  const r = poleDeNuance(o.bande, o.sampleRate / o.periode, o.sampleRate);
  const m = decalageDePosition(Math.min(0.5, Math.max(0, o.position)), o.periode);
  const x = new Float32Array(brut.length + Math.max(queue(p), queue(r)) + m);
  x.set(brut);
  unPole(x, p);
  unPole(x, r);
  for (let i = x.length - 1; m > 0 && i >= m; i--) x[i] -= x[i - m];
  return x;
}
