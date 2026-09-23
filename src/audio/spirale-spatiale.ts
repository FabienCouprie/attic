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
//   monté au mixage.
//
// L'AZIMUT suit la loi en cosinus, qui garde le niveau perçu constant au passage par le centre :
// un panoramique linéaire y perdrait trois décibels, et l'on entendrait la rotation pomper.
//
// CE MODULE NE PRODUIT PAS DE SON. Il rend la trajectoire, instant par instant ; le rendu
// appartient au composant.

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
  /** Absorption de l'air, de 0 pour aucune à 1 pour marquée. */
  absorption: number;
}

export interface PointSpirale {
  /** La part du parcours, de 0 à 1. */
  part: number;
  /** L'angle, en tours depuis le départ. */
  tour: number;
  /** La distance, en mètres. */
  distance: number;
  /** Le gain de la loi du carré inverse, un à la distance de départ. */
  gain: number;
  /** Le gain du canal gauche, loi en cosinus. */
  gaucheGain: number;
  /** Le gain du canal droit. */
  droiteGain: number;
  /** La fréquence de coupure de l'absorption de l'air, en hertz. */
  coupureHz: number;
}

const borner = (v: number, bas: number, haut: number) => Math.min(haut, Math.max(bas, v));

export function rapportValide(rapport: number): number {
  return borner(Number.isFinite(rapport) ? rapport : 2, RAPPORT_MIN, RAPPORT_MAX);
}

/**
 * Le point de la trajectoire à une part donnée du parcours.
 *
 * L'azimut part du centre et tourne dans le sens direct ; la distance suit la spirale. La coupure
 * de l'air descend géométriquement avec la distance, de vingt kilohertz au plus près à la fraction
 * réglée au plus loin : c'est une approximation, l'absorption réelle dépendant de l'humidité et de
 * la température, et son seul office est de rendre l'éloignement audible autrement que par le
 * niveau.
 */
export function pointSpirale(o: OptionsSpatiale, part: number): PointSpirale {
  const p = borner(part, 0, 1);
  const rapport = rapportValide(o.rapport);
  const tour = o.tours * p;
  const exposant = o.eloigne ? tour : -tour;
  const distance = Math.max(0.05, o.distanceDebut) * Math.pow(rapport, exposant);

  const gain = Math.max(0.05, o.distanceDebut) / distance;

  const angle = 2 * Math.PI * tour;
  // Loi en cosinus : le couple (gauche, droite) garde une somme de carrés constante.
  const pan = Math.sin(angle);                     // de -1 (gauche) à 1 (droite)
  const theta = ((pan + 1) / 2) * (Math.PI / 2);
  const gaucheGain = Math.cos(theta);
  const droiteGain = Math.sin(theta);

  // L'air : la coupure descend d'autant de décades que la distance monte, pondérée par le réglage.
  const octaves = Math.log2(distance / Math.max(0.05, o.distanceDebut));
  const coupureHz = borner(20000 * Math.pow(2, -octaves * 1.5 * borner(o.absorption, 0, 1)), 200, 20000);

  return { part: p, tour, distance, gain, gaucheGain, droiteGain, coupureHz };
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
