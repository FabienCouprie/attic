// audio/temperaments.ts — Tempéraments historiques et intonation juste.
//
// Tous les nœuds d'Attic jouent en tempérament égal : douze demi-tons rigoureusement
// identiques, qui ne sonnent juste nulle part mais faux partout de la même façon. Ce
// n'est ni naturel ni ancien — c'est un compromis du XVIIIᵉ siècle, généralisé au XIXᵉ.
// Avant lui, et à côté de lui, d'autres accords donnaient à chaque tonalité sa couleur
// propre : c'est ce que Bach entendait, et ce que ce module rend audible.
//
// Une altération se mesure en CENTIÈMES de demi-ton : 1200 par octave, 100 par demi-ton
// égal. Les tables ci-dessous donnent les douze degrés en centièmes depuis la tonique.
// Le tempérament égal y figure, non par symétrie, mais pour qu'on puisse comparer.

/** Centièmes depuis la tonique d'un rapport de fréquences. */
export function centsDeRapport(rapport: number): number {
  return 1200 * Math.log2(rapport);
}

const cents = (ratios: [number, number][]): number[] =>
  ratios.map(([n, d]) => centsDeRapport(n / d));

export interface Temperament {
  id: string;
  fr: string;
  en: string;
  /** Les douze degrés, en centièmes depuis la tonique. */
  cents: number[];
  /** Ce que ce tempérament fait entendre, en une phrase. */
  noteFr: string;
  noteEn: string;
}

