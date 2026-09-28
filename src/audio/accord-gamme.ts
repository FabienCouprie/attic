// audio/accord-gamme.ts — Quelle gamme un accord ouvre.
//
// POURQUOI CE MODULE EXISTE. Le dépôt tenait déjà deux nomenclatures sûres et séparées : vingt-cinq
// gammes dans `gammes.ts`, trente-trois qualités d'accords dans `qualites-accords.ts`. Rien ne les
// joignait. Or c'est cette jointure qui dit quelles notes sont DISPONIBLES sur un accord, donc ce
// dont une mélodie peut être faite : sans elle, un composant qui pose une mélodie sur une suite
// d'accords doit inventer sa propre règle, et l'on retombe sur le défaut que ces tables ont corrigé.
//
// LA LIGNÉE. George Russell, « Lydian Chromatic Concept of Tonal Organization », 1953, qui pose le
// principe qu'un accord désigne une échelle plutôt que l'inverse ; puis Mark Levine, « The Jazz
// Theory Book », 1995, qui en donne le tableau d'usage. Les associations ci-dessous sont les leurs.
//
// CE QUI FAIT QUE CETTE TABLE EST SÛRE, ET NON UNE OPINION. Une gamme ne peut être associée à une
// qualité que si elle CONTIENT toutes ses notes, et `accord-gamme.test.ts` le vérifie sur les
// trente-trois, mécaniquement, en classes de hauteur. Le jugement ne porte donc que sur l'ORDRE :
// la première gamme est celle que la littérature nomme d'abord, les suivantes sont d'autres
// couleurs possibles. Une association fausse ne peut pas entrer.
//
// DEUX CHOSES QUE LA DÉRIVATION A APPRISES, et qui valent d'être dites. La gamme altérée ne contient
// pas la quinte juste : elle ne peut donc pas porter un accord de septième neuvième augmentée tel
// que la table des accords l'écrit, quinte comprise, et c'est la diminuée demi-ton qui le porte. Et
// trois qualités n'ont qu'une seule gamme dans tout le catalogue, ce qui les rend sans ambiguïté :
// la neuvième majeure onzième augmentée ouvre le lydien, la mineure treizième le dorien, la septième
// quinte augmentée neuvième augmentée l'altérée.

import { gammeDe } from "./gammes";
import { qualiteDe } from "./qualites-accords";

/** Les gammes qu'une qualité d'accord ouvre, la plus employée d'abord. */
export interface GammesDeQualite {
  /** L'identifiant de la qualité, tel que `qualites-accords.ts` le porte. */
  qualite: string;
  /** Les identifiants des gammes, tels que `gammes.ts` les porte. */
  gammes: readonly string[];
}

/**
 * La table, dans l'ordre des qualités.
 *
 * L'ORDRE DES GAMMES EST CELUI DE L'USAGE, et il compte : c'est la première qui sert de défaut.
 */
