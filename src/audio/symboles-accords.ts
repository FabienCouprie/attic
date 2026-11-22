// audio/symboles-accords.ts — Le seul lecteur des symboles d'accords, « Am7 », « Bø7 », « D/F# », « N.C. ».
//
// LA REVUE DES NOTATIONS EN TEXTE, cinquième format, 2026-11-22. Chaque nœud lisait les symboles
// par Tonal à sa façon, et ils ne se répondaient pas : l'ABC ramenait « ø », les parenthèses et
// « m(maj7) » à l'écriture de Tonal, la Grille les refusait, « Accords → Notation » les perdait sans
// les nommer ; « Δ7 », « ♭ » et « ♯ » n'étaient lus nulle part. Décisions de Fabien du 2026-11-22 :
// un seul lecteur, qui lit les écritures usuelles, et « N.C. » est un accord silencieux.
//
// CE QUI EST RAMENÉ À L'ÉCRITURE DE TONAL, une par une, et rien d'autre : les signes d'imprimerie
// « ♭ » et « ♯ », les parenthèses d'altération (« Bm7(b5) »), « m(maj7) », « ø » et « ø7 », « Δ » et
// « Δ7 », « min7b5 », que le détecteur d'accords écrivait, « 6/9 », dont la barre oblique n'est pas
// une basse, et une fondamentale en minuscule. Un symbole que Tonal ne lit toujours pas reste inconnu,
// et chaque nœud le refuse en le nommant.

import { Chord } from "tonal";

/** « N.C. », « NC » : pas d'accord. Il prend sa place dans le temps, en silence. */
export const estSansAccord = (symbole: string): boolean => /^N\.?C\.?$/i.test(symbole.trim());

/** Le symbole ramené à l'écriture de Tonal. */
export function normaliserSymbole(symbole: string): string {
  return symbole.trim()
    .replace(/^([a-g])/, (x) => x.toUpperCase())
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/\(([^)]*)\)/g, "$1") // Bm7(b5) → Bm7b5, C(add9) → Cadd9
    .replace(/m\s*maj7/i, "mMaj7") // Cm(maj7) → CmMaj7
    .replace(/ø7?/, "m7b5") // Bø, Bø7 → Bm7b5
    .replace(/Δ7?/, "maj7") // CΔ, CΔ7 → Cmaj7
    .replace(/min7b5/, "m7b5") // Bmin7b5 → Bm7b5
    .replace(/6\/9/, "69"); // F6/9 → F69 : ce 9 n'est pas une basse
}

/** L'accord que le symbole nomme, tel que Tonal le décrit, ou null s'il n'en nomme aucun. « N.C. » n'en nomme aucun. */
export function accordDuSymbole(symbole: string): ReturnType<typeof Chord.get> | null {
  if (estSansAccord(symbole)) return null;
  const c = Chord.get(normaliserSymbole(symbole));
  return c.empty || c.notes.length === 0 ? null : c;
}

/** Les symboles que le lecteur ne lit pas ; « N.C. » est lu. */
export const symbolesInconnus = (symboles: readonly string[]): string[] =>
  symboles.filter((s) => !estSansAccord(s) && accordDuSymbole(s) === null);
