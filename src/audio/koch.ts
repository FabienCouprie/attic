// audio/koch.ts — Arpégiateur flocon de Koch : chaque côté du triangle est une voix,
// chaque subdivision récursive génère un motif mélodique polyrythmique.

import { notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi } from "./midi";
import { DEMI_TONS_CLE } from "./commun";

export type AccordKoch = "Majeur" | "Mineur" | "Augmenté" | "Diminué" | "Sus4";
export type DirectionKoch = "alternée" | "extérieure" | "intérieure";

export interface OptionsArpegeKoch {
  cle: string;
  gamme: string;
  octave: number;
  accord: AccordKoch;
  profondeur: number;
  direction: DirectionKoch;
  hauteur: number; // demi-tons, hauteur du pic de Koch
  tempo: number;
  mesures: number;
  dureeNote: number; // secondes (durée max d'une note)
  timbre: "Douce" | "Brillante" | "Percutante";
  volume: number;
  instrument?: number;
  banque?: number;
}

const GAMMES: Record<string, number[]> = {
  "Majeur": [0, 2, 4, 5, 7, 9, 11],
  "Mineur naturel": [0, 2, 3, 5, 7, 8, 10],
  "Mineur harmonique": [0, 2, 3, 5, 7, 8, 11],
  "Pentatonique majeure": [0, 2, 4, 7, 9],
  "Pentatonique mineure": [0, 3, 5, 7, 10],
  "Chromatique": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

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
  const a = subdiviserKoch(start, m1, depth - 1, direction, hauteur);
  const b = subdiviserKoch(m1, peak, depth - 1, -direction, hauteur);
  const c = subdiviserKoch(peak, m2, depth - 1, -direction, hauteur);
  const d = subdiviserKoch(m2, end, depth - 1, direction, hauteur);
  return [...a, ...b, ...c, ...d];
}

export function genererNotesKoch(options: OptionsArpegeKoch) {
  const {
    cle, gamme, octave, accord, profondeur, direction, hauteur,
    tempo, mesures, dureeNote,
  } = options;
  const degresGamme = GAMMES[gamme] ?? GAMMES["Majeur"];
  const decalageCle = DEMI_TONS_CLE[cle] ?? 0;
  const intervalles = INTERVALLES_ACCORD[accord] ?? INTERVALLES_ACCORD["Majeur"];
  const octaveBase = (octave + 1) * 12;
  const fondamentale = octaveBase + decalageCle;
  const notesAccord = intervalles.map((interval) => fondamentale + interval);

  // Les trois côtés du triangle : fondamentale→3e, 3e→5e, 5e→fondamentale (octave supérieure).
  const cotes = [
    [notesAccord[0], notesAccord[1]],
    [notesAccord[1], notesAccord[2]],
    [notesAccord[2], notesAccord[0] + 12],
  ];

  const mesureDuree = (60 / Math.max(1, tempo)) * 4;
  const dureeTotale = mesureDuree * Math.max(1, mesures);
  const notes: { note: number; velocite: number; debut: number; fin: number }[] = [];

  cotes.forEach(([start, end], idx) => {
    let dir = 1;
    if (direction === "intérieure") dir = -1;
    else if (direction === "alternée") dir = idx % 2 === 0 ? 1 : -1;

    const raw = subdiviserKoch(start, end, Math.max(0, Math.min(6, profondeur)), dir, hauteur);
    raw.push(end);
    const nb = raw.length;
    const step = dureeTotale / Math.max(1, nb);
    const noteDur = Math.min(step * 0.85, Math.max(0.03, dureeNote));

    for (let i = 0; i < nb; i++) {
      const midi = snapperNote(raw[i], degresGamme);
      const debut = i * step;
      const fin = debut + noteDur;
      notes.push({ note: midi, velocite: 80 + idx * 10, debut, fin });
    }
  });

  return { notes, dureeTotale };
}

export async function genererArpegeKoch(
  options: OptionsArpegeKoch,
  modeSynthese: "Automatique" | "FM/Oscillateurs" | "SoundFont" = "Automatique",
): Promise<{ audio: AudioBuffer; notes: any[]; midiFile: File }> {
  const { notes } = genererNotesKoch(options);
  const midiFile = await appliquerInstrumentMidi(notesVersFichierMidi(notes, options.tempo), options.instrument ?? 0);
  const useSf2 = modeSynthese === "SoundFont" || (modeSynthese === "Automatique" && (globalThis as any).__attic_sf2__);
  const mode: "FM/Oscillateurs" | "SoundFont" = useSf2 ? "SoundFont" : "FM/Oscillateurs";
  const audio = await rendreSequence(notes, mode, options.volume, options.instrument ?? 0, options.banque ?? 0);
  return { audio, notes, midiFile };
}


