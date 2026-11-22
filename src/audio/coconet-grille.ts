// audio/coconet-grille.ts — Une séquence posée sur la grille de Coconet, et la grille rendue en notes.
//
// CE QUE COCONET LIT. Un rouleau de piano à quatre voix, une case par double-croche et par voix,
// quarante-six hauteurs du do 1 (MIDI 36) au la 4 (MIDI 81), une seule hauteur au plus par case. Il
// ne connaît ni les secondes, ni les attaques : une note tenue sur huit cases et huit notes
// répétées s'y écrivent de la même façon. C'est la forme sur laquelle il a été entraîné, les chorals
// de Bach à la double-croche (Huang et al., « Counterpoint by Convolution », ISMIR 2017).
//
// POURQUOI CE MODULE PASSE AVANT LA BIBLIOTHÈQUE, ET NE PASSE PAS PAR ELLE. `Coconet.infill` lit
// une `NoteSequence` quantifiée et en tire la grille lui-même. Trois défauts relevés dans son code
// (`@magenta/music` 1.23.1, `coconet/model.js` et `coconet_utils.js`) le rendent impropre ici :
// la voix vient du champ `instrument`, que la copie protobuf remet à zéro, de sorte que les quatre
// voix d'une entrée tombaient sur le soprano ; une hauteur hors de 36 à 81 lève une `TypeError`
// sans nom ; et une température nulle devient 0,99 par un `||`. La grille se construit donc ici,
// en nombres, et le réseau la reçoit telle quelle (`plugins/coconet-helpers.ts`).
//
// CE QUI RESTE INTACT. Les voix gardées ressortent avec leurs notes d'origine, à l'échantillon près :
// la grille ne sert qu'à les montrer au réseau. Seules les voix engendrées sont refaites à partir des
// cases, et c'est pour elles seules que la liaison des notes répétées se règle.
//
// CE MODULE EST PUR : ni TensorFlow, ni Web Audio, ni traduction. Il se charge dans le worker comme
// sur le fil principal, et se teste sans modèle.

import type { Note } from "./note";
import type { Sequence } from "./sequence";

/** La plus grave des hauteurs que le réseau connaît, et leur nombre. */
export const COCONET_GRAVE = 36;
export const COCONET_HAUTEURS = 46;
export const COCONET_AIGU = COCONET_GRAVE + COCONET_HAUTEURS - 1;
/** Soprano, alto, ténor, basse : l'ordre du corpus d'entraînement. */
export const COCONET_VOIX = 4;
/** La grille est à la double-croche. */
export const PAS_PAR_NOIRE = 4;
/** Une case vide de la grille. */
export const SILENCE = -1;

/** Ce que le nœud garde de l'entrée : le seul soprano, ou toutes les voix reçues. */
export type VoixGardees = "soprano" | "toutes";

export interface GrilleCoconet {
  /** Le nombre de cases dans le temps. */
  pas: number;
  /** La hauteur de chaque case, `SILENCE` si elle est vide ; la case (t, v) est à `t * 4 + v`. */
  hauteurs: Int16Array;
  /** 1 pour une case que le réseau doit remplir, 0 pour une case gardée. */
  masque: Uint8Array;
  /** Les voix gardées, telles qu'elles portent sur la grille (0 à 3). */
  gardees: number[];
  /** La durée d'une case, en secondes. */
  dureePas: number;
  /** Les notes dont le début ou la fin a bougé pour tomber sur une case. */
  deplacees: number;
  /** Les cases d'une voix gardée où deux notes sonnaient : la plus aiguë a été gardée. */
  recouvertes: number;
  /** Les notes reçues sur une voix que le réglage ne garde pas, et qui seront remplacées. */
  remplacees: number;
}

/** Une entrée que la grille ne peut pas porter, et pourquoi. */
export interface RefusGrille {
  /** Les notes hors de 36 à 81, dans l'ordre du temps. */
  horsEtendue: Note[];
  /** Les numéros de voix au-delà de la quatrième, quand toutes les voix sont gardées. */
  voixEnTrop: number[];
  /** Aucune note dans les voix gardées. */
  vide: boolean;
}

const voixDeNote = (n: Note): number => n.voix ?? 0;

/** Les notes que le réglage garde, chacune avec la voix qu'elle occupe sur la grille. */
function notesGardees(seq: Sequence, voixGardees: VoixGardees): { note: Note; voix: number }[] {
  return seq.notes
    .filter((n) => (voixGardees === "soprano" ? voixDeNote(n) === 0 : true))
    .map((n) => ({ note: n, voix: voixDeNote(n) }));
}

/**
 * Pose une séquence sur la grille, ou dit pourquoi elle ne s'y pose pas.
 *
 * LE REFUS EST ENTIER ET NOMMÉ. Une seule note hors de l'étendue du réseau fait refuser la pièce,
 * chaque note fautive étant rendue à l'appelant pour qu'il la nomme. Transposer en silence, ou
 * écarter la note, changerait la mélodie qu'on a demandé d'harmoniser.
 */
