// audio/lecture-sinc.ts — Lire un son à une position fractionnaire, par un sinus cardinal fenêtré tabulé.
//
// POURQUOI UNE TABLE. Le noyau de `audio/concret.ts` calcule un sinus et deux cosinus pour chacune de
// ses seize prises, à chaque échantillon lu, parce que sa coupure suit la vitesse d'un échantillon à
// l'autre. Quand la coupure est la même pour tout le son, le noyau se calcule une fois, sur 2 048
// phases, et la lecture n'est plus qu'une interpolation entre deux rangées de la table.
//
// LA COUPURE EST CELLE DE LA LECTURE LA PLUS RAPIDE. Lire une source plus vite qu'elle n'a été écrite
// pousse son aigu au-delà de Nyquist ; le noyau coupe donc à la moitié de la fréquence
// d'échantillonnage divisée par cette vitesse, et s'élargit d'autant. Sans accélération, la coupure
// vaut un, chaque rangée est ramenée à une somme de un, et une position entière rend l'échantillon
// tel quel : la rangée de phase nulle vaut un au centre et zéro partout ailleurs, écrit tel quel
// plutôt que calculé, `sin(π k)` ne valant pas tout à fait zéro en flottant.
//
// HORS DE LA SOURCE, une prise vaut zéro : un son lu avant son début ou après sa fin s'éteint au lieu
// de répéter son bord.

/** Demi-largeur du noyau, en passages par zéro : assez pour que le repliement reste sous −60 dB. */
const DEMI_LARGEUR = 8;
/** Nombre de phases tabulées entre deux échantillons. */
export const PHASES = 2048;

export interface TableSinc {
  /** Une rangée de `largeur` prises par phase, `PHASES + 1` rangées. */
  table: Float64Array;
  demi: number;
  largeur: number;
}

/** Le noyau tabulé pour une coupure donnée, entre zéro et un, en fraction de Nyquist. */
export function tableSinc(coupure: number): TableSinc {
  const demi = Math.ceil(DEMI_LARGEUR / coupure), largeur = 2 * demi;
  const table = new Float64Array((PHASES + 1) * largeur);
  for (let p = 0; p <= PHASES; p++) {
    const f = p / PHASES;
    let somme = 0;
    for (let j = 0; j < largeur; j++) {
      const x = f - (j - demi + 1);
      const ax = Math.abs(x);
      const exact = coupure === 1 && Number.isInteger(x);
      const sinc = ax < 1e-12 ? 1 : exact ? 0 : Math.sin(Math.PI * coupure * x) / (Math.PI * coupure * x);
      const w = ax >= demi ? 0 : sinc * (0.42 + 0.5 * Math.cos((Math.PI * x) / demi) + 0.08 * Math.cos((2 * Math.PI * x) / demi));
      table[p * largeur + j] = w;
      somme += w;
    }
    for (let j = 0; j < largeur; j++) table[p * largeur + j] /= somme;
  }
  return { table, demi, largeur };
}

/** La valeur de `x` à la position `t`, en échantillons. */
export function lireTabule(x: Float32Array, t: number, s: TableSinc): number {
  const i = Math.floor(t), phase = (t - i) * PHASES, p = Math.min(PHASES - 1, Math.floor(phase)), q = phase - p;
  const r0 = p * s.largeur, r1 = r0 + s.largeur, debut = i - s.demi + 1;
  let somme = 0;
  for (let j = 0; j < s.largeur; j++) {
    const idx = debut + j;
    if (idx >= 0 && idx < x.length) somme += x[idx] * (s.table[r0 + j] + q * (s.table[r1 + j] - s.table[r0 + j]));
  }
  return somme;
}
