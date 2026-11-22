// audio/noms-de-notes.ts — Le seul lecteur des noms de notes, « A4 », « E#3 », « Sib2 », « Ré#4 ».
//
// LA REVUE DES NOTATIONS EN TEXTE, septième format, 2026-11-22. Sept lecteurs lisaient les noms de
// notes, chacun avec sa table, son octave par défaut et sa façon d'échouer : `lireNote` faisait de
// « E#4 », « Fb4 » et « Cb4 » un la, et remplaçait « C##4 », « C♯4 » ou « Do4 » par la note par
// défaut, sans un mot ; d'autres jetaient le nom, rendaient une sortie vide ou l'erreur brute d'une
// bibliothèque. Décisions de Fabien du 2026-11-22 : les noms français se lisent partout, et une note
// sans octave est refusée là où une hauteur est attendue.
//
// CE QUI EST LU : une lettre de A à G, ou un nom français, Do, Ré (ou Re), Mi, Fa, Sol, La, Si, en
// majuscules ou en minuscules ; une altération, #, ##, b, bb, ♯, ♯♯, ♭, ♭♭ ; une octave, de -1 à 9,
// le do 4 étant le do central, MIDI 60. Les orthographes justes le restent : E#4 est un fa, Cb4 un si
// de l'octave du dessous, B#3 le do central.

import { traduire } from "../i18n";

const LETTRES: Record<string, { lettre: string; classe: number }> = {
  c: { lettre: "C", classe: 0 }, d: { lettre: "D", classe: 2 }, e: { lettre: "E", classe: 4 }, f: { lettre: "F", classe: 5 },
  g: { lettre: "G", classe: 7 }, a: { lettre: "A", classe: 9 }, b: { lettre: "B", classe: 11 },
  do: { lettre: "C", classe: 0 }, ré: { lettre: "D", classe: 2 }, re: { lettre: "D", classe: 2 }, mi: { lettre: "E", classe: 4 },
  fa: { lettre: "F", classe: 5 }, sol: { lettre: "G", classe: 7 }, la: { lettre: "A", classe: 9 }, si: { lettre: "B", classe: 11 },
};
const ALTERATIONS: Record<string, number> = { "": 0, "#": 1, "##": 2, "♯": 1, "♯♯": 2, b: -1, bb: -2, "♭": -1, "♭♭": -2 };
const NOM = /^(do|ré|re|mi|fa|sol|la|si|[a-g])(##|#|bb|b|♯♯|♯|♭♭|♭)?(-1|\d)?$/i;

/** Un nom lu : la lettre (en anglais), l'altération en demi-tons, l'octave si elle est écrite, la classe. */
export type NomDeNote = { lettre: string; alteration: number; octave: number | null; classe: number };

/** Lit un nom de note, ou null. */
export function lireNomDeNote(texte: string): NomDeNote | null {
  const m = NOM.exec(texte.trim());
  if (!m) return null;
  const base = LETTRES[m[1].toLowerCase()];
  const alteration = ALTERATIONS[m[2] ?? ""];
  return { lettre: base.lettre, alteration, octave: m[3] === undefined ? null : Number(m[3]), classe: (((base.classe + alteration) % 12) + 12) % 12 };
}

/** La hauteur MIDI d'un nom lu qui porte son octave ; l'altération peut franchir l'octave, Cb4 = 59. */
export const midiDuNom = (n: NomDeNote): number | null =>
  n.octave === null ? null : (n.octave + 1) * 12 + LETTRES[n.lettre.toLowerCase()].classe + n.alteration;

/** Le nom écrit à l'anglaise, que Tonal et Tone.js lisent : « D#3 » pour « Ré#3 ». */
export const nomAnglais = (n: NomDeNote): string =>
  `${n.lettre}${n.alteration > 0 ? "#".repeat(n.alteration) : "b".repeat(-n.alteration)}${n.octave ?? ""}`;

/**
 * La hauteur d'un nom, là où une hauteur est attendue, ou le refus qui le nomme : illisible, ou sans
 * octave. C'est ce que lit le réglage « Note » d'un instrument.
 */
export function hauteurOuRefus(texte: string): { midi: number; nom: NomDeNote } | { refus: string } {
  const nom = lireNomDeNote(texte);
  if (!nom) return { refus: traduire("msg.note.illisible_var_0", texte.trim()) };
  const midi = midiDuNom(nom);
  if (midi === null) return { refus: traduire("msg.note.sans_octave_var_0", texte.trim()) };
  return { midi, nom };
}

/** Les mots d'une suite qui ne sont ni un nom de note ni, si `chiffres`, une classe en chiffres. */
export function nomsIllisibles(texte: string, chiffres = false): string[] {
  return texte.split(/[\s,;]+/).filter(Boolean).filter((mot) => !lireNomDeNote(mot) && !(chiffres && /^-?\d+$/.test(mot)));
}

/** Le refus d'une suite dont des mots ne se lisent pas, chacun nommé, ou null. */
export function refusDeSuite(texte: string, chiffres = false): string | null {
  const illisibles = nomsIllisibles(texte, chiffres);
  return illisibles.length > 0 ? traduire("msg.note.illisibles_var_0", illisibles.slice(0, 6).join(" » « ")) : null;
}
