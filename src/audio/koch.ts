// audio/koch.ts — Arpégiateur flocon de Koch : chaque côté du triangle est une voix,
// chaque subdivision récursive génère un motif mélodique polyrythmique.

import { notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi } from "./midi";
import { DEMI_TONS_CLE } from "./commun";
import { degresGammeMelodie } from "./generation";
import { caractereTimbre } from "./timbres";

export type AccordKoch = "Majeur" | "Mineur" | "Augmenté" | "Diminué" | "Sus4";
export type DirectionKoch = "alternée" | "extérieure" | "intérieure";

export interface OptionsArpegeKoch {
  cle: string;
  gamme: string;
  octave: number;
  accord: AccordKoch;
  profondeur: number;
  direction: DirectionKoch;
  hauteur: number; // demi-tons, hauteur du premier pic
  tempo: number;
  /** Nombre de cycles complets du flocon. */
  repetitions: number;
  /** Part du pas de chaque note qui sonne, de 0,1 à 1. */
  articulation: number;
  /** Deux notes consécutives identiques d'une même voix : liées en une seule, ou rejouées. */
  notesRepetees: "liees" | "rejouees";
  timbre: string;
  volume: number;
  instrument?: number;
  banque?: number;
}

/** Profondeur maximale : au-delà, le cycle de la voix la plus lente dépasserait la demi-heure. */
export const PROFONDEUR_MAX = 5;

const INTERVALLES_ACCORD: Record<AccordKoch, number[]> = {
  Majeur: [0, 4, 7],
  Mineur: [0, 3, 7],
  Augmenté: [0, 4, 8],
  Diminué: [0, 3, 6],
  Sus4: [0, 5, 7],
};

export function snapperNote(midi: number, degresGamme: number[]): number {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  let closest = degresGamme[0];
  let minDist = Infinity;
  for (const deg of degresGamme) {
    const d = Math.min(Math.abs(deg - pc), 12 - Math.abs(deg - pc));
    if (d < minDist) {
      minDist = d;
      closest = deg;
    }
  }
  const octave = Math.floor((midi - closest) / 12);
  return Math.max(0, Math.min(127, octave * 12 + closest));
}

/**
 * La subdivision de Koch appliquée à un intervalle de hauteurs : le segment est coupé en trois, et
 * le tiers central remplacé par un pic. Chaque sous-segment reçoit le même traitement, avec un pic
 * TROIS FOIS PLUS PETIT — c'est ce qui fait l'autosimilarité du flocon : chaque niveau reproduit le
 * motif au tiers de sa taille. Rend les débuts des 4^profondeur segments.
 */
export function subdiviserKoch(
  start: number,
  end: number,
  depth: number,
  direction: number,
  hauteur: number,
): number[] {
  if (depth <= 0) return [start];
  const m1 = start + (end - start) / 3;
  const m2 = start + (2 * (end - start)) / 3;
  const peak = (m1 + m2) / 2 + direction * hauteur;
  const h = hauteur / 3;
  const a = subdiviserKoch(start, m1, depth - 1, direction, h);
  const b = subdiviserKoch(m1, peak, depth - 1, -direction, h);
  const c = subdiviserKoch(peak, m2, depth - 1, -direction, h);
  const d = subdiviserKoch(m2, end, depth - 1, direction, h);
  return [...a, ...b, ...c, ...d];
}

/**
 * Les trois voix sont trois NIVEAUX du même flocon, joués ensemble sur un cycle commun.
 *
 * La première voix (fondamentale → tierce) est subdivisée à la profondeur demandée et joue en
 * doubles-croches ; la deuxième (tierce → quinte) un niveau plus haut, quatre fois plus lente ; la
 * troisième (quinte → octave) deux niveaux plus haut, seize fois plus lente. Les trois finissent
 * ensemble : un cycle dure 4^profondeur doubles-croches. On entend le motif et ses réductions à la
 * fois — une polyrythmie 1 : 4 : 16, qui est l'autosimilarité même du flocon rendue audible.
 *
 * Le pas est fixé par le tempo, et non la durée totale : une profondeur plus grande allonge le cycle
 * au lieu de tasser des milliers de notes dans la même mesure.
 */
