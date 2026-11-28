// audio/soundhelix-accords.ts — Les accords de SoundHelix : trois sons, un nom, un registre.
//
// D'APRÈS SoundHelix 0.9 (Thomas Schürger), réécrit depuis la description de son modèle, sans
// rien en recopier : décision D1 du chantier, 2026-11-28.
//
// UN ACCORD EST TOUJOURS TROIS HAUTEURS DISTINCTES, triées, à moins d'une octave de la plus basse à
// la plus haute. Les hauteurs se comptent en demi-tons depuis le do central, 0 ; c'est la
// transposition finale du morceau qui en fait des notes MIDI.
//
// LA GRAMMAIRE DES NOMS N'EST PAS CELLE DE L'USAGE, et c'est le piège de ce module : un chiffre
// final dit le RENVERSEMENT, non une note ajoutée. `Am6` est la mineur au second renversement, mi à
// la basse, et `Am4` au premier, do à la basse. `G7` n'a que trois sons, sol, si et fa, sans la
// quinte. Décision D4 : le réglage lit cette grammaire, pour que les motifs écrits pour SoundHelix
// se collent tels quels ; ce que le nœud affiche est en symboles usuels.
//
// LE REGISTRE place la note la plus basse de l'accord nommé entre `registre − 12` et
// `registre − 1` : c'est le `crossoverPitch` de SoundHelix. Il s'applique à la basse de l'accord tel
// qu'il est renversé, non à sa fondamentale.

/** Trois hauteurs triées, de la plus basse à la plus haute. */
export type AccordSH = readonly [number, number, number];

/** Une faute d'accord, qui nomme ce qu'elle n'a pas su lire, en français et en anglais. */
export class FauteAccord extends Error {
  readonly en: string;
  constructor(message: string, en: string) {
    super(message);
    this.en = en;
  }
}

/** Les huit formes, par leurs deux intervalles au-dessus de la fondamentale, dans l'ordre de leur lecture. */
const FORMES: readonly (readonly [string, number, number])[] = [
  ["", 4, 7], ["m", 3, 7], ["7", 4, 10], ["m7", 3, 10],
  ["aug", 4, 8], ["dim", 3, 6], ["sus4", 5, 7], ["sus2", 2, 7],
];

const DIESES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BEMOLS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

type Renversement = "aucun" | "premier" | "second";

/** Un nom lu : la classe de la basse, et les deux intervalles au-dessus d'elle. */
interface NomLu { basse: number; i1: number; i2: number }

const cleForme = (i1: number, i2: number) => i1 * 100 + i2;

/**
 * Les noms connus, et le renversement de chaque forme d'intervalles.
 *
 * UNE MÊME FORME PEUT ÊTRE DEUX RENVERSEMENTS : do-fa-sol est `Csus4` en position fondamentale, et
 * `Fsus26`, fa sus2 au second renversement. La forme garde la DERNIÈRE lecture inscrite, sus2 étant
 * lue après sus4 : do-fa-sol se normalise donc en fa-sol-do. Les accords augmentés, eux, ont trois
 * renversements de même forme, et la dernière inscrite est la position fondamentale : ils ne se
 * normalisent jamais.
 */
function construireTables() {
  const noms = new Map<string, NomLu>();
  const renversements = new Map<number, Renversement>();
  for (let i = 0; i < 12; i++) {
    for (const [suffixe, d1, d2] of FORMES) {
      for (const racine of new Set([DIESES[i], BEMOLS[i]])) {
        noms.set(racine + suffixe, { basse: i, i1: d1, i2: d2 });
        noms.set(`${racine + suffixe}6`, { basse: (i + d2) % 12, i1: 12 - d2, i2: d1 + 12 - d2 });
        noms.set(`${racine + suffixe}4`, { basse: (i + d1) % 12, i1: d2 - d1, i2: 12 - d1 });
      }
    }
  }
  for (const [, d1, d2] of FORMES) {
    renversements.set(cleForme(12 - d2, d1 + 12 - d2), "second");
    renversements.set(cleForme(d2 - d1, 12 - d1), "premier");
    renversements.set(cleForme(d1, d2), "aucun");
  }
  return { noms, renversements };
}

