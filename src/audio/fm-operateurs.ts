// audio/fm-operateurs.ts — Six opérateurs, et la façon dont on les branche.
//
// CE QU'UN SYNTHÉ FM À SIX OPÉRATEURS A DE PLUS QU'UN À DEUX. Avec deux, il n'y a qu'un seul
// branchement possible : l'un module l'autre, et le timbre tient dans un rapport de fréquence
// et un indice. Avec six, c'est le BRANCHEMENT qui fait le timbre : une pile de six donne un
// spectre dense et mouvant, six porteuses côte à côte donnent une synthèse additive, et entre
// les deux se trouvent les cloches, les cuivres et les pianos électriques qui ont fait la
// réputation du procédé. Le dépôt n'avait que le cas à deux.
//
// L'ORDRE DE CALCUL EST L'ORDRE DES INDICES, ET C'EST UNE CONTRAINTE ÉCRITE. Un opérateur se
// calcule après ceux qui le modulent, sans quoi il lirait leur valeur de l'échantillon d'avant
// et le son serait retardé d'un échantillon par étage. Tous les branchements livrés ont donc
// leurs modulateurs d'indice plus grand que le modulé, ce qui permet de descendre simplement
// de six à un. Un test tient cette propriété : un branchement ajouté qui l'enfreindrait ne
// passerait pas en silence.
//
// LE NIVEAU N'A PAS LE MÊME SENS DES DEUX CÔTÉS, et la notice le dit. Pour une porteuse,
// c'est une amplitude ; pour un modulateur, c'est un indice de modulation, c'est-à-dire un
// nombre de radians ajoutés à la phase de celui qu'il module. Un même curseur ne peut pas
// faire autrement : ce qui sort d'un opérateur est un nombre, et c'est sa destination qui
// décide s'il s'entend ou s'il déforme.
//
// LE REPLIEMENT SE TRAITE COMME CELUI DE L'OSCILLATEUR ANALOGIQUE, par suréchantillonnage et
// filtre de décimation, et le filtre est LE SIEN plutôt qu'un second : la modulation de
// fréquence ne porte aucune rupture dont on pourrait replacer l'instant, seulement une bande
// qui s'élargit avec l'indice, et c'est exactement ce qu'un suréchantillonnage traite.

import { decimer, noyauDecimation } from "./oscillateur-analogique";

export const OPERATEURS = 6;
/** Le facteur de suréchantillonnage du calcul. */
export const SUR_ECHANTILLONNAGE_FM = 4;
/** Les radians de phase qu'un niveau plein ajoute, quand l'opérateur module. */
export const INDICE_MAX = 8;
/** La durée de la montée, en secondes : sans elle, chaque note claque. */
export const MONTEE = 0.005;

export interface Operateur {
  /** Rapport entre la fréquence de l'opérateur et celle de la note. */
  rapport: number;
  /** Amplitude s'il s'entend, indice de modulation s'il module. De 0 à 1. */
  niveau: number;
  /** Temps de décroissance, en secondes. */
  declin: number;
}

export interface Algorithme {
  id: string;
  fr: string;
  en: string;
  /** Pour chaque opérateur, les indices de ceux qui le modulent. */
  modulateurs: number[][];
  /** Les indices des opérateurs qu'on entend. */
  porteuses: number[];
}

/**
 * Huit branchements, écrits plutôt que numérotés.
 *
 * Un numéro de branchement ne dit rien à qui ne connaît pas la machine qui l'a inventé ; une
 * forme nommée se choisit à l'oreille. Les huit couvrent la plage, de la pile unique, qui
 * donne le spectre le plus dense, aux six porteuses, qui n'est plus une modulation du tout.
 */
export const ALGORITHMES: Algorithme[] = [
  {
    id: "pile", fr: "Pile de six", en: "Stack of six",
    modulateurs: [[1], [2], [3], [4], [5], []], porteuses: [0],
  },
  {
    id: "deux-piles", fr: "Deux piles de trois", en: "Two stacks of three",
    modulateurs: [[1], [2], [], [4], [5], []], porteuses: [0, 3],
  },
  {
    id: "trois-paires", fr: "Trois paires", en: "Three pairs",
    modulateurs: [[1], [], [3], [], [5], []], porteuses: [0, 2, 4],
  },
  {
    id: "un-sur-cinq", fr: "Un modulateur, cinq porteuses", en: "One modulator, five carriers",
    modulateurs: [[5], [5], [5], [5], [5], []], porteuses: [0, 1, 2, 3, 4],
  },
  {
    id: "deux-par-porteuse", fr: "Deux modulateurs par porteuse", en: "Two modulators per carrier",
    modulateurs: [[1, 2], [], [], [4, 5], [], []], porteuses: [0, 3],
  },
  {
    id: "fourche", fr: "Fourche", en: "Fork",
    modulateurs: [[1, 3], [2], [], [4], [5], []], porteuses: [0],
  },
  {
    id: "cinq-sur-une", fr: "Cinq modulateurs sur une porteuse", en: "Five modulators on one carrier",
    modulateurs: [[1, 2, 3, 4, 5], [], [], [], [], []], porteuses: [0],
  },
  {
    id: "additif", fr: "Six porteuses", en: "Six carriers",
    modulateurs: [[], [], [], [], [], []], porteuses: [0, 1, 2, 3, 4, 5],
  },
];

