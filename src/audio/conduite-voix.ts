// audio/conduite-voix.ts — Mesurer ce qu'une conduite de voix coûte.
//
// D'après Dmitri Tymoczko, « The Geometry of Musical Chords », Science 313(5783), 2006, p. 72-74,
// et « A Geometry of Music », Oxford University Press, 2011.
//
// CE QUI MANQUAIT, ET LA NUANCE QUI COMPTE. Attic sait déjà CHOISIR une conduite de voix :
// « Renversements et voicings » cherche, pour chaque accord, le registre qui déplace le moins de
// voix. C'est une heuristique, et elle rend un accord. Ce qu'elle ne rend pas, c'est un NOMBRE —
// et sans nombre on ne peut ni comparer deux progressions, ni dire laquelle de deux harmonisations
// coule le mieux, ni repérer l'endroit d'une pièce où le mouvement se tend. Le Tonnetz, de son
// côté, enchaîne les transformations néo-riemanniennes P, L et R, qui sont précisément celles qui
// ne bougent qu'une voix — mais il ne dit pas de combien bouge le reste.
//
// LE THÉORÈME QUI REND LE CALCUL COURT. On croit devoir essayer toutes les façons d'apparier les
// voix — six notes en font sept cent vingt. Tymoczko démontre qu'il n'en est rien : la conduite
// minimale entre deux accords de même taille est toujours réalisable SANS CROISEMENT de voix. Il
// suffit donc de trier les deux accords et d'essayer les rotations cycliques de l'un contre
// l'autre : n essais au lieu de n factoriel, et le résultat est le minimum exact, pas une
// approximation.
//
// LA DISTANCE EST CELLE DES CLASSES DE HAUTEURS, prise par le plus court chemin sur le cercle des
// douze demi-tons. Un do qui monte vers un si voisin parcourt un demi-ton et non onze : c'est ce
// que l'oreille entend, et c'est ce qui permet de comparer des accords écrits dans des registres
// différents.

/** Le plus court chemin entre deux classes de hauteurs, en demi-tons. */
export function ecartCirculaire(a: number, b: number): number {
  const d = Math.abs(((a - b) % 12 + 12) % 12);
  return Math.min(d, 12 - d);
}

export interface ConduiteVoix {
  /** Somme des déplacements, en demi-tons. */
  distance: number;
  /** Le déplacement de chaque voix, dans l'ordre de l'accord de départ trié. */
  deplacements: number[];
  /** À quelle note d'arrivée chaque voix de départ aboutit. */
  affectation: [number, number][];
}

/**
 * La conduite de voix la moins coûteuse entre deux accords de même taille.
 *
 * Les accords sont ramenés à leurs classes de hauteurs, dédoublonnées et triées : deux accords qui
 * ne diffèrent que par l'octave ou le doublage ont la même conduite, ce qui est le propos.
 */
export function conduiteMinimale(depart: number[], arrivee: number[]): ConduiteVoix | null {
  const a = [...new Set(depart.map((n) => ((n % 12) + 12) % 12))].sort((x, y) => x - y);
  const b = [...new Set(arrivee.map((n) => ((n % 12) + 12) % 12))].sort((x, y) => x - y);
  if (a.length === 0 || a.length !== b.length) return null;

  let meilleure: ConduiteVoix | null = null;
  for (let k = 0; k < b.length; k++) {
    const deplacements: number[] = [];
    const affectation: [number, number][] = [];
    let somme = 0;
    for (let i = 0; i < a.length; i++) {
      const cible = b[(i + k) % b.length];
      const d = ecartCirculaire(a[i], cible);
      deplacements.push(d);
      affectation.push([a[i], cible]);
      somme += d;
    }
    if (!meilleure || somme < meilleure.distance) meilleure = { distance: somme, deplacements, affectation };
  }
  return meilleure;
}

export interface EtapeConduite {
  depart: number[];
  arrivee: number[];
  conduite: ConduiteVoix | null;
}

export interface AnalyseConduite {
  etapes: EtapeConduite[];
  /** Somme des distances, sur les transitions mesurables. */
  total: number;
  /** Distance moyenne par transition mesurable. */
  moyenne: number;
  /** Rang de la transition la plus lisse, et de la plus tendue. */
  plusLisse: number;
  plusTendue: number;
  /** Transitions qui ne bougent qu'une seule voix : les mouvements néo-riemanniens. */
  uneSeuleVoix: number[];
  /** Transitions écartées faute d'accords de même taille. */
  ignorees: number;
}

/**
 * Une progression, transition par transition.
 *
 * Les accords de tailles différentes sont ÉCARTÉS plutôt qu'ajustés : apparier trois notes à
 * quatre demanderait de décider laquelle est doublée, et cette décision changerait la distance
 * sans qu'on sache laquelle est la bonne. Mieux vaut dire combien de transitions n'ont pas été
 * mesurées que rendre un chiffre dont on ne saurait pas ce qu'il vaut.
 */
export function analyserConduite(accords: number[][]): AnalyseConduite {
  const etapes: EtapeConduite[] = [];
  for (let i = 0; i + 1 < accords.length; i++) {
    etapes.push({
      depart: accords[i], arrivee: accords[i + 1],
      conduite: conduiteMinimale(accords[i], accords[i + 1]),
    });
  }
  const mesurables = etapes.map((e, i) => ({ i, c: e.conduite })).filter((x) => x.c !== null) as { i: number; c: ConduiteVoix }[];
  const total = mesurables.reduce((s, x) => s + x.c.distance, 0);
  let plusLisse = -1, plusTendue = -1;
  for (const x of mesurables) {
    if (plusLisse < 0 || x.c.distance < mesurables.find((y) => y.i === plusLisse)!.c.distance) plusLisse = x.i;
    if (plusTendue < 0 || x.c.distance > mesurables.find((y) => y.i === plusTendue)!.c.distance) plusTendue = x.i;
  }
  return {
    etapes,
    total,
    moyenne: mesurables.length > 0 ? total / mesurables.length : 0,
    plusLisse,
    plusTendue,
    uneSeuleVoix: mesurables.filter((x) => x.c.deplacements.filter((d) => d > 0).length === 1).map((x) => x.i),
    ignorees: etapes.length - mesurables.length,
  };
}