const TABLES = construireTables();

/** Trois hauteurs en accord : triées, distinctes, à moins d'une octave. */
export function creerAccord(a: number, b: number, c: number): AccordSH {
  const [l, m, h] = [a, b, c].sort((x, y) => x - y);
  if (l === m || m === h) throw new FauteAccord(`deux hauteurs égales dans ${a}:${b}:${c}`, `two equal pitches in ${a}:${b}:${c}`);
  if (h - l >= 12) throw new FauteAccord(`${a}:${b}:${c} dépasse l'octave`, `${a}:${b}:${c} spans more than an octave`);
  return [l, m, h];
}

/** Lit un nom (`Am`, `Dm6`, `Bbaug`, `Esus44`) ou trois hauteurs (`-7:-3:4`), dans le registre donné. */
export function lireAccordSH(nom: string, registre: number): AccordSH {
  const explicite = /^(-?\d+):(-?\d+):(-?\d+)$/.exec(nom);
  if (explicite) return creerAccord(Number(explicite[1]), Number(explicite[2]), Number(explicite[3]));
  const lu = TABLES.noms.get(nom);
  if (!lu) throw new FauteAccord(`accord inconnu : « ${nom} »`, `unknown chord: « ${nom} »`);
  const basse = lu.basse >= registre ? lu.basse - 12 : lu.basse;
  return [basse, basse + lu.i1, basse + lu.i2];
}

/** La basse passe à l'octave au-dessus. */
export const monterAccord = (c: AccordSH): AccordSH => creerAccord(c[0] + 12, c[1], c[2]);

/** Le haut passe à l'octave au-dessous. */
export const descendreAccord = (c: AccordSH): AccordSH => creerAccord(c[0], c[1], c[2] - 12);

export const accordsEgaux = (a: AccordSH, b: AccordSH): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** L'accord ramené à sa position fondamentale, quand sa forme en dit une. */
export function normaliserAccord(c: AccordSH): AccordSH {
  const r = TABLES.renversements.get(cleForme(c[1] - c[0], c[2] - c[0]));
  if (r === "second") return monterAccord(c);
  if (r === "premier") return descendreAccord(c);
  return c;
}

export const egauxNormalises = (a: AccordSH, b: AccordSH): boolean =>
  accordsEgaux(a, b) || accordsEgaux(normaliserAccord(a), normaliserAccord(b));

/**
 * Le renversement de l'accord, à l'octave près, dont la note du milieu est la plus proche de celle
 * de la cible. À distance égale, le premier rencontré l'emporte : le moins déplacé.
 */
export function rapprocherAccord(c: AccordSH, cible: AccordSH): AccordSH {
  const but = cible[1];
  if (c[1] === but) return c;
  const monter = c[1] < but;
  let meilleur = c;
  let ecart = Math.abs(but - c[1]);
  let courant = c;
  do {
    courant = monter ? monterAccord(courant) : descendreAccord(courant);
    const d = Math.abs(but - courant[1]);
    if (d < ecart) { ecart = d; meilleur = courant; }
  } while (monter ? courant[1] < but : courant[1] > but);
  return meilleur;
}

/**
 * La hauteur que désigne un décalage sur l'accord : 0, 1, 2 la basse, le milieu et le haut ; 3 la
 * basse une octave plus haut ; −1 le haut une octave plus bas.
 */
export function hauteurSurAccord(c: AccordSH, decalage: number): number {
  const rang = ((decalage % 3) + 3) % 3;
  const octaves = Math.trunc((decalage < 0 ? decalage - 2 : decalage) / 3);
  return 12 * octaves + c[rang];
}

/** L'accord contient-il cette classe de hauteur, à l'octave près ? */
export const accordContient = (c: AccordSH, hauteur: number): boolean =>
  c.some((p) => (((hauteur - p) % 12) + 12) % 12 === 0);

/** Le début du nom d'un accord est-il une note, ce qui le distingue d'un renvoi de table ? */
export const commenceParUneNote = (nom: string): boolean => /^[A-G]/.test(nom);
