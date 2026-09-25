// audio/spirale-quintes.ts — Le cycle des quintes n'est pas un cercle.
//
// LA PROPRIÉTÉ. Empiler des quintes justes, de rapport 3/2, ne ramène jamais à la note de départ.
// Douze quintes valent (3/2)^12 = 129,746…, sept octaves valent 2^7 = 128 : l'écart est le comma
// pythagoricien, 531441/524288, soit 23,460 cents. Aucune puissance de 3/2 n'est une puissance de
// 2, puisque 2 et 3 sont premiers entre eux, et le chemin ne se referme donc à aucun tour. Ce que
// l'on appelle le cercle des quintes est une spirale, que le tempérament égal referme de force en
// rognant chaque quinte de 1,955 cent.
//
// L'ÉCART EST LINÉAIRE. Une quinte juste vaut 701,955 cents, une quinte tempérée 700 : l'écart au
// tempérament égal croît de 1,955 cent par pas, exactement. Au douzième il vaut 23,46, au
// cinquante-troisième 3,6 modulo l'octave, ce qui est la raison d'être du tempérament à 53 degrés,
// où la spirale frôle sa fermeture.
//
// CE MODULE NE PRODUIT PAS DE SON. Il rend des classes de hauteur en cents et l'écart cumulé ; le
// rendu appartient au composant.

/** Le rapport de la quinte juste, et sa valeur en cents. */
export const QUINTE_JUSTE = 3 / 2;
export const CENTS_QUINTE_JUSTE = 1200 * Math.log2(QUINTE_JUSTE);
/** La quinte du tempérament égal : sept demi-tons exactement. */
export const CENTS_QUINTE_TEMPEREE = 700;
/** Le comma pythagoricien, écart de douze quintes justes à sept octaves. */
export const COMMA_PYTHAGORICIEN = 12 * CENTS_QUINTE_JUSTE - 7 * 1200;

export interface PasSpirale {
  /** Le rang du pas, zéro pour la tonique. */
  rang: number;
  /** La hauteur atteinte, en cents au-dessus de la tonique, sans repliement. */
  centsAbsolus: number;
  /** La même hauteur repliée dans une octave, de 0 inclus à 1200 exclu. */
  centsReplies: number;
  /** Le degré du tempérament égal le plus proche, de 0 à 11. */
  degreEgal: number;
  /** L'écart au degré égal le plus proche, en cents. Négatif si la spirale est en dessous. */
  ecartCents: number;
}

/**
 * Les pas de la spirale, de la tonique au rang demandé.
 *
 * `centsQuinte` permet de parcourir la spirale avec une autre quinte que la juste : à 700 cents
 * elle se referme au douzième pas et devient un cercle, ce qui est le cas particulier du
 * tempérament égal et non la règle.
 *
 * `sens` vaut 1 pour monter de quinte en quinte, -1 pour descendre, c'est-à-dire monter de quarte.
 */
export function pasDeSpirale(
  nombre: number, centsQuinte = CENTS_QUINTE_JUSTE, sens: 1 | -1 = 1,
): PasSpirale[] {
  const out: PasSpirale[] = [];
  for (let k = 0; k <= Math.max(0, Math.floor(nombre)); k++) {
    const centsAbsolus = sens * k * centsQuinte;
    const centsReplies = ((centsAbsolus % 1200) + 1200) % 1200;
    const degreEgal = Math.round(centsReplies / 100) % 12;
    let ecartCents = centsReplies - degreEgal * 100;
    // Un repli qui tombe juste sous l'octave se compare au do d'au-dessus, non au si.
    if (ecartCents > 600) ecartCents -= 1200;
    if (ecartCents < -600) ecartCents += 1200;
    out.push({ rang: k, centsAbsolus, centsReplies, degreEgal, ecartCents });
  }
  return out;
}

/**
 * De combien la spirale manque sa fermeture après `nombre` quintes.
 *
 * La fermeture serait atteinte si la hauteur cumulée tombait sur un nombre entier d'octaves.
 * Le manque est donc l'écart à l'octave la plus proche, en cents, signé.
 */
export function manqueFermeture(nombre: number, centsQuinte = CENTS_QUINTE_JUSTE): number {
  const total = nombre * centsQuinte;
  const octaves = Math.round(total / 1200);
  return total - octaves * 1200;
}

/**
 * Les rangs où la spirale frôle sa fermeture, jusqu'au rang demandé.
 *
 * Un rang est retenu quand il manque sa fermeture de moins que tous les rangs qui le précèdent :
 * ce sont les meilleures approximations successives, 12 puis 41 puis 53 pour la quinte juste.
 */
export function rangsQuiFrolent(
  nombreMax: number, centsQuinte = CENTS_QUINTE_JUSTE,
): { rang: number; manqueCents: number }[] {
  const out: { rang: number; manqueCents: number }[] = [];
  let record = Infinity;
  for (let k = 1; k <= Math.max(1, Math.floor(nombreMax)); k++) {
    const m = Math.abs(manqueFermeture(k, centsQuinte));
    if (m < record - 1e-9) {
      record = m;
      out.push({ rang: k, manqueCents: manqueFermeture(k, centsQuinte) });
    }
  }
  return out;
}

/** Le nom de la classe de hauteur d'un degré du tempérament égal, la tonique valant 0. */
export const NOMS_DEGRES = ["do", "do#", "ré", "ré#", "mi", "fa", "fa#", "sol", "sol#", "la", "la#", "si"];
export const NOMS_DEGRES_EN = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * La fréquence d'un pas, replié dans l'octave qui commence à `fondamentale`.
 *
 * Le repliement est ce qui rend la spirale audible sur un clavier : sans lui, cinquante-trois
 * quintes couvriraient trente et une octaves, très au-delà de ce qui s'entend.
 */
export function frequenceDuPas(pas: PasSpirale, fondamentale: number): number {
  return fondamentale * Math.pow(2, pas.centsReplies / 1200);
}