export function genererNotesKoch(options: OptionsArpegeKoch) {
  const {
    cle, gamme, octave, accord, direction, hauteur, tempo,
  } = options;
  const profondeur = Math.max(1, Math.min(PROFONDEUR_MAX, Math.round(options.profondeur)));
  const repetitions = Math.max(1, Math.round(options.repetitions ?? 1));
  const articulation = Math.max(0.1, Math.min(1, options.articulation ?? 0.85));
  const lier = (options.notesRepetees ?? "liees") === "liees";
  const degresGamme = degresGammeMelodie(gamme);
  const decalageCle = DEMI_TONS_CLE[cle] ?? 0;
  const intervalles = INTERVALLES_ACCORD[accord] ?? INTERVALLES_ACCORD["Majeur"];
  const fondamentale = (octave + 1) * 12 + decalageCle;
  const notesAccord = intervalles.map((interval) => fondamentale + interval);

  // Les trois côtés du triangle : fondamentale→3e, 3e→5e, 5e→fondamentale (octave supérieure).
  const cotes = [
    [notesAccord[0], notesAccord[1]],
    [notesAccord[1], notesAccord[2]],
    [notesAccord[2], notesAccord[0] + 12],
  ];

  const doubleCroche = 60 / Math.max(1, tempo) / 4;
  const cycle = Math.pow(4, profondeur) * doubleCroche;
  const dureeTotale = cycle * repetitions;
  const notes: { note: number; velocite: number; debut: number; fin: number }[] = [];

  cotes.forEach(([start, end], idx) => {
    let dir = 1;
    if (direction === "intérieure") dir = -1;
    else if (direction === "alternée") dir = idx % 2 === 0 ? 1 : -1;
    const niveau = Math.max(0, profondeur - idx);
    const motif = subdiviserKoch(start, end, niveau, dir, hauteur).map((h) => snapperNote(h, degresGamme));
    const pas = cycle / motif.length;
    // Les hauteurs de la voix sur tous les cycles, puis la note d'arrivée qui clôt le dernier.
    const suite: number[] = [];
    for (let r = 0; r < repetitions; r++) suite.push(...motif);
    suite.push(snapperNote(end, degresGamme));
    let k = 0;
    while (k < suite.length) {
      let n = 1;
      if (lier) while (k + n < suite.length - 1 && suite[k + n] === suite[k]) n++;
      const debut = k * pas;
      notes.push({ note: suite[k], velocite: 80 + idx * 10, debut, fin: debut + n * pas * articulation });
      k += n;
    }
  });

  // La note d'arrivée de chaque voix dure un pas de cette voix : la plus lente, la troisième, fixe la fin.
  const pasLePlusLent = cycle / Math.pow(4, Math.max(0, profondeur - 2));
  return { notes, dureeTotale: dureeTotale + pasLePlusLent };
}

export async function genererArpegeKoch(
  options: OptionsArpegeKoch,
  modeSynthese: "Automatique" | "FM/Oscillateurs" | "SoundFont" = "Automatique",
): Promise<{ audio: AudioBuffer; notes: any[]; midiFile: File }> {
  const { notes } = genererNotesKoch(options);
  const midiFile = await appliquerInstrumentMidi(notesVersFichierMidi(notes, options.tempo), options.instrument ?? 0);
  const useSf2 = modeSynthese === "SoundFont" || (modeSynthese === "Automatique" && (globalThis as any).__attic_sf2__);
  const mode: "FM/Oscillateurs" | "SoundFont" = useSf2 ? "SoundFont" : "FM/Oscillateurs";
  const audio = await rendreSequence(notes, mode, options.volume, options.instrument ?? 0, options.banque ?? 0, caractereTimbre(options.timbre));
  return { audio, notes, midiFile };
}


