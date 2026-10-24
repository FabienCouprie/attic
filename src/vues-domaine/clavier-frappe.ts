// vues-domaine/clavier-frappe.ts — Le clavier de l'ordinateur : quelle note sous quel doigt.
//
// LE DÉFAUT QU'IL CORRIGE, MESURÉ DANS L'APPLICATION SUR UN CLAVIER FRANÇAIS.
//
// La table vivait en ligne dans `clavier-jouable.tsx` et associait des CARACTÈRES à des notes —
// `zxcvbnm` pour les blanches, `sdghj` pour les noires —, lus sur `e.key`. Or `e.key` rend le
// caractère que la DISPOSITION ACTIVE imprime sur la touche, non la touche elle-même. Relevé par
// `navigator.keyboard.getLayoutMap()` sur le poste : `KeyZ → « w »`, `KeyM → « , »`, `KeyA → « q »`.
//
// Les deux rangées jouables en devenaient donc ceci, mesuré touche par touche dans l'application :
//
//   rangée du bas      ·  D3  E3  F3  G3  A3  ·     le do et le si manquent
//   rangée du milieu   ·  C#3 D#3 ·  F#3 G#3 A#3  ·  ·  B3    le si est ici, chez les noires
//   rangée du haut     ·  C3  ·   ·  ·   ·        le do est ici, deux rangées trop haut
//
// Cinq blanches sur sept, le do deux rangées au-dessus des blanches et le si au milieu des noires :
// LA GÉOMÉTRIE DES DEUX RANGÉES — qui est tout ce qui fait qu'un clavier de frappe imite un piano —
// était défaite. Les cinq noires, elles, tombaient juste, les deux dispositions partageant leurs
// positions : le défaut ne se voyait donc pas comme une translation, mais comme un clavier troué.
//
// LA NOTE EST UNE POSITION, L'OCTAVE EST UN CARACTÈRE. Ce que la main cherche sous un doigt est un
// endroit, et c'est `e.code` qui le nomme — indépendamment de la disposition, puisqu'il dénomme les
// touches par leur place sur un clavier américain. Les raccourcis d'octave restent sur `e.key` :
// « + » et « − » sont des SIGNES, lus là où l'utilisateur les voit imprimés.

/**
 * Les sept blanches, dans l'ordre où la main les rencontre sur la rangée du bas.
 *
 * Nommées par position : sur un clavier français elles se lisent `w x c v b n ,`, sur un clavier
 * américain `z x c v b n m`. C'est la même rangée sous les mêmes doigts.
 */
export const POSITIONS_BLANCHES = ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM"] as const;

/**
 * Les cinq noires, sur la rangée du milieu, aux places qu'elles occupent sur un piano : deux, un
 * trou, trois. Le trou est `KeyF`, entre le ré dièse et le fa dièse, comme entre mi et fa.
 */
export const POSITIONS_NOIRES = ["KeyS", "KeyD", "KeyG", "KeyH", "KeyJ"] as const;

/** Les degrés d'une octave, blanches puis noires. */
const notesBlanches = [0, 2, 4, 5, 7, 9, 11], notesNoires = [1, 3, 6, 8, 10];

/** L'octave la plus basse et la plus haute où le clavier de frappe se déplace. */
export const OCTAVE_MIN = 2;
export const OCTAVE_MAX = 7;

/**
 * La table des douze touches d'une octave : position physique → note MIDI.
 *
 * Construite pour une octave, parce que c'est ce qui change quand on appuie sur une flèche.
 */
export function tableDeFrappe(octave: number): Map<string, number> {
  const m = new Map<string, number>();
  const base = octave * 12;
  POSITIONS_BLANCHES.forEach((code, i) => m.set(code, base + notesBlanches[i]));
  POSITIONS_NOIRES.forEach((code, i) => m.set(code, base + notesNoires[i]));
  return m;
}

/**
 * La note sous cette touche physique, ou `null` si cette touche n'en porte pas.
 *
 * `code` vide — ce que rendent certains claviers virtuels et les événements fabriqués à la main —
 * ne joue rien : mieux vaut un silence qu'une note prise au hasard d'un caractère.
 */
export function noteDeLaFrappe(code: string, octave: number): number | null {
  if (!code) return null;
  const note = tableDeFrappe(octave).get(code);
  return note === undefined ? null : note;
}

/** L'octave suivante ou précédente, bornée. Rendue plutôt qu'appliquée, pour être lisible. */
export function octaveDeplacee(octave: number, pas: number): number {
  return Math.min(OCTAVE_MAX, Math.max(OCTAVE_MIN, octave + pas));
}

/**
 * Ce signe demande-t-il un changement d'octave, et dans quel sens ?
 *
 * Les flèches sont des positions autant que des signes, mais elles portent le même nom dans
 * `e.key` sur toutes les dispositions : les lire là évite d'avoir deux règles pour une.
 */
export function pasDOctave(key: string): number {
  if (key === "ArrowUp" || key === "=" || key === "+") return 1;
  if (key === "ArrowDown" || key === "-") return -1;
  return 0;
}
