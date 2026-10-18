// audio/zones-vers-midi.ts — Des zones datées deviennent des notes.
//
// TROIS DÉCISIONS, ET CHACUNE RÉPOND À UNE PROPRIÉTÉ DE CE QUI ARRIVE ICI.
//
//  1. LA HAUTEUR D'UNE ZONE SE PREND SUR SA MÉDIANE, ET NON À SON DÉBUT. Le début d'une zone
//     découpée aux attaques est un transitoire ou une consonne, là où un suivi de hauteur ne
//     trouve rien : la courbe y vaut zéro. Une note posée sur cette seule valeur serait sans
//     hauteur une fois sur deux. La médiane des valeurs non nulles de la zone donne la hauteur
//     tenue, celle qui s'entend.
//
//  2. ZÉRO VEUT DIRE « AUCUNE HAUTEUR », ET NON « LA PLUS GRAVE ». Une courbe de hauteur porte
//     zéro là où rien n'est voisé, et la même valeur zéro pour sa borne basse ; les deux ne se
//     distinguent pas. Le choix est fait du côté de l'absence : une zone dont toutes les valeurs
//     sont nulles n'a pas de hauteur, et prend la note fixe plutôt qu'une note grave inventée.
//     Le compte de ces zones ressort, pour que ce choix soit visible.
//
//  3. LA GAMME NE S'APPLIQUE QU'À LA HAUTEUR LUE. Une note fixe est celle que l'on a demandée :
//     la plier sur une gamme déplacerait un réglage explicite, ce qui n'arrive jamais ailleurs
//     dans le catalogue.
import { degrePlusProche } from "./correction-hauteur";
import type { Courbe } from "./courbe";
import type { Note } from "./note";

export interface ZoneEntrante {
  /** Le début, en secondes. */
  debut: number;
  /** La durée, en secondes. */
  duree: number;
  /** Le niveau efficace, en dB pleine échelle, quand la zone en porte un. */
  sonie?: number;
}

export interface ReglagesZonesMidi {
  /** D'où vient la hauteur : de la courbe reçue, ou du réglage. */
  source: "courbe" | "fixe";
  noteFixe: number;
  /** La note que vaut le zéro de la courbe. */
  noteMin: number;
  /** La note que vaut le un de la courbe. */
  noteMax: number;
  /** Les degrés permis, en classes de hauteur. Vide : aucune contrainte. */
  degres: readonly number[];
  /** D'où vient la nuance : du niveau de la zone, ou du réglage. */
  velocite: "sonie" | "fixe";
  velociteFixe: number;
  canal: number;
}

export interface SuiteDeZones {
  notes: Note[];
  /** Combien de zones n'ont donné aucune hauteur et ont pris la note fixe. */
  sansHauteur: number;
  /** Combien de zones ne portaient pas de niveau et ont pris la nuance fixe. */
  sansSonie: number;
}

/** Le niveau au-dessous duquel la nuance est au minimum, en dB pleine échelle. */
export const SONIE_PLANCHER_DB = -60;

/** La durée minimale d'une note écrite, en secondes. Une note sans durée ne s'entend pas. */
const DUREE_MIN_S = 0.01;

const borneNote = (n: number): number => Math.max(0, Math.min(127, Math.round(n)));

/**
 * La hauteur tenue sur une zone, entre 0 et 1, ou `null` quand la zone n'en porte aucune.
 *
 * La médiane plutôt que la moyenne : une seule trame fausse, sautée d'une octave, déplace une
 * moyenne et ne déplace pas une médiane.
 */
export function hauteurDeZone(c: Courbe, debut: number, duree: number): number | null {
  const de = Math.max(0, Math.round(debut * c.cadence));
  const a = Math.min(c.valeurs.length, Math.max(de + 1, Math.round((debut + duree) * c.cadence)));
  const tenues: number[] = [];
  for (let i = de; i < a; i++) if (c.valeurs[i] > 0) tenues.push(c.valeurs[i]);
  if (tenues.length === 0) return null;
  tenues.sort((x, y) => x - y);
  return tenues[(tenues.length - 1) >> 1];
}

/** La nuance d'un niveau, de 1 à 127, linéaire en décibels depuis le plancher. */
export function nuanceDeSonie(db: number): number {
  const part = (db - SONIE_PLANCHER_DB) / -SONIE_PLANCHER_DB;
  return Math.max(1, Math.min(127, Math.round(1 + part * 126)));
}

/** Les zones utilisables : un début et une durée finis, une durée positive, dans l'ordre du temps. */
export function zonesRetenues(zones: readonly unknown[]): ZoneEntrante[] {
  return zones
    .filter((z): z is ZoneEntrante => {
      const o = z as ZoneEntrante | null;
      return !!o && Number.isFinite(o.debut) && Number.isFinite(o.duree)
        && o.debut >= 0 && o.duree > 0;
    })
    .slice()
    .sort((x, y) => x.debut - y.debut);
}

/** Une note par zone : son début, sa durée, sa hauteur et sa nuance. */
export function notesDesZones(
  zones: readonly ZoneEntrante[], hauteur: Courbe | null, r: ReglagesZonesMidi,
): SuiteDeZones {
  const notes: Note[] = [];
  let sansHauteur = 0;
  let sansSonie = 0;
  for (const z of zones) {
    let note = borneNote(r.noteFixe);
    if (r.source === "courbe") {
      const v = hauteur ? hauteurDeZone(hauteur, z.debut, z.duree) : null;
      if (v === null) sansHauteur++;
      else note = borneNote(degrePlusProche(borneNote(r.noteMin + v * (r.noteMax - r.noteMin)), r.degres));
    }
    const parLaSonie = r.velocite === "sonie" && typeof z.sonie === "number" && Number.isFinite(z.sonie);
    if (r.velocite === "sonie" && !parLaSonie) sansSonie++;
    notes.push({
      note,
      velocite: parLaSonie
        ? nuanceDeSonie(z.sonie as number)
        : Math.max(1, Math.min(127, Math.round(r.velociteFixe))),
      debut: z.debut,
      fin: z.debut + Math.max(DUREE_MIN_S, z.duree),
      canal: Math.max(0, Math.min(15, Math.round(r.canal))),
    });
  }
  return { notes, sansHauteur, sansSonie };
}

/** Le tableau que la sortie « Notes » rend : une ligne par zone. */
export function tableauDesZones(
  zones: readonly ZoneEntrante[], notes: readonly Note[], en: boolean,
): string {
  const lignes = [
    en ? "start     dur.   note   vel." : "début     durée  note   nuance",
    ...notes.map((n, i) => {
      const z = zones[i];
      return `${n.debut.toFixed(2).padStart(6)}  ${(z ? z.duree : 0).toFixed(2).padStart(6)}  `
        + `${String(n.note).padStart(4)}  ${String(n.velocite).padStart(5)}`;
    }),
  ];
  return lignes.join("\n");
}