export const TEMPERAMENTS: Temperament[] = [
  {
    id: "egal",
    fr: "Égal", en: "Equal",
    cents: Array.from({ length: 12 }, (_, i) => i * 100),
    noteFr: "Le compromis moderne : douze demi-tons identiques, aucune tierce juste, toutes les tonalités interchangeables.",
    noteEn: "The modern compromise: twelve identical semitones, no pure third, every key interchangeable.",
  },
  {
    id: "pythagoricien",
    fr: "Pythagoricien", en: "Pythagorean",
    // Construit par quintes pures 3/2 empilées : la quinte est exacte, la tierce non.
    cents: cents([[1, 1], [2187, 2048], [9, 8], [32, 27], [81, 64], [4, 3], [729, 512], [3, 2], [6561, 4096], [27, 16], [16, 9], [243, 128]]),
    noteFr: "Douze quintes pures empilées. Les quintes sont exactes à 702 centièmes, mais la tierce majeure monte à 408 — 22 centièmes au-dessus de la tierce naturelle, ce qui la rend mordante. Le compte ne tombe pas juste : il reste le comma pythagoricien, qu'une quinte doit absorber, et c'est le « loup ».",
    noteEn: "Twelve pure fifths stacked. Fifths are exact at 702 cents, but the major third reaches 408 — 22 cents above the natural third, which makes it biting. The sum does not close: the Pythagorean comma remains, absorbed by one fifth, and that is the « wolf ».",
  },
  {
    id: "juste",
    fr: "Intonation juste", en: "Just intonation",
    cents: cents([[1, 1], [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [3, 2], [8, 5], [5, 3], [9, 5], [15, 8]]),
    noteFr: "Les intervalles en rapports simples : tierce majeure 5/4, quinte 3/2. L'accord de tonique est d'une pureté qu'aucun piano moderne ne donne — mais la tonalité voisine devient inutilisable, puisque les intervalles ne se transposent pas.",
    noteEn: "Intervals as simple ratios: major third 5/4, fifth 3/2. The tonic chord has a purity no modern piano gives — but the neighbouring key becomes unusable, since the intervals do not transpose.",
  },
  {
    id: "mesotonique",
    fr: "Mésotonique 1/4 de comma", en: "Quarter-comma meantone",
    cents: [0, 76.049, 193.157, 310.265, 386.314, 503.422, 579.471, 696.578, 772.627, 889.735, 1006.843, 1082.892],
    noteFr: "L'accord de la Renaissance et du premier baroque. La quinte est rétrécie d'un quart de comma pour que la tierce majeure soit EXACTEMENT pure (386 centièmes) : huit tonalités sonnent admirablement, les autres portent un loup impraticable.",
    noteEn: "The tuning of the Renaissance and early Baroque. The fifth is narrowed by a quarter comma so the major third is EXACTLY pure (386 cents): eight keys sound admirable, the others carry an unusable wolf.",
  },
  {
    id: "werckmeister3",
    fr: "Werckmeister III", en: "Werckmeister III",
    cents: [0, 90.225, 192.18, 294.135, 390.225, 498.045, 588.27, 696.09, 792.18, 888.27, 996.09, 1092.18],
    noteFr: "Andreas Werckmeister, 1691 : le premier tempérament où TOUTES les tonalités sont jouables, sans qu'aucune ne soit identique. C'est de ce genre d'accord que « Le Clavier bien tempéré » tire son titre — bien tempéré ne veut pas dire égal.",
    noteEn: "Andreas Werckmeister, 1691: the first tuning where EVERY key is playable without any two sounding alike. It is this kind of tuning that gives « The Well-Tempered Clavier » its title — well-tempered does not mean equal.",
  },
  {
    id: "kirnberger3",
    fr: "Kirnberger III", en: "Kirnberger III",
    cents: [0, 90.225, 193.157, 294.135, 386.314, 498.045, 590.224, 696.578, 792.18, 889.735, 996.091, 1088.269],
    noteFr: "Johann Kirnberger, élève de Bach : quatre quintes rétrécies pour garder une tierce do-mi pure, le reste s'ajustant. Un compromis plus doux que le mésotonique, qui laisse chaque tonalité reconnaissable.",
    noteEn: "Johann Kirnberger, a pupil of Bach: four narrowed fifths keep the C-E third pure, the rest adjusting. A gentler compromise than meantone, leaving every key recognisable.",
  },
  {
    id: "vallotti",
    fr: "Vallotti", en: "Vallotti",
    cents: [0, 94.135, 196.09, 298.045, 392.18, 501.955, 592.18, 698.045, 796.09, 894.135, 1000, 1090.225],
    noteFr: "Francesco Vallotti, XVIIIᵉ : six quintes rétrécies d'un sixième de comma, six pures. Très employé aujourd'hui pour le répertoire baroque, parce qu'il colore les tonalités sans jamais devenir rude.",
    noteEn: "Francesco Vallotti, 18th century: six fifths narrowed by a sixth of a comma, six pure. Widely used today for Baroque repertoire, because it colours the keys without ever turning harsh.",
  },
];

export function temperament(id: string): Temperament {
  return TEMPERAMENTS.find((t) => t.id === id) ?? TEMPERAMENTS[0];
}

/**
 * La note MIDI FRACTIONNAIRE à jouer pour cette note, dans ce tempérament.
 *
 * Le résultat n'est un entier que pour le tempérament égal : c'est justement l'écart qui
 * s'entend. Les rendus d'Attic — FM comme SoundFont — acceptent une hauteur fractionnaire,
 * puisqu'ils calculent une fréquence ou un rapport de lecture à partir de ce nombre.
 */
export function noteTemperee(noteMidi: number, tonique: number, t: Temperament): number {
  // Degré dans l'octave, compté depuis la tonique du tempérament.
  const degre = ((Math.round(noteMidi) - tonique) % 12 + 12) % 12;
  const ecart = t.cents[degre] - degre * 100;
  return noteMidi + ecart / 100;
}

/** Les écarts au tempérament égal, degré par degré, en centièmes. */
export function ecartsAuTemperamentEgal(t: Temperament): number[] {
  return t.cents.map((c, i) => c - i * 100);
}

const NOMS_DEGRES = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];

/** Table lisible des écarts, pour le rapport du nœud. */
export function tableEcarts(t: Temperament): string {
  return ecartsAuTemperamentEgal(t)
    .map((e, i) => `${NOMS_DEGRES[i]} ${e >= 0 ? "+" : ""}${e.toFixed(1)}`)
    .join("  ");
}
