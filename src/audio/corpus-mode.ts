// audio/corpus-mode.ts — Le mode d'une pièce lu sans rien estimer : celui que sa partition écrit, ou celui
// que disent son armure et sa finale.
//
// LA DÉCISION D8 DU 2026-11-24 (étude de l'harmonisation modale, acceptée par Fabien) : une pièce dont
// la partition écrit son mode le garde, et un corpus qui porte l'armure se lit par l'armure et la
// finale. L'estimation sur les notes (`audio/corpus-tonalite.ts`) ne connaît que le majeur et le
// mineur ; elle reste la lecture de ce qui n'écrit rien.
//
// LA TONALITÉ ÉCRITE SE LIT DANS LE MEI QUE VEROVIO REND, et non dans chaque notation. Relevé le
// 2026-11-24 sur un même sol mixolydien écrit quatre fois : le MusicXML (`<mode>mixolydian</mode>`)
// et le Humdrum (`*G:mix`) arrivent en `<keySig mode="mixolydian" sig="0">`, le Humdrum avec
// `pname="g"` ; le MEI et l'ABC (`K:Gmix`) en `<scoreDef key.pname="g" key.mode="mixolydian">`. Une
// lecture couvre donc aussi le MusicXML compressé, que seul Verovio ouvre.
//
// L'ARMURE ET LA FINALE : la finale est la note la plus grave du dernier accord, et son écart à la
// tonique majeure de l'armure dit le mode. Le lydien et le locrien ne sont pas rendus : aucun choral
// de Bach ne les écrit, et aucun nœud ne les offre (raison écrite dans `plugins/nomenclatures.ts`).

import type { ModeChoral } from "./choral-regles";
import type { TonaliteLue } from "./corpus";
import type { Sequence } from "./sequence";

const pc = (x: number) => ((Math.round(x) % 12) + 12) % 12;

/** Le degré de la gamme majeure de l'armure où tombe la finale de chaque mode. */
export const DEGRE_DU_MODE: Record<ModeChoral, number> = { majeur: 0, dorien: 2, phrygien: 4, mixolydien: 7, mineur: 9 };

/** Les noms du MEI, où `ionian` et `aeolian` valent le majeur et le mineur. */
const MODES_MEI: Record<string, ModeChoral> = {
  major: "majeur", ionian: "majeur", minor: "mineur", aeolian: "mineur",
  dorian: "dorien", phrygian: "phrygien", mixolydian: "mixolydien",
};

const CLASSES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const ALTERATIONS: Record<string, number> = { s: 1, ss: 2, x: 2, f: -1, ff: -2, n: 0 };

/** La note la plus grave qui sonne à la dernière attaque, ou `null` pour une pièce sans note. */
export function basseFinale(s: Sequence): number | null {
  if (s.notes.length === 0) return null;
  const derniere = Math.max(...s.notes.map((n) => n.debut));
  return Math.min(...s.notes.filter((n) => n.debut <= derniere + 1e-9 && n.fin >= derniere + 1e-9 || n.debut === derniere).map((n) => n.note));
}

/**
 * La tonalité que disent l'armure, en quintes (dièses positifs, bémols négatifs), et la finale. `null`
 * pour une pièce sans note, et pour une finale lydienne ou locrienne.
 */
export function tonaliteDeLArmure(s: Sequence, quintes: number): TonaliteLue | null {
  const finale = basseFinale(s);
  if (finale === null) return null;
  const ecart = pc(finale - 7 * quintes);
  const mode = (Object.keys(DEGRE_DU_MODE) as ModeChoral[]).find((m) => DEGRE_DU_MODE[m] === ecart);
  return mode ? { tonique: pc(finale), mode, origine: "armure" } : null;
}

/** Une valeur d'attribut, sous son nom de `scoreDef` (`key.mode`) ou de `keySig` (`mode`). */
const attribut = (attrs: string, nom: string): string | undefined =>
  new RegExp(`\\b(?:key\\.)?${nom}="([^"]*)"`).exec(attrs)?.[1];

/**
 * La tonalité qu'un MEI écrit : la première `scoreDef`, `staffDef` ou `keySig` qui porte un mode.
 * Sa tonique vient de son nom de note quand il est écrit, sinon de l'armure et du mode. `null` quand
 * rien n'écrit de mode, ou un mode qu'aucun nœud n'offre.
 */
export function tonaliteDuMei(mei: string): TonaliteLue | null {
  for (const m of mei.matchAll(/<(?:scoreDef|staffDef|keySig)\b([^>]*)>/g)) {
    const attrs = m[1];
    const ecrit = attribut(attrs, "mode");
    if (!ecrit) continue;
    const mode = MODES_MEI[ecrit.toLowerCase()];
    if (!mode) return null;
    const pname = attribut(attrs, "pname")?.toLowerCase();
    if (pname && pname in CLASSES) {
      return { tonique: pc(CLASSES[pname] + (ALTERATIONS[attribut(attrs, "accid") ?? "n"] ?? 0)), mode, origine: "armure" };
    }
    const sig = /^(\d+)([sf])$/.exec(attribut(attrs, "sig") ?? "");
    const quintes = attribut(attrs, "sig") === "0" ? 0 : sig ? Number(sig[1]) * (sig[2] === "s" ? 1 : -1) : null;
    if (quintes !== null) return { tonique: pc(7 * quintes + DEGRE_DU_MODE[mode]), mode, origine: "armure" };
  }
  return null;
}
