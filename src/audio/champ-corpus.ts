// audio/champ-corpus.ts — Les colonnes qu'un corpus donne à apprendre, ramenées en do majeur ou en la mineur.
//
// UNE COLONNE PAR PAS DE LA GRILLE où les quatre voix sonnent, chacune à la hauteur qu'elle tient à
// cet instant. Une colonne où une voix se tait, ou sort des bornes, n'est pas gardée, et la suivante
// ne la suit pas : un passage ne s'apprend que d'une colonne vraie à la suivante.
//
// LA TONALITÉ DE RÉFÉRENCE EST DO MAJEUR OU LA MINEUR, et chaque pièce y est transposée du plus petit
// écart, entre une quarte augmentée vers le bas et une quarte vers le haut, sa tonalité lue disant de
// combien. Un modèle appris en do s'applique en ré en décalant les hauteurs de la même façon.

import type { Corpus } from "./corpus";
import type { Sequence } from "./sequence";
import { TESSITURES_SATB } from "./tessitures-satb";
import { NB_VOIX, type DonneesChamp } from "./champ-paires";

export type ModeChamp = "majeur" | "mineur";

/** La tonique de référence d'un mode : do en majeur, la en mineur. */
export const TONIQUE_REFERENCE: Record<ModeChamp, number> = { majeur: 0, mineur: 9 };

/** Les bornes d'un modèle : l'étendue de Bach dans ses chorals, élargie d'une tierce mineure de chaque côté. */
export const BORNES_CHAMP: readonly (readonly [number, number])[] = TESSITURES_SATB.map((t) => [t.entiere[0] - 3, t.entiere[1] + 3] as const);

/** Le décalage qui mène de `tonique` à `reference`, entre -6 et +5 demi-tons. */
export function decalageVers(tonique: number, reference: number): number {
  const d = (((reference - tonique) % 12) + 12) % 12;
  return d > 5 ? d - 12 : d;
}

/** Les colonnes d'une séquence à quatre voix sur une grille de `pas` noires, décalées de `decalage`. */
export function colonnesDeLaSequence(s: Sequence, pas: number, decalage: number, bornes = BORNES_CHAMP): { hauteurs: number[] | null; debut: number }[] {
  const tempo = s.tempo && s.tempo > 0 ? s.tempo : 120;
  const duree = (60 / tempo) * pas;
  const fin = Math.max(0, ...s.notes.map((n) => n.fin));
  const parVoix = Array.from({ length: NB_VOIX }, (_, v) => s.notes.filter((n) => (n.voix ?? 0) === v));
  const colonnes: { hauteurs: number[] | null; debut: number }[] = [];
  for (let k = 0; k * duree < fin - 1e-9; k++) {
    const t = k * duree + 1e-9;
    const hauteurs: number[] = [];
    for (let v = 0; v < NB_VOIX; v++) {
      const n = parVoix[v].find((x) => x.debut <= t && x.fin > t);
      const h = n ? Math.round(n.note) + decalage : NaN;
      if (!(h >= bornes[v][0] && h <= bornes[v][1])) break;
      hauteurs.push(h);
    }
    colonnes.push({ hauteurs: hauteurs.length === NB_VOIX ? hauteurs : null, debut: k * duree });
  }
  return colonnes;
}

/** Ce qu'un corpus donne : les colonnes d'apprentissage et de validation, et ce qui a été écarté. */
export interface ColonnesDuCorpus {
  apprentissage: DonneesChamp;
  validation: DonneesChamp;
  piecesGardees: number;
  piecesValidation: number;
  /** Les pièces écartées, nommées avec leur raison. */
  ecartees: string[];
  /** Les colonnes perdues dans les pièces gardées, une voix s'y taisant ou sortant des bornes. */
  colonnesPerdues: number;
}

/**
 * Les colonnes d'un corpus. Une pièce compte si elle a quatre voix et une tonalité du mode demandé.
 * `validation` dit quelles pièces sont mises de côté, par leur rang dans le corpus.
 */
export function colonnesDuCorpus(corpus: Corpus, mode: ModeChamp, pas: number, validation: ReadonlySet<number>): ColonnesDuCorpus {
  const blocs = { apprentissage: [] as number[][][], validation: [] as number[][][] };
  const ecartees: string[] = [];
  let piecesGardees = 0, piecesValidation = 0, colonnesPerdues = 0;
  corpus.pieces.forEach((p, rang) => {
    const voix = new Set(p.sequence.notes.map((n) => n.voix ?? 0));
    if (voix.size !== NB_VOIX || [...voix].some((v) => v < 0 || v >= NB_VOIX)) { ecartees.push(`${p.source} · ${voix.size} voix`); return; }
    if (!p.tonalite) { ecartees.push(`${p.source} · tonalité inconnue`); return; }
    if (p.tonalite.mode !== mode) { ecartees.push(`${p.source} · ${p.tonalite.mode}`); return; }
    const colonnes = colonnesDeLaSequence(p.sequence, pas, decalageVers(p.tonalite.tonique, TONIQUE_REFERENCE[mode]));
    // Une pièce se coupe en suites de colonnes contiguës, chacune apprise pour elle-même.
    const suites: number[][][] = [[]];
    for (const c of colonnes) {
      if (c.hauteurs) suites[suites.length - 1].push(c.hauteurs);
      else { colonnesPerdues++; if (suites[suites.length - 1].length) suites.push([]); }
    }
    const cible = validation.has(rang) ? blocs.validation : blocs.apprentissage;
    cible.push(...suites.filter((s) => s.length > 0));
    piecesGardees++;
    if (validation.has(rang)) piecesValidation++;
  });
  return { apprentissage: enDonnees(blocs.apprentissage), validation: enDonnees(blocs.validation), piecesGardees, piecesValidation, ecartees, colonnesPerdues };
}

/** Des suites de colonnes en données : les états, et la première colonne de chaque suite qui ne suit rien. */
function enDonnees(suites: number[][][]): DonneesChamp {
  const T = suites.reduce((s, x) => s + x.length, 0);
  const etats = new Int16Array(T * NB_VOIX), suit = new Uint8Array(T);
  let t = 0;
  for (const suite of suites) {
    suite.forEach((hauteurs, k) => {
      for (let v = 0; v < NB_VOIX; v++) etats[t * NB_VOIX + v] = hauteurs[v] - BORNES_CHAMP[v][0];
      suit[t] = k > 0 ? 1 : 0;
      t++;
    });
  }
  return { etats, suit };
}
