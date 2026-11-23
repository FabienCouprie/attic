// audio/musicxml-temps.ts — Une durée écrite selon les temps de la mesure.
//
// L'écrivain MusicXML découpait une durée composée en prenant la plus grande valeur d'abord : c'était
// exact, mais aveugle aux temps. Une blanche pointée du deuxième temps cachait le troisième, et une
// noire posée sur la croche du deuxième temps cachait le milieu de la mesure. Décision de Fabien du
// 2026-11-22, « Follow the beats », revue des notations en texte.
//
// LA RÈGLE EST CELLE DE L'USAGE DE LA GRAVURE, telle qu'Elaine Gould l'expose dans « Behind Bars »
// (2011) :
//   - une mesure à quatre temps montre son milieu, sauf une valeur qui part du premier temps ;
//   - une valeur qui commence sur un temps peut en couvrir d'autres ;
//   - une valeur qui commence hors du temps ne passe pas le temps suivant ;
//   - deux syncopes sont admises : la blanche du deuxième temps entre deux noires, et la noire qui
//     part du milieu d'un temps, entre deux croches, dans une même demi-mesure.
// Une mesure composée, 6/8, 9/8, 12/8, compte ses temps en noires pointées.

/** Les valeurs qu'une note peut prendre, en doubles croches : de la ronde à la double croche, pointées comprises. */
const ECRITES = [16, 12, 8, 6, 4, 3, 2, 1];

/**
 * Les valeurs, en doubles croches, d'une durée qui commence à `position` doubles croches du début de
 * la mesure, liées l'une à l'autre. `sonne` est faux pour un silence, qui n'a pas de syncope.
 */
export function valeursSelonLesTemps(
  position: number, duree: number, metrique: readonly [number, number], sonne: boolean,
): number[] {
  const [num, den] = metrique;
  const unite = 16 / den;
  const compose = den >= 8 && num > 3 && num % 3 === 0;
  const temps = compose ? 3 * unite : unite;
  const mesure = num * unite;
  const milieu = mesure / temps === 4 ? mesure / 2 : null;
  const passe = (a: number, b: number, x: number) => a < x && x < b;
  const surUnTemps = (a: number) => a % temps === 0;

  function permise(a: number, longueur: number, restant: number): boolean {
    const b = a + longueur;
    const cacheLeMilieu = milieu !== null && passe(a, b, milieu);
    if (surUnTemps(a)) {
      if (!cacheLeMilieu || a === 0) return true;
      return sonne && !compose && a === temps && longueur === 2 * temps && longueur === restant;
    }
    const prochainTemps = Math.ceil(a / temps) * temps;
    if (b <= prochainTemps) return true;
    return sonne && !compose && !cacheLeMilieu && a % temps === temps / 2 && longueur === temps && longueur === restant;
  }

  const valeurs: number[] = [];
  let a = Math.round(position), reste = Math.round(duree);
  while (reste > 0) {
    const longueur = ECRITES.find((v) => v <= reste && permise(a, v, reste)) ?? 1;
    valeurs.push(longueur);
    a += longueur;
    reste -= longueur;
  }
  return valeurs;
}
