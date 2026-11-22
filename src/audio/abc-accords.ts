// audio/abc-accords.ts — Les hauteurs d'un accord chiffré ABC, « Am7 », « D/F# ».
//
// Ce module vivait dans `abc.ts`, qui le réexporte, et en est sorti tel quel le 2026-11-22 pour faire
// la place de l'altération qu'une liaison porte à travers la barre : ce fichier-là était à son
// plafond de taille.

import { Chord, Note } from "tonal";

/**
 * Écritures courantes que Tonal refuse, ramenées aux siennes. Trouvé en mesurant
 * des retouches par LLM : gemma4:12b écrivait « Bm7(b5) », l'écriture usuelle du
 * semi-diminué, et la lecture échouait — le modèle avait raison, le lecteur tort.
 * Vérifié une par une contre Tonal : les parenthèses d'altération, « m(maj7) »,
 * « ø7 », et « 6/9 », que la barre oblique faisait prendre pour une basse.
 */
export function normaliserAccord(symbole: string): string {
  return symbole
    .replace(/\(([^)]*)\)/g, "$1") // Bm7(b5) → Bm7b5, C(add9) → Cadd9
    .replace(/m\s*maj7/i, "mMaj7") // Dm(maj7) → DmMaj7
    .replace(/ø7?/, "m7b5") // Bø, Bø7 → Bm7b5
    .replace(/6\/9/, "69"); // F6/9 → F69 : ce 9 n'est pas une basse
}

/** Voicing d'un accord chiffré : fondamentale à l'octave 3, notes montantes, basse sous la fondamentale. */
export function hauteursAccord(symbole: string): number[] | null {
  if (/^N\.?C\.?$/i.test(symbole)) return [];
  const [nom, basse] = normaliserAccord(symbole).split("/");
  const c = Chord.get(nom.replace(/^([a-g])/, (x) => x.toUpperCase()));
  if (c.empty || c.notes.length === 0) return null;
  const hauteurs: number[] = [];
  let precedente = 47;
  for (const n of c.notes) {
    let m = 48 + (Note.chroma(n) ?? 0);
    while (m <= precedente) m += 12;
    hauteurs.push(m);
    precedente = m;
  }
  if (basse) {
    const b = Note.chroma(basse);
    if (b === undefined || Number.isNaN(b)) return null;
    let m = 36 + b;
    while (m >= hauteurs[0]) m -= 12;
    hauteurs.unshift(m);
  }
  return hauteurs;
}
