// audio/spirale-spatiale.ts — Le son tourne, et s'éloigne d'autant.
//
// LA PROPRIÉTÉ. Une spirale logarithmique lie l'angle et le rayon : avancer d'un tour multiplie le
// rayon par un facteur fixe. Portée dans l'espace, elle donne un son dont l'azimut se referme à
// chaque tour et dont la distance ne se referme jamais. C'est le seul membre de la famille dont le
// chemin ne revient pas : un tour ramène la direction, jamais la place.
//
// CE QUE LA DISTANCE FAIT AU SON, et ce sont deux effets distincts qu'il faut tenir séparés.
//
//   Le NIVEAU suit la loi du carré inverse : doubler la distance coûte six décibels. C'est une
//   géométrie, elle ne dépend ni de l'air ni de la salle.
//
//   L'AIR absorbe l'aigu et lui seul, d'autant plus que la distance est grande. Sans cela, un son
//   dix fois plus loin ne serait qu'un son plus faible, et l'oreille entend la différence : c'est
//   la part du timbre qui dit la distance quand le niveau ment, par exemple sur un son qu'on a
//   monté au mixage. L'air, lui, compte en MÈTRES et non en rapport : il retire ce que la norme
//   ISO 9613-1 dit sur les mètres qui séparent le son du point le plus proche du parcours
//   (`audio/air.ts`). Au même rapport, partir de plus loin parcourt plus de mètres et ferme
//   davantage l'aigu.
//
// LE POINT LE PLUS PROCHE EST LA RÉFÉRENCE, où la sortie vaut l'entrée : le départ quand le son
// s'éloigne, l'arrivée quand il se rapproche. Le niveau et l'air se comptent depuis lui, et la
// sortie ne dépasse donc jamais l'entrée ; la loi en cosinus a son unité sur le côté, où un canal
// seul vaut l'entrée.
//
// L'AZIMUT suit la loi en cosinus, qui garde le niveau perçu constant au passage par le centre :
// un panoramique linéaire y perdrait trois décibels, et l'on entendrait la rotation pomper.
//
// CE MODULE NE PRODUIT PAS DE SON. Il rend la trajectoire, instant par instant ; le rendu
// appartient au composant.

import { frequenceAMoinsTrois } from "./air";

export const NOMBRE_OR = (1 + Math.sqrt(5)) / 2;

/** Bornes du rapport de distance par tour. Un est exclu : la spirale y devient un cercle. */
export const RAPPORT_MIN = 1.05;
export const RAPPORT_MAX = 8;

export interface OptionsSpatiale {
  /** Nombre de tours parcourus sur toute la durée. */
  tours: number;
  /** Le facteur dont la distance est multipliée en un tour. */
  rapport: number;
  /** Vrai pour s'éloigner, faux pour se rapprocher. */
  eloigne: boolean;
  /** Distance de départ, en mètres. */
  distanceDebut: number;
  /** Absorption de l'air, de 0 pour aucune à 1 pour l'air réel de la norme. */
  absorption: number;
}

export interface PointSpirale {
  /** La part du parcours, de 0 à 1. */
  part: number;
  /** L'angle, en tours depuis le départ. */
  tour: number;
  /** La distance, en mètres. */
  distance: number;
  /** Le gain de la loi du carré inverse, un au point le plus proche du parcours. */
  gain: number;
  /** Le gain du canal gauche, loi en cosinus. */
  gaucheGain: number;
  /** Le gain du canal droit. */
  droiteGain: number;
}

const borner = (v: number, bas: number, haut: number) => Math.min(haut, Math.max(bas, v));

export function rapportValide(rapport: number): number {
  return borner(Number.isFinite(rapport) ? rapport : 2, RAPPORT_MIN, RAPPORT_MAX);
}

/**
 * La distance la plus proche de l'auditeur sur tout le parcours : le départ quand le son s'éloigne,
 * l'arrivée quand il se rapproche.
 *
 * C'EST LA RÉFÉRENCE, où la sortie vaut l'entrée, pour le niveau comme pour l'air (2026-11-15). Elle
 * était au départ : se rapprocher multipliait le niveau, huit fois en trois tours de rapport deux, et
 * la sortie saturait. Comptée depuis le plus près, elle ne dépasse jamais l'entrée.
 */
export function distanceLaPlusProche(o: OptionsSpatiale): number {
  const debut = Math.max(0.05, o.distanceDebut);
  return o.eloigne ? debut : debut * Math.pow(rapportValide(o.rapport), -Math.abs(o.tours));
}

/**
 * Le point de la trajectoire à une part donnée du parcours.
 *
 * L'azimut part du centre et tourne dans le sens direct ; la distance suit la spirale.
 */
export function pointSpirale(o: OptionsSpatiale, part: number): PointSpirale {
  const p = borner(part, 0, 1);
  const rapport = rapportValide(o.rapport);
  const tour = o.tours * p;
  const exposant = o.eloigne ? tour : -tour;
  const distance = Math.max(0.05, o.distanceDebut) * Math.pow(rapport, exposant);

  const gain = distanceLaPlusProche(o) / distance;

  const angle = 2 * Math.PI * tour;
  // Loi en cosinus : le couple (gauche, droite) garde une somme de carrés constante.
  const pan = Math.sin(angle);                     // de -1 (gauche) à 1 (droite)
  const theta = ((pan + 1) / 2) * (Math.PI / 2);
  const gaucheGain = Math.cos(theta);
  const droiteGain = Math.sin(theta);

  return { part: p, tour, distance, gain, gaucheGain, droiteGain };
}

/**
 * Les mètres d'air que le son traverse en plus de ceux du point le plus proche, dosés par
 * l'absorption.
 *
 * Le plus proche est la référence, où la sortie vaut l'entrée. En s'éloignant, les mètres croissent
 * depuis le départ ; en se rapprochant, ils décroissent jusqu'à l'arrivée, et le son part sourd pour
 * arriver avec le timbre de l'entrée.
 */
export function airTraverse(o: OptionsSpatiale, part: number): number {
  return Math.max(0, pointSpirale(o, part).distance - distanceLaPlusProche(o)) * borner(o.absorption, 0, 1);
}

/** La fréquence où l'air traversé retire trois décibels à une part du parcours, en hertz. */
export function coupureAir(o: OptionsSpatiale, part: number): number {
  return frequenceAMoinsTrois(airTraverse(o, part));
}

/**
 * L'écart entre l'azimut du départ et celui d'un tour plus tard, en tours.
 *
 * C'EST LA MOITIÉ DE LA PROPRIÉTÉ : l'angle se referme exactement à chaque tour. L'autre moitié
 * est que la distance, elle, a été multipliée, ce que `rapportDistanceParTour` rend.
 */
export function ecartAzimutParTour(o: OptionsSpatiale): number {
  if (o.tours === 0) return 0;
  const a = pointSpirale(o, 0);
  const b = pointSpirale(o, 1 / Math.abs(o.tours));
  return Math.abs((b.tour - a.tour) % 1);
}

/** Le facteur dont la distance est multipliée en un tour, mesuré sur la trajectoire rendue. */
export function rapportDistanceParTour(o: OptionsSpatiale): number {
  if (o.tours === 0) return 1;
  const a = pointSpirale(o, 0);
  const b = pointSpirale(o, 1 / Math.abs(o.tours));
  return b.distance / a.distance;
}
