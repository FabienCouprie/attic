// audio/passe-tout.ts — Le passe-tout du premier ordre qui accorde une boucle, écrit une seule fois.
//
// UNE BOUCLE À RETARD SONNE À LA FRÉQUENCE DONT LA PÉRIODE EST SA LONGUEUR, et une période se compte
// rarement en échantillons entiers. La ligne à retard prend l'entier ; ce passe-tout, de fonction de
// transfert H(z) = (η + z⁻¹) / (1 + η·z⁻¹), prend la fraction. Son gain vaut un à toute fréquence :
// il accorde la boucle sans rien retrancher à son amplitude, là où une interpolation linéaire est un
// léger passe-bas, que la boucle traverse à chaque période.
//
// LE COEFFICIENT EST EXACT À LA FRÉQUENCE DE LA NOTE. La phase de H à la pulsation ω vaut
// −ω + 2·atan(η·sin ω / (1 + η·cos ω)) ; demander un retard de phase de d échantillons à ω donne
// η = sin((1 − d)·ω/2) / sin((1 + d)·ω/2). Quand ω tend vers zéro, η tend vers (1 − d)/(1 + d),
// l'approximation de Thiran, exacte pour le seul continu : elle ajoute un retard qui croît comme ω²,
// et une boucle aiguë sonne trop bas. Jaffe et Smith, « Extensions of the Karplus-Strong Plucked-
// String Algorithm », Computer Music Journal 7(2), 1983.
//
// DEUX MODULES EN TENAIENT CHACUN SA COPIE (2026-11-27) : la corde pincée, exacte, par une
// dichotomie de soixante pas, et le banc de peignes, approché par Thiran. Les deux appellent
// désormais celle-ci.

/** Le plus grand coefficient admis, pour que le pôle −η reste dans le cercle unité. */
const BORNE = 0.999;

/**
 * Le coefficient η du passe-tout dont le retard de phase vaut `fraction` échantillons à la
 * pulsation `w`, en radians par échantillon.
 *
 * LA FRACTION SE PREND ENTRE UN DIXIÈME ET UN ÉCHANTILLON UN DIXIÈME, où le retard du passe-tout
 * varie le moins avec la fréquence ; c'est à l'appelant de partager la période ainsi.
 */
export function coefficientPasseTout(fraction: number, w: number): number {
  const eta = w > 1e-9
    ? Math.sin(((1 - fraction) * w) / 2) / Math.sin(((1 + fraction) * w) / 2)
    : (1 - fraction) / (1 + fraction);
  return Math.max(-BORNE, Math.min(BORNE, eta));
}

/** Le retard de phase du passe-tout de coefficient `eta` à la pulsation `w`, en échantillons. */
export const retardDuPasseTout = (eta: number, w: number): number =>
  -(Math.atan2(-Math.sin(w), eta + Math.cos(w)) - Math.atan2(-eta * Math.sin(w), 1 + eta * Math.cos(w))) / w;

/**
 * Un pas du passe-tout : y[n] = η·x[n] + x[n−1] − η·y[n−1].
 *
 * L'ENTRÉE PRÉCÉDENTE EST DONNÉE PAR L'APPELANT, et non gardée ici : une boucle dont la longueur
 * varie, celle d'un accord qui glisse, la relit dans sa ligne à retard plutôt que de garder celle
 * du pas d'avant.
 */
export const pasPasseTout = (eta: number, x: number, xAvant: number, yAvant: number): number =>
  eta * x + xAvant - eta * yAvant;
