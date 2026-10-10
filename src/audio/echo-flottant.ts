// audio/echo-flottant.ts — L'écho flottant, et l'effet Haas.
//
// D'OÙ VIENNENT CES DEUX EFFETS. Jean-François Augoyard et Henry Torgue, « À l'écoute de
// l'environnement : répertoire des effets sonores », Parenthèses, 1995, traduit sous le titre
// « Sonic Experience: A Guide to Everyday Sounds », McGill-Queen's University Press, 2005. Les deux
// y sont des effets élémentaires de propagation, et ils tiennent au même phénomène, la réflexion,
// pris à deux échelles de temps.
//
// L'ÉCHO FLOTTANT EST UNE ONDE STATIONNAIRE ENTRE DEUX MURS. Un son émis entre deux surfaces
// parallèles et réfléchissantes fait l'aller-retour en 2d/c secondes, puis recommence. Les
// fréquences dont la demi-longueur d'onde divise la distance se renforcent à chaque tour, les
// autres s'annulent : il reste un peigne dont les dents sont espacées de c/2d, et qu'on entend
// comme un timbre métallique accroché au claquement. Dans un couloir de trois mètres, l'aller-retour
// dure 17,5 millisecondes et le peigne sonne à 57 hertz.
//
// CE N'EST PAS UNE RÉVERBÉRATION, et c'est ce qui dicte la forme du calcul. Une réverbération
// DIFFUSE : ses échos se multiplient et se brouillent jusqu'à ne plus se compter. Ici ils restent
// discrets et périodiques, toujours au même intervalle, et c'est cette périodicité qui fait le
// timbre. Le calcul est donc un peigne récursif et rien d'autre, sans la chaîne de passe-tout qui
// ferait la diffusion.
//
// L'EFFET HAAS EST LE MÊME RETARD, PRIS AVANT QU'IL SE RÉPÈTE. Helmut Haas, « Über den Einfluss
// eines Einfachechos auf die Hörsamkeit von Sprache », Acustica 1, 1951, p. 49-58 : entre une et
// trente millisecondes, l'oreille ne sépare pas l'onde directe de la réfléchie ; elle les fond en
// un seul son, qu'elle localise du côté arrivé LE PREMIER, même si le retardé est plus fort. Au-delà
// d'une quarantaine de millisecondes la fusion se défait et l'on entend deux sons.

import { valeurA } from "./courbe";

/** La célérité du son dans l'air à vingt degrés, en mètres par seconde. */
export const CELERITE = 343;

/** L'intervalle de l'aller-retour entre deux murs distants de `d` mètres, en secondes. */
export const periodeEntreMurs = (d: number): number => (2 * Math.max(0.05, d)) / CELERITE;

/** La fréquence de la première dent du peigne, en hertz : l'inverse de cet intervalle. */
export const frequenceDuPeigne = (d: number): number => 1 / periodeEntreMurs(d);

export interface OptionsFlottant {
  /** La distance entre les deux murs, en mètres. */
  distance: number;
  /** Le temps que met le battement à perdre soixante décibels, en secondes. */
  decroissance: number;
  /** La part des aigus que les murs absorbent à chaque tour, de 0 à 1. */
  amortissement: number;
  /**
   * La part de l'effet dans la sortie, de 0 à 1. Un tableau la fait varier échantillon par
   * échantillon.
   *
   * LE MÉLANGE EST HORS DE LA BOUCLE, et c'est ce qui le rend modulable exactement : la ligne à
   * retard reçoit le son d'entrée seul, de sorte que faire varier la part n'altère pas le
   * battement qui se construit, seulement ce qu'on en entend.
   */
  melange: number | Float32Array;
}

/**
 * L'écho flottant appliqué à un son.
 *
 * LE GAIN DE BOUCLE SE DÉDUIT DE LA DÉCROISSANCE, et non l'inverse : un réglage qui demanderait
 * directement le gain rendrait une durée différente à chaque distance, le nombre de tours par
 * seconde changeant avec elle. Soixante décibels en `decroissance` secondes, c'est un gain de
 * dix puissance moins trois fois la période sur la décroissance, à chaque tour.
 *
 * L'AMORTISSEMENT EST DANS LA BOUCLE, ET NON EN SORTIE. Deux murs absorbent les aigus un peu plus à
 * chaque réflexion : le battement s'assourdit en s'éteignant, ce qu'un filtre posé après la boucle
 * ne rendrait pas, puisqu'il traiterait tous les tours de la même façon.
 */
export function echoFlottant(buffer: AudioBuffer, o: OptionsFlottant): AudioBuffer {
  const sr = buffer.sampleRate;
  const periode = periodeEntreMurs(o.distance);
  const retard = Math.max(1, Math.round(periode * sr));
  const decroissance = Math.max(0.05, o.decroissance);
  const gain = Math.pow(10, (-3 * periode) / decroissance);
  const a = Math.max(0, Math.min(0.99, o.amortissement));
  // `valeurA` rend un scalaire tel quel : un seul chemin de calcul, modulé ou non.
  const partA = (i: number) => Math.max(0, Math.min(1, valeurA(o.melange, i)));

  const sortie = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = sortie.getChannelData(c);
    const ligne = new Float32Array(retard);
    let ou = 0;
    let bas = 0;
    for (let i = 0; i < src.length; i++) {
      const revenu = ligne[ou];
      // Le passe-bas d'ordre un tient l'assourdissement d'un tour à l'autre.
      bas = a * bas + (1 - a) * revenu;
      const dansLaBoucle = src[i] + bas * gain;
      ligne[ou] = dansLaBoucle;
      ou = ou + 1 >= retard ? 0 : ou + 1;
      const part = partA(i);
      dst[i] = src[i] * (1 - part) + revenu * part;
    }
  }
  return sortie;
}

export interface OptionsHaas {
  /** Le retard appliqué à l'un des deux canaux, en secondes. */
  retard: number;
  /** Vrai pour retarder le canal droit, faux pour le gauche. */
  retarderLaDroite: boolean;
  /** Le gain du canal retardé, en linéaire. */
  gainDuRetarde: number;
}

/** Au-delà de ce retard, l'oreille cesse de fondre les deux arrivées et entend un écho. */
export const FUSION_MAX = 0.04;

/**
 * L'effet Haas : un canal retardé de quelques millisecondes.
 *
 * LA SOURCE EST RAMENÉE AU MONO D'ABORD, et ce n'est pas une facilité. L'effet tient à ce que les
 * deux oreilles reçoivent LE MÊME son à deux instants : partir d'une stéréo déjà décorrélée
 * mélangerait deux phénomènes, et l'on ne saurait plus ce qu'on entend. Une prise stéréo entre donc
 * comme la somme de ses canaux.
 */
export function haas(buffer: AudioBuffer, o: OptionsHaas): AudioBuffer {
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const retard = Math.max(0, Math.round(Math.max(0, o.retard) * sr));
  const gain = Math.max(0, o.gainDuRetarde);

  const mono = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += src[i] / buffer.numberOfChannels;
  }

  const sortie = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
  const tot = sortie.getChannelData(o.retarderLaDroite ? 0 : 1);
  const tard = sortie.getChannelData(o.retarderLaDroite ? 1 : 0);
  tot.set(mono);
  for (let i = retard; i < n; i++) tard[i] = mono[i - retard] * gain;
  return sortie;
}
