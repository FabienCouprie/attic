// audio/interpolation.ts — Lire un échantillon entre deux échantillons.
//
// ═══ POURQUOI CE MODULE, ET C'EST LA QUALITÉ MÊME D'UN SAMPLER ═══
//
// Relevé dans le point 5 d'une revue critique du dépôt : « j'ai trouvé au moins sept
// rééchantillonneurs audio privés, dont un linéaire ». En les comptant, j'en ai trouvé NEUF
// implémentations distinctes, et non sept — et CINQ OU SIX sont de l'interpolation linéaire, non une.
// La revue avait sous-compté le plus grave.
//
// DEUX DE CES LINÉAIRES SONT DANS LE CHEMIN DE LECTURE D'UN ÉCHANTILLON, c'est-à-dire là où une
// note se transpose : `generation-echantillon.ts` et `midi-soundfont.ts`. C'est la qualité même d'un
// sampler, et c'est ce qui s'entend. Les autres servent à préparer l'entrée d'un modèle ou à aligner
// deux signaux : leur erreur se paie en mesure, pas à l'oreille.
//
// ═══ CE QUE L'INTERPOLATION FAIT, ET CE QU'ELLE NE PEUT PAS FAIRE ═══
//
// LA DIRECTION DE LA TRANSPOSITION DÉCIDE DU DÉFAUT, et il faut le dire parce qu'on ne corrige ici
// qu'un des deux :
//
//   · VERS LE GRAVE, on lit la source PLUS LENTEMENT : chaque échantillon de sortie tombe entre deux
//     échantillons de source, et c'est l'erreur de l'interpolateur qui domine. Un cubique y gagne
//     franchement sur un linéaire, et c'est ce que ce module apporte.
//   · VERS L'AIGU, on lit la source PLUS VITE : on décime, et ce qui se replie au-dessus de Nyquist
//     se replie quoi qu'on interpole. Il faudrait un filtre AVANT la décimation, ce qui est un autre
//     chantier. Un cubique y gagne peu, et l'annoncer autrement serait mentir.
//
// LA FORMULE EST CELLE QUE `commun.ts` EMPLOYAIT DÉJÀ, extraite plutôt que recopiée : Catmull-Rom à
// quatre points. Le dépôt avait donc le bon interpolateur, et deux chemins de lecture s'en passaient.

/**
 * Un échantillon lu entre deux échantillons, par Catmull-Rom à quatre points.
 *
 * `lire` DONNE L'ACCÈS, ET C'EST TOUT L'INTÉRÊT. Un sampler ne lit pas un tableau nu : il peut
 * boucler sur une portion, s'arrêter à un bord, lire des entiers signés. Passer un accesseur permet
 * au même noyau de servir ces trois cas, là où une fonction qui prendrait le tableau aurait obligé
 * chaque appelant à réécrire le sien — ce que deux d'entre eux faisaient, en linéaire.
 *
 * `position` est en échantillons de source, partie fractionnaire comprise.
 */
export function echantillonCubique(lire: (i: number) => number, position: number): number {
  const i = Math.floor(position);
  const t = position - i;
  const p0 = lire(i - 1);
  const p1 = lire(i);
  const p2 = lire(i + 1);
  const p3 = lire(i + 2);
  const t2 = t * t;
  const t3 = t2 * t;
  return p1
    + 0.5 * (p2 - p0) * t
    + (p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3) * t2
    + (-0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3) * t3;
}

/**
 * Le même, en linéaire. Il n'est gardé que pour que les cas puissent COMPARER les deux.
 *
 * Il n'a aucun appelant dans l'application, et c'est voulu : s'il en avait un, ce serait un chemin
 * de lecture qu'on aurait oublié de reprendre.
 */
export function echantillonLineaire(lire: (i: number) => number, position: number): number {
  const i = Math.floor(position);
  const t = position - i;
  return lire(i) * (1 - t) + lire(i + 1) * t;
}
