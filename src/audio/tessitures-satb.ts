// audio/tessitures-satb.ts — Les tessitures du soprano, de l'alto, du ténor et de la basse, en MIDI.
//
// D'OÙ VIENNENT CES NOMBRES : DES CHORALS DE BACH, ET NON D'UN MANUEL. Les manuels en donnent chacun
// une version, et les deux qui se lisaient en ligne le 2026-11-22 ne s'y prêtaient pas : celui d'Open
// Music Theory refusait la lecture, et celui de Robert Hutchinson (« Music Theory for the 21st-Century
// Classroom », § 26.4) ne les donne qu'en image, en disant qu'elles sont « based on those most
// commonly found in J.S. Bach's 371 Chorales ». On les a donc prises là où ce manuel dit les prendre.
//
// RELEVÉ LE 2026-11-22 sur les 370 chorals encodés par Craig Sapp en Humdrum (`craigsapp/bach-370-
// chorales`, d'après l'édition Breitkopf & Härtel), lus par `audio/partition-lecture.ts`, leurs
// hauteurs reprises dans le texte du kern, 84 665 notes en tout (`audio/corpus-chorals-releve.test.ts`).
// Une première lecture, par Verovio seul, perdait les altérations d'armure. Deux bornes par voix :
//   · l'ÉTENDUE ENTIÈRE, la plus grave et la plus aiguë des notes de Bach dans cette voix ;
//   · l'ÉTENDUE USUELLE, du premier au quatre-vingt-dix-neuvième centile : un centième des notes de
//     Bach tombe sous elle, un centième au-dessus.
// Le corpus de Sapp n'entre pas dans le dépôt (CC BY-NC-SA) ; ces bornes sont des faits relevés sur
// lui, et rien de plus.

export interface Tessiture {
  /** La plus grave et la plus aiguë des notes de Bach dans cette voix. */
  entiere: readonly [number, number];
  /** Du premier au quatre-vingt-dix-neuvième centile. */
  usuelle: readonly [number, number];
}

/** Soprano, alto, ténor, basse, dans l'ordre des voix d'un choral. */
export const TESSITURES_SATB: readonly Tessiture[] = [
  { entiere: [57, 81], usuelle: [62, 78] },
  { entiere: [52, 74], usuelle: [57, 72] },
  { entiere: [48, 69], usuelle: [52, 67] },
  { entiere: [36, 64], usuelle: [40, 60] },
];

/** Les noms des quatre voix, dans les deux langues. */
export const NOMS_SATB = [
  { fr: "soprano", en: "soprano" },
  { fr: "alto", en: "alto" },
  { fr: "ténor", en: "tenor" },
  { fr: "basse", en: "bass" },
] as const;
