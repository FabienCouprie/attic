// audio/gammes-reunies.ts — Les deux tables de gammes, offertes ensemble.
//
// POURQUOI CE MODULE EXISTE. `gammes.ts` compte en demi-tons et ne porte que ce que le tempérament
// égal sait écrire ; `gammes-monde.ts` compte en cents et porte les maqamat, les ragas et les
// gammes de gamelan. Un composant qui offre un choix de gamme veut souvent les deux, et il n'a pas
// à savoir de laquelle une gamme vient.
//
// CENT CENTS FONT UN DEMI-TON, ET C'EST TOUT CE QU'IL Y A À SAVOIR. Les deux se ramènent au même
// nombre à virgule, et le reste du dépôt porte déjà des hauteurs à virgule : la valeur d'un sommet
// de cercle l'est, une note de séquence aussi. Rien n'a eu besoin d'être élargi pour que les
// quarts de ton passent.
//
// CE MODULE VIVAIT DANS `cercle-gamme.ts`, ET EN EST SORTI QUAND UN SECOND CONSOMMATEUR EST ARRIVÉ.
// Le glissando de gamme veut les mêmes trente-cinq gammes et n'a rien d'un cercle : laisser la
// réunion sous un nom de cercle aurait fait croire à une dépendance qui n'existe pas.

import { GAMMES } from "./gammes";
import { GAMMES as GAMMES_MONDE, gammeParId as gammeMondeDe } from "./gammes-monde";
import { gammeDe } from "./gammes";

/** Les noms d'une gamme, d'où qu'elle vienne. */
export interface NomDeGamme {
  id: string;
  fr: string;
  en: string;
  /** Vraie quand la gamme tient dans les douze demi-tons, donc se joue sur un clavier. */
  temperee: boolean;
}

/**
 * Les gammes offertes : celles qui tiennent dans les douze demi-tons, puis celles qui n'y tiennent
 * pas.
 *
 * L'ORDRE NE SE RÉARRANGE PAS. La valeur d'un choix enregistrée dans un projet se résout par le
 * RANG du libellé, et réordonner cette liste ferait donc qu'un graphe rouvert désignerait une autre
 * gamme, en silence. Les gammes ajoutées plus tard viennent APRÈS, chacune dans sa moitié.
 */
export const GAMMES_REUNIES: readonly NomDeGamme[] = [
  ...GAMMES.map((g) => ({ id: g.id, fr: g.fr, en: g.en, temperee: true })),
  ...GAMMES_MONDE.map((g) => ({ id: g.id, fr: g.nom, en: g.nomEn, temperee: false })),
];

/** Les degrés d'une gamme en demi-tons à virgule, qu'elle soit comptée en demi-tons ou en cents. */
export function degresEnDemiTons(id: string): number[] | undefined {
  const temperee = gammeDe(id);
  if (temperee) return [...temperee.degres];
  const monde = gammeMondeDe(id);
  return monde ? monde.cents.map((c) => c / 100) : undefined;
}

/** Vrai quand la gamme est déclarée en demi-tons, donc jouable sur un clavier. */
export const estTemperee = (id: string): boolean => gammeDe(id) !== undefined;

/**
 * Les degrés d'une octave, l'octave de fermeture gardée ou non.
 *
 * LES GAMMES MESURÉES EN CENTS PORTENT LEUR OCTAVE COMME UN DEGRÉ, les tempérées non : la première
 * s'arrête à onze demi-tons, la seconde écrit 1200 cents. Les comparer degré par degré, ou les
 * poser sur un cercle qui revient tout seul à sa place zéro, demande donc de pouvoir la jeter.
 *
 * LA RÈGLE EST SANS TOLÉRANCE INVENTÉE : un degré est jeté dès qu'il atteint l'octave. La table des
 * gammes tempérées ne l'atteint jamais, et rien n'y change donc.
 *
 * GARDÉE, ELLE PORTE L'OCTAVE ÉTIRÉE DU GAMELAN, qui vaut 1206 ou 1208 cents et non 1200. La jeter
 * sans le dire effacerait ce que ces gammes ont de plus notable.
 */
export function degresDUneOctave(id: string, octaveDeFermeture: boolean): number[] | undefined {
  const degres = degresEnDemiTons(id);
  if (!degres || degres.length === 0) return degres;
  if (octaveDeFermeture) return degres;
  const dernier = degres[degres.length - 1];
  return dernier >= 12 ? degres.slice(0, -1) : degres;
}