export const ACCORD_GAMME: readonly GammesDeQualite[] = [
  // ── Les triades ──
  { qualite: "maj", gammes: ["majeur", "lydien", "pentatonique-majeure"] },
  { qualite: "m", gammes: ["dorien", "mineur", "pentatonique-mineure"] },
  { qualite: "dim", gammes: ["locrien", "diminuee-demi-ton"] },
  { qualite: "aug", gammes: ["ton-entier", "augmentee"] },
  { qualite: "sus2", gammes: ["majeur", "mixolydien"] },
  { qualite: "sus4", gammes: ["mixolydien", "majeur"] },

  // ── Les septièmes et les sixtes ──
  { qualite: "7", gammes: ["mixolydien", "lydien-dominant", "bebop-dominant"] },
  { qualite: "maj7", gammes: ["majeur", "lydien"] },
  { qualite: "m7", gammes: ["dorien", "mineur", "pentatonique-mineure"] },
  { qualite: "m7b5", gammes: ["locrien", "alteree"] },
  { qualite: "dim7", gammes: ["diminuee-ton-demi"] },
  { qualite: "mmaj7", gammes: ["mineur-melodique", "mineur-harmonique"] },
  { qualite: "6", gammes: ["majeur", "pentatonique-majeure", "lydien"] },
  { qualite: "m6", gammes: ["dorien", "mineur-melodique"] },
  { qualite: "7sus4", gammes: ["mixolydien", "dorien"] },

  // ── Les extensions ──
  { qualite: "9", gammes: ["mixolydien", "lydien-dominant"] },
  { qualite: "maj9", gammes: ["majeur", "lydien"] },
  { qualite: "m9", gammes: ["dorien", "mineur"] },
  { qualite: "add9", gammes: ["majeur", "pentatonique-majeure", "lydien"] },
  { qualite: "11", gammes: ["mixolydien", "dorien"] },
  { qualite: "maj9s11", gammes: ["lydien"] },
  { qualite: "m11", gammes: ["dorien", "mineur"] },
  { qualite: "13", gammes: ["mixolydien", "lydien-dominant", "bebop-dominant"] },
  { qualite: "maj13", gammes: ["majeur", "lydien"] },
  { qualite: "m13", gammes: ["dorien"] },

  // ── Les dominantes altérées ──
  { qualite: "7s9", gammes: ["diminuee-demi-ton"] },
  { qualite: "7b9", gammes: ["diminuee-demi-ton", "phrygien-dominant"] },
  { qualite: "7b5", gammes: ["lydien-dominant", "ton-entier", "alteree"] },
  { qualite: "7s5", gammes: ["ton-entier", "alteree"] },
  { qualite: "7b5b9", gammes: ["alteree", "diminuee-demi-ton"] },
  { qualite: "7s5b9", gammes: ["alteree", "phrygien-dominant"] },
  { qualite: "7b5s9", gammes: ["alteree", "diminuee-demi-ton"] },
  { qualite: "7s5s9", gammes: ["alteree"] },
];

const PAR_QUALITE = new Map(ACCORD_GAMME.map((e) => [e.qualite, e.gammes]));

/** Les gammes qu'une qualité ouvre, la plus employée d'abord. Vide si la qualité est inconnue. */
export const gammesDeQualite = (qualite: string): readonly string[] => PAR_QUALITE.get(qualite) ?? [];

/**
 * La gamme qu'une qualité ouvre, celle que la littérature nomme d'abord.
 *
 * `secours` sert pour une qualité inconnue, et vaut le majeur : une mélodie doit pouvoir se poser
 * même sur un accord que la table ne connaît pas, plutôt que de n'avoir aucune note disponible.
 */
export const gammeDeQualite = (qualite: string, secours = "majeur"): string =>
  PAR_QUALITE.get(qualite)?.[0] ?? secours;

/**
 * Les notes disponibles sur un accord, en classes de hauteur depuis sa fondamentale.
 *
 * C'EST CE QUE LA JOINTURE SERT À PRODUIRE. Une mélodie posée sur cet accord y prend ses degrés :
 * les notes de l'accord sont les appuis, les autres notes de la gamme sont les passages.
 */
export function notesDisponibles(qualite: string, gamme?: string): number[] {
  const g = gammeDe(gamme || gammeDeQualite(qualite));
  return g ? [...g.degres] : [];
}

/**
 * Les notes de la gamme qui n'appartiennent PAS à l'accord.
 *
 * Elles ne sont pas un reste : ce sont les notes de passage, et c'est leur tension contre l'accord
 * qui fait qu'une mélodie se distingue d'un arpège.
 */
export function notesDePassage(qualite: string, gamme?: string): number[] {
  const q = qualiteDe(qualite);
  const dansLaccord = new Set((q?.intervalles ?? []).map((n) => ((n % 12) + 12) % 12));
  return notesDisponibles(qualite, gamme).filter((n) => !dansLaccord.has(((n % 12) + 12) % 12));
}
