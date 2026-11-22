// audio/corpus-tonalite.ts — La tonalité d'une pièce, lue sur ses notes.
//
// LA MÊME LECTURE QUE LE RESTE DU DÉPÔT : Krumhansl et Schmuckler sur les durées par classe de
// hauteur (`scoresDesTonalites`, `audio/accords.ts`), pour qu'un corpus et un fichier MIDI analysé
// ne puissent pas recevoir deux tonalités différentes de la même lecture.
//
// LA BASSE FINALE DÉPARTAGE : la tonalité dont la tonique est la note la plus grave du dernier
// accord l'emporte, si son score reste à `marge` du meilleur. Sur huit temps, la dominante d'un
// choral en do pèse autant que sa tonique, et Krumhansl seul le lisait en sol une fois sur deux.
//
// LA MARGE EST MESURÉE, contre la tonalité que Craig Sapp écrit dans ses 370 chorals
// (`corpus-chorals-releve.test.ts`, 2026-11-22) : Krumhansl seul la trouve 291 fois ; avec la
// basse finale, 335 fois à 0,1, 344 à 0,2 et à 0,3, puis 339 ou 340 de 0,4 à 2, une fin phrygienne
// prenant alors sa dominante pour tonique. Sur 24 chorals de huit noires en do fabriqués par les
// règles, 0,3 en lit 21 en do, 0,5 les 24 : la marge suit le corpus où la réponse est écrite.

import { scoresDesTonalites } from "./accords";
import type { TonaliteLue } from "./corpus";
import type { Sequence } from "./sequence";

/** La marge par défaut, en points de corrélation de Pearson. */
export const MARGE_BASSE_FINALE = 0.3;

/** La tonalité estimée sur les notes, ou `null` pour une pièce sans durée. */
export function tonaliteDesNotes(s: Sequence, marge = MARGE_BASSE_FINALE): TonaliteLue | null {
  const chroma = new Array<number>(12).fill(0);
  for (const n of s.notes) chroma[((Math.round(n.note) % 12) + 12) % 12] += Math.max(0, n.fin - n.debut);
  if (chroma.every((x) => x === 0)) return null;
  const scores = scoresDesTonalites(chroma);
  let choisie = scores[0];
  if (marge > 0) {
    const derniere = Math.max(...s.notes.map((n) => n.debut));
    const basse = Math.min(...s.notes.filter((n) => n.debut <= derniere + 1e-9 && n.fin >= derniere + 1e-9 || n.debut === derniere).map((n) => n.note));
    const classe = ((Math.round(basse) % 12) + 12) % 12;
    const candidate = scores.find((x) => x.tonique === classe);
    if (candidate && scores[0].score - candidate.score <= marge) choisie = candidate;
  }
  return { tonique: choisie.tonique, mode: choisie.type === "minor" ? "mineur" : "majeur", origine: "notes" };
}
