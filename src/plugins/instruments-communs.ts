// plugins/instruments-communs.ts — Ce que partagent les nœuds d'instruments.
//
// Les modèles physiques et les synthèses exotiques rendent tous un signal mono, acceptent
// tous un MIDI facultatif en entrée, et jouent tous une note quand rien n'est branché.
// Ces quatre fonctions sont ce qui se répétait d'un fichier à l'autre.

import { parseMidi } from "midi-file";
import { analyserMidi } from "../audio";

export const FREQUENCE_ECH = 44100;

export interface NoteJouee { note: number; velocite: number; debut: number; fin: number }

/** Lit un MIDI d'entrée, ou rend null si rien n'est branché. */
export async function notesDuMidi(fichier: unknown): Promise<NoteJouee[] | null> {
  if (!(fichier instanceof File)) return null;
  const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
  return notes.map((n) => ({
    note: n.note, velocite: n.velociete ?? 90, debut: n.debut, fin: n.fin,
  }));
}

export const frequenceDe = (note: number): number => 440 * 2 ** ((note - 69) / 12);

const NOMS_NOTES: Record<string, number> = {
  c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6, gb: 6,
  g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11,
};

/** Lit « A3 », « C#5 », « Eb2 ». Sans octave, l'octave 3 ; illisible, la note par défaut. */
export function lireNote(texte: string, defaut = 57): number {
  const m = /^([a-gA-G][#b]?)(-?\d+)?$/.exec(texte.trim());
  if (!m) return defaut;
  const octave = m[2] === undefined ? 3 : parseInt(m[2], 10);
  return (NOMS_NOTES[m[1].toLowerCase()] ?? 9) + (octave + 1) * 12;
}

/** Ajoute un signal mono dans un mélange, à l'instant demandé. */
export function melanger(cible: Float32Array, source: Float32Array, debut: number): void {
  const depart = Math.max(0, Math.floor(debut * FREQUENCE_ECH));
  const n = Math.min(source.length, cible.length - depart);
  for (let i = 0; i < n; i++) cible[depart + i] += source[i];
}

/**
 * Range un signal mono dans un buffer stéréo, normalisé puis mis au volume demandé.
 *
 * La normalisation est faite ici et non dans les modèles, parce qu'un mélange de plusieurs
 * notes dépasse forcément l'amplitude d'une seule.
 */
export function versBuffer(mono: Float32Array, volume: number): AudioBuffer {
  let crete = 0;
  for (let i = 0; i < mono.length; i++) crete = Math.max(crete, Math.abs(mono[i]));
  const g = (crete > 0.001 ? 0.9 / crete : 1) * Math.max(0, Math.min(1, volume / 100));
  const buffer = new AudioBuffer({
    numberOfChannels: 2, length: Math.max(1, mono.length), sampleRate: FREQUENCE_ECH,
  });
  const gauche = buffer.getChannelData(0), droite = buffer.getChannelData(1);
  for (let i = 0; i < mono.length; i++) {
    const x = mono[i] * g;
    gauche[i] = x;
    droite[i] = x;
  }
  return buffer;
}
