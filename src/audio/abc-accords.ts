// audio/abc-accords.ts — Les hauteurs d'un accord chiffré ABC, « Am7 », « D/F# ».
//
// Ce module vivait dans `abc.ts`, qui le réexporte, et en est sorti tel quel le 2026-11-22 pour faire
// la place de l'altération qu'une liaison porte à travers la barre : ce fichier-là était à son
// plafond de taille.

import { Note } from "tonal";
import { accordDuSymbole, estSansAccord, normaliserSymbole } from "./symboles-accords";

/**
 * Écritures courantes que Tonal refuse, ramenées aux siennes. Trouvé en mesurant
 * des retouches par LLM : gemma4:12b écrivait « Bm7(b5) », l'écriture usuelle du
 * semi-diminué, et la lecture échouait ; le modèle avait raison, le lecteur tort.
 * C'EST DEPUIS LE 2026-11-22 LE LECTEUR DE TOUS LES NŒUDS, `normaliserSymbole`
 * (`symboles-accords.ts`), qui lit aussi « Δ7 », « ♭ » et « ♯ » ; ce nom reste,
 * parce que la comparaison des accords de `abc-contraintes.ts` l'emploie.
 */
export const normaliserAccord = normaliserSymbole;

/** Voicing d'un accord chiffré : fondamentale à l'octave 3, notes montantes, basse sous la fondamentale. */
export function hauteursAccord(symbole: string): number[] | null {
  if (estSansAccord(symbole)) return [];
  const [nom, basse] = normaliserSymbole(symbole).split("/");
  // Par le seul lecteur des symboles, et sa table : « C7b5b9 » sans quinte juste, « Cm13 » avec sa onzième.
  const c = accordDuSymbole(nom);
  if (!c) return null;
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
