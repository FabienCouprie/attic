// audio/gamme-epelee.ts — Les notes d'une gamme de la table, nommées depuis une tonique.
//
// LA TABLE DES GAMMES EST EN DEMI-TONS, ET UN DEMI-TON NE DIT PAS SA LETTRE : fa dièse et sol bémol
// sont la même touche. Nommer les notes d'une gamme demande donc une écriture, et chaque gamme a la
// sienne dans l'usage : une lettre par degré pour les modes, « C D E F# G# A# » pour la gamme par tons,
// « C Db D# E F# Ab Bb » pour l'altérée.
//
// UNE GAMME DE SEPT DEGRÉS S'ÉCRIT UNE LETTRE PAR DEGRÉ : le degré k porte la k-ième lettre depuis la
// tonique, et son altération est l'écart à la gamme majeure. C'est ce que les chiffres romains lisent,
// le IV étant une quarte, et c'est ce que Tonal ne fait pas pour l'altérée, qu'il écrit à la façon du
// jazz, C Db D# E F# Ab Bb : six lettres, et des doubles dièses sur C# (relevé le 2026-11-23).
//
// LES AUTRES GAMMES PRENNENT L'ÉCRITURE DE TONAL, TROUVÉE PAR LA SUITE DE DEMI-TONS ET JAMAIS PAR LE
// NOM. Tonal range ses gammes sous leur « chroma », les douze présences de la gamme sur do, et
// `ScaleType.get` le lit. Chercher par le nom anglais aurait demandé une seconde table de
// correspondance, écrite à la main à côté de `gammes.ts`, et une seconde table diverge de la première
// sans que rien ne le dise : c'est la faute que `gammes.ts` existe pour empêcher. Les vingt-cinq
// gammes de la table ont leur écriture, `gamme-epelee.test.ts` le tient.
//
// Né le 2026-11-23 : le nœud « Gamme » offrait les sept noms de Tonal, `major` à `locrian`, et non la
// table commune. Relevé par Fabien.

import { Note, ScaleType } from "tonal";
import { degresDeGamme, gammeDe } from "./gammes";

/** Les douze présences d'une suite de degrés sur do, « 101011010101 » pour le majeur. */
export const chromaDe = (degres: readonly number[]): string =>
  Array.from({ length: 12 }, (_, i) => (degres.includes(i) ? "1" : "0")).join("");

/** Les degrés de la gamme majeure, mesure de l'altération d'un degré, tirés de la table. */
const MAJEUR = degresDeGamme("majeur");
/** Les degrés dont l'intervalle est juste, et non majeur : I, IV et V. */
const JUSTES = new Set([0, 3, 4]);

/**
 * L'intervalle depuis la tonique du degré `degre` (0 à 6) déplacé de `decalage` demi-tons par rapport
 * à la gamme majeure, « 3m », « 4A » ; null au-delà d'une altération simple.
 */
export function intervalleDuDegre(degre: number, decalage: number): string | null {
  const qualites: Record<number, string> = JUSTES.has(degre) ? { [-1]: "d", 0: "P", 1: "A" } : { [-2]: "d", [-1]: "m", 0: "M", 1: "A" };
  const q = qualites[decalage];
  return q ? `${degre + 1}${q}` : null;
}

/**
 * Les intervalles qui écrivent une gamme de la table, « 1P 2M 3m… », ou null si l'identifiant n'est
 * pas une gamme de la table, ou si aucune écriture ne la porte.
 */
export function intervallesDeGamme(id: string): string[] | null {
  const g = gammeDe(id);
  if (!g) return null;
  if (g.degres.length === 7) {
    const parDegre = g.degres.map((d, k) => intervalleDuDegre(k, d - MAJEUR[k]));
    if (parDegre.every((i): i is string => i !== null)) return parDegre;
  }
  const t = ScaleType.get(chromaDe(g.degres));
  return t.empty ? null : [...t.intervals];
}

/**
 * Les noms des notes d'une gamme sur une tonique, du premier degré au dernier, « C D Eb F G A Bb » ;
 * null si la tonique ne se lit pas ou si la gamme n'a pas d'écriture.
 */
export function notesDeGamme(tonique: string, id: string): string[] | null {
  const intervalles = intervallesDeGamme(id);
  if (!intervalles) return null;
  const notes = intervalles.map((i) => Note.transpose(tonique, i));
  return notes.every((n) => n.length > 0) ? notes : null;
}
