// audio/corpus-tonalite.ts — La tonalité d'une pièce, lue sur ses notes.
//
// LA MÊME LECTURE QUE LE RESTE DU DÉPÔT : Krumhansl et Schmuckler sur les durées par classe de
// hauteur (`tonaliteDepuisChroma`, `audio/accords.ts`), pour qu'un corpus et un fichier MIDI analysé
// ne puissent pas recevoir deux tonalités différentes de la même lecture.

import { tonaliteDepuisChroma } from "./accords";
import type { TonaliteLue } from "./corpus";
import type { Sequence } from "./sequence";

/** La tonalité estimée sur les notes, ou `null` pour une pièce sans durée. */
export function tonaliteDesNotes(s: Sequence): TonaliteLue | null {
  const chroma = new Array<number>(12).fill(0);
  for (const n of s.notes) chroma[((Math.round(n.note) % 12) + 12) % 12] += Math.max(0, n.fin - n.debut);
  if (chroma.every((x) => x === 0)) return null;
  const t = tonaliteDepuisChroma(chroma);
  return { tonique: t.tonique, mode: t.type === "minor" ? "mineur" : "majeur", origine: "notes" };
}