export const algorithmeDe = (id: string): Algorithme =>
  ALGORITHMES.find((a) => a.id === id) ?? ALGORITHMES[0];

export interface ReglagesFm {
  frequence: number;
  duree: number;
  algorithme: string;
  operateurs: Operateur[];
  /** Part de sa propre sortie que le sixième opérateur se renvoie, de 0 à 1. */
  retroaction: number;
}

/**
 * L'enveloppe d'un opérateur : une montée courte, puis une décroissance exponentielle.
 *
 * La montée n'est pas un ornement. Sans elle, l'amplitude saute de zéro à sa valeur en un
 * échantillon, ce qui est une rupture franche, donc un spectre qui ne s'arrête pas à
 * Nyquist : le claquement s'entendrait sur chaque note, et le suréchantillonnage n'y pourrait
 * rien, la rupture étant dans le signal avant lui.
 */
export const enveloppe = (t: number, declin: number): number =>
  (1 - Math.exp(-t / MONTEE)) * Math.exp(-t / Math.max(1e-3, declin));

/**
 * L'onde des six opérateurs, calculée à la cadence demandée.
 *
 * Les porteuses sont MOYENNÉES et non sommées : six porteuses en phase atteindraient six fois
 * la crête d'une seule, et la normalisation qui suit l'aurait ramenée au même niveau en
 * écrasant tout le reste.
 */
export function ondeFm(r: ReglagesFm, echantillonnage: number): Float32Array {
  const algo = algorithmeDe(r.algorithme);
  const total = Math.max(1, Math.floor(echantillonnage * r.duree));
  const sortie = new Float32Array(total);
  const phases = new Float64Array(OPERATEURS);
  const valeurs = new Float64Array(OPERATEURS);
  const pas = new Float64Array(OPERATEURS);
  for (let o = 0; o < OPERATEURS; o++) {
    pas[o] = (r.frequence * (r.operateurs[o]?.rapport ?? 1)) / echantillonnage;
  }
  const retroaction = Math.max(0, Math.min(1, r.retroaction));
  let precedent = 0;

  for (let i = 0; i < total; i++) {
    const t = i / echantillonnage;
    // DE SIX À UN : un opérateur se calcule après ceux qui le modulent, et tous les
    // branchements livrés ont leurs modulateurs d'indice plus grand.
    for (let o = OPERATEURS - 1; o >= 0; o--) {
      const op = r.operateurs[o] ?? { rapport: 1, niveau: 0, declin: 1 };
      let phase = 2 * Math.PI * phases[o];
      for (const m of algo.modulateurs[o]) phase += valeurs[m];
      if (o === OPERATEURS - 1) phase += retroaction * INDICE_MAX * precedent;
      const brut = Math.sin(phase);
      const niveau = Math.max(0, op.niveau) * enveloppe(t, op.declin);
      // Ce qui sort est une amplitude si l'opérateur s'entend, un nombre de radians s'il
      // module : le facteur n'est appliqué qu'au second emploi.
      valeurs[o] = algo.porteuses.includes(o) ? brut * niveau : brut * niveau * INDICE_MAX;
      if (o === OPERATEURS - 1) precedent = brut * niveau;
      phases[o] += pas[o];
      if (phases[o] >= 1) phases[o] -= Math.floor(phases[o]);
    }
    let somme = 0;
    for (const c of algo.porteuses) somme += valeurs[c];
    sortie[i] = somme / algo.porteuses.length;
  }
  return sortie;
}

/** L'onde calculée haut, redescendue à la cadence de sortie. */
export function synthetiserFm(r: ReglagesFm, echantillonnageSortie = 44100,
  facteur = SUR_ECHANTILLONNAGE_FM): Float32Array {
  const haut = ondeFm(r, echantillonnageSortie * facteur);
  if (facteur === 1) return haut;
  return decimer(haut, facteur, noyauDecimation(facteur, 20000, echantillonnageSortie));
}