export function grilleDepuisSequence(
  seq: Sequence,
  voixGardees: VoixGardees,
  tempo: number,
): GrilleCoconet | RefusGrille {
  const gardees = notesGardees(seq, voixGardees);
  const horsEtendue = gardees
    .map((g) => g.note)
    .filter((n) => Math.round(n.note) < COCONET_GRAVE || Math.round(n.note) > COCONET_AIGU)
    .sort((a, b) => a.debut - b.debut);
  const voixEnTrop = [...new Set(gardees.map((g) => g.voix).filter((v) => v >= COCONET_VOIX))].sort((a, b) => a - b);
  if (gardees.length === 0 || horsEtendue.length > 0 || voixEnTrop.length > 0) {
    return { horsEtendue, voixEnTrop, vide: gardees.length === 0 };
  }

  const dureePas = 60 / Math.max(1, tempo) / PAS_PAR_NOIRE;
  const caseDe = (t: number) => Math.max(0, Math.round(t / dureePas));
  let deplacees = 0;
  const posees = gardees.map((g) => {
    const debut = caseDe(g.note.debut);
    const fin = Math.max(debut + 1, caseDe(g.note.fin));
    if (Math.abs(debut * dureePas - g.note.debut) > 1e-3 || Math.abs(fin * dureePas - g.note.fin) > 1e-3) deplacees++;
    return { hauteur: Math.round(g.note.note), voix: g.voix, debut, fin };
  });
  const pas = Math.max(1, ...posees.map((p) => p.fin), seq.duree !== undefined ? caseDe(seq.duree) : 0);

  const hauteurs = new Int16Array(pas * COCONET_VOIX).fill(SILENCE);
  const voixGardeesSurGrille = [...new Set(posees.map((p) => p.voix))].sort((a, b) => a - b);
  let recouvertes = 0;
  // Les plus graves d'abord : la plus aiguë écrase, et c'est elle qu'on garde d'un accord dans une voix.
  for (const p of [...posees].sort((a, b) => a.hauteur - b.hauteur)) {
    for (let t = p.debut; t < p.fin; t++) {
      const i = t * COCONET_VOIX + p.voix;
      if (hauteurs[i] !== SILENCE) recouvertes++;
      hauteurs[i] = p.hauteur;
    }
  }
  const masque = new Uint8Array(pas * COCONET_VOIX);
  for (let v = 0; v < COCONET_VOIX; v++) {
    if (voixGardeesSurGrille.includes(v)) continue;
    for (let t = 0; t < pas; t++) masque[t * COCONET_VOIX + v] = 1;
  }
  const remplacees = voixGardees === "soprano" ? seq.notes.filter((n) => voixDeNote(n) !== 0).length : 0;
  return { pas, hauteurs, masque, gardees: voixGardeesSurGrille, dureePas, deplacees, recouvertes, remplacees };
}

export const estRefus = (g: GrilleCoconet | RefusGrille): g is RefusGrille => "horsEtendue" in g;

/**
 * Rend en notes ce que le réseau a écrit, les voix gardées reprenant leurs notes d'origine.
 *
 * UNE CASE OÙ AUCUNE VOIX GARDÉE NE SONNE RESTE MUETTE POUR TOUTES. Le réseau écrit une hauteur dans
 * chaque case qu'on lui donne, silence compris : sans cette règle, un soupir du soprano serait
 * comblé par les trois autres voix, ce que le corpus ne fait pas.
 *
 * `lier` DÉCIDE DES CASES RÉPÉTÉES. Liée, une suite de cases de même hauteur fait une seule note ;
 * déliée, elle est coupée à chaque noire, ce qui refrappe une note tenue sur chaque temps.
 */
export function sequenceDepuisGrille(
  ecrites: Int16Array,
  grille: GrilleCoconet,
  recue: Sequence,
  voixGardees: VoixGardees,
  lier: boolean,
): Note[] {
  const { pas, dureePas, gardees } = grille;
  const notes: Note[] = notesGardees(recue, voixGardees).map(({ note, voix }) => ({ ...note, voix }));
  const sonneGardee = (t: number) =>
    gardees.some((v) => grille.hauteurs[t * COCONET_VOIX + v] !== SILENCE);
  const velociteA = (t: number): number => {
    const instant = t * dureePas + 1e-6;
    const n = notes.find((x) => x.debut <= instant && x.fin > instant);
    return n?.velocite ?? 80;
  };
  for (let v = 0; v < COCONET_VOIX; v++) {
    if (gardees.includes(v)) continue;
    let debut = -1;
    let hauteur = SILENCE;
    const fermer = (t: number) => {
      if (debut >= 0 && hauteur !== SILENCE) {
        notes.push({ note: hauteur, velocite: velociteA(debut), debut: debut * dureePas, fin: t * dureePas, voix: v });
      }
      debut = -1;
      hauteur = SILENCE;
    };
    for (let t = 0; t < pas; t++) {
      const h = sonneGardee(t) ? ecrites[t * COCONET_VOIX + v] : SILENCE;
      const coupe = !lier && t % PAS_PAR_NOIRE === 0;
      if (h !== hauteur || coupe) {
        fermer(t);
        if (h !== SILENCE) { debut = t; hauteur = h; }
      }
    }
    fermer(pas);
  }
  return notes.sort((a, b) => a.debut - b.debut || (a.voix ?? 0) - (b.voix ?? 0));
}
