// plugins/generateurs-aides.ts — Ce dont les fiches de ce groupe se servent en commun.
//
// POURQUOI UN MODULE A PART plutot que de les laisser dans l'un des fichiers de fiches : celui-la
// deviendrait le maitre des autres, alors qu'une aide partagee est un sujet a elle seule.


import { frequenceDeNoteMidi, GAMMES_ACCORDS } from "../audio";

/**
 * Convertit une note texte (ex. C4, c#5, Bb3, A4, C4\n) en fréquence.
 * Accepte les altérations #/♯ et b/♭, ignore la casse et les espaces blancs.
 * Retourne null si la note est invalide.
 */

export function noteVersFrequence(note: string): number | null {
  const n = note.trim().replace(/\s+/g, "");
  const m = n.match(/^([A-Ga-g])([#♯]|[b♭])?(-?\d+)$/);
  if (!m) return null;
  const tbl: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = tbl[m[1].toUpperCase()] ?? 9;
  const alt = m[2] ?? "";
  if (alt === "#" || alt === "♯") pc += 1;
  else if (alt === "b" || alt === "♭") pc -= 1;
  const midi = (parseInt(m[3]) + 1) * 12 + pc;
  return frequenceDeNoteMidi(midi);
}

export const FORMES_FREQ = { ids: ["sine", "square", "saw", "triangle"], fr: ["Sinus", "Carré", "Scie", "Triangle"], en: ["Sine", "Square", "Saw", "Triangle"] };

// Ids canoniques du paramètre "Genre" des générateurs d'accords (Générateur
// d'accords, Groove Box) — doivent correspondre exactement aux clés de
// PROGRESSIONS_GENRE (audio/generation.ts), plus "custom" pour la
// progression personnalisée.
export const GENRES_ACCORDS_IDS = ["pop", "rock", "jazz", "blues", "classique", "electro", "hiphop", "reggae", "ambient", "custom"];

// Ids canoniques du paramètre "Gamme" des mêmes nœuds — dérivés de
// GAMMES_ACCORDS (audio/generation.ts), seule source de vérité pour les
// intervalles réellement utilisés lors de la génération.
export const GAMMES_ACCORDS_IDS = GAMMES_ACCORDS.map((g) => g.id);


