// audio/triades-gamme.ts — L'accord bâti sur un degré de la gamme : un degré sur deux.
//
// LA RÈGLE QUI ÉTAIT LÀ AVANT, et ce qu'elle rendait. La tierce et la quinte d'un accord se
// cherchaient comme la note de la gamme la plus proche de quatre et de sept demi-tons au-dessus de la
// fondamentale (`degreAccordProche`). Deux défauts en sortaient, mesurés par le banc des gammes le
// 2026-11-21. À égale distance, la première note gagnait : la quarte battait la tierce mineure, et le
// v du mineur, du dorien et du mixolydien sortait en sus4, si bémol, mi bémol, fa en mi bémol. Et la
// tierce majeure exacte gagnait quand la gamme l'avait : le vii° du mineur harmonique sortait en ré,
// fa dièse, la bémol. Le Générateur musical, le Générateur d'accords, la Groove Box et le Séquenceur
// d'accords les jouaient sous huit à onze gammes.
//
// LA RÈGLE DE FABIEN, décidée le même jour : un accord se bâtit un degré sur deux DANS LA GAMME, la
// fondamentale, le troisième degré au-dessus d'elle et le cinquième, k, k+2 et k+4. Sur une gamme à
// sept degrés, c'est l'harmonisation par tierces : le I du locrien est diminué, le V du mineur
// harmonique majeur, le I de l'altérée diminué. Sur toute autre longueur, la même règle : une
// pentatonique majeure bâtit do, mi, la sur do, et la chromatique do, ré, mi. Aucune note ne sort de
// la gamme ; les accords ne sont plus forcément des triades classiques, et c'est voulu.
//
// LA SIXTE ET LA SEPTIÈME suivent la même règle, k+5 et k+6. Sur une gamme de moins de sept degrés,
// la septième passe l'octave : elle reste un degré de la gamme.

/**
 * L'écart, en demi-tons au-dessus de la fondamentale, du degré situé `pas` degrés plus haut dans la
 * gamme. `degres` sont les degrés triés depuis la tonique, `racinePc` la fondamentale comptée depuis
 * la tonique.
 *
 * UNE FONDAMENTALE QUI N'EST PAS UN DEGRÉ JETTE : chaque appelant la prend dans la gamme, et une autre
 * valeur dirait qu'il a perdu sa gamme en chemin.
 */
export function ecartDansLaGamme(degres: readonly number[], racinePc: number, pas: number): number {
  const n = degres.length;
  const pc = ((racinePc % 12) + 12) % 12;
  const k = degres.findIndex((d) => Math.abs(d - pc) < 1e-9);
  if (k < 0) throw new Error(`la fondamentale ${racinePc} n'est pas un degré de la gamme ${degres.join(", ")}`);
  const j = k + pas;
  return degres[j % n] + 12 * Math.floor(j / n) - degres[k];
}

/** La tierce d'un degré : deux degrés plus haut. */
export const tierceDuDegre = (degres: readonly number[], racinePc: number) => ecartDansLaGamme(degres, racinePc, 2);
/** La quinte d'un degré : quatre degrés plus haut. */
export const quinteDuDegre = (degres: readonly number[], racinePc: number) => ecartDansLaGamme(degres, racinePc, 4);
/** La sixte d'un degré : cinq degrés plus haut. */
export const sixteDuDegre = (degres: readonly number[], racinePc: number) => ecartDansLaGamme(degres, racinePc, 5);
/** La septième d'un degré : six degrés plus haut. */
export const septiemeDuDegre = (degres: readonly number[], racinePc: number) => ecartDansLaGamme(degres, racinePc, 6);
