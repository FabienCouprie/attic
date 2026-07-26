// audio/automate-cellulaire.ts — Génération musicale par automate cellulaire 1D.
// Chaque génération de l'automate devient un pas temporel. Les cellules actives
// sont projetées sur une gamme choisie pour produire des notes (polyphonie ou
// mélodie).

import { DEMI_TONS_CLE } from "./commun";
import { notesVersFichierMidi, rendreSequence, type NoteEvenement } from "./midi";

const GAMMES: Record<string, number[]> = {
  "Majeur": [0, 2, 4, 5, 7, 9, 11],
  "Mineur naturel": [0, 2, 3, 5, 7, 8, 10],
  "Mineur harmonique": [0, 2, 3, 5, 7, 8, 11],
  "Pentatonique majeure": [0, 2, 4, 7, 9],
  "Pentatonique mineure": [0, 3, 5, 7, 10],
  "Chromatique": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

function snapperNote(midi: number, degres: number[]): number {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  let closest = degres[0];
  let minDist = Infinity;
  for (const deg of degres) {
    const d = Math.min(Math.abs(deg - pc), 12 - Math.abs(deg - pc));
    if (d < minDist) {
      minDist = d;
      closest = deg;
    }
  }
  const octave = Math.floor((midi - closest) / 12);
  return Math.max(0, Math.min(127, octave * 12 + closest));
}

function randomSeed(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function appliquerRegle1D(ligne: number[], regle: number): number[] {
  const n = ligne.length;
  const suivante = Array.from<number>({ length: n }).fill(0);
  for (let i = 0; i < n; i++) {
    const l = ligne[(i - 1 + n) % n];
    const c = ligne[i];
    const r = ligne[(i + 1) % n];
    const idx = (l << 2) | (c << 1) | r;
    suivante[i] = (regle >> idx) & 1;
  }
  return suivante;
}

export interface OptionsAutomateCellulaire {
  regle: number;
  mode: "Polyphonie" | "Mélodie";
  largeur: number;
  generations: number;
  graine: number;
  cle: string;
  gamme: string;
  octave: number;
  dureeNote: number;
  velocite: number;
  volume: number;
  timbre: "FM/Oscillateurs" | "SoundFont";
}

export function genererNotesAutomateCellulaire(options: OptionsAutomateCellulaire): NoteEvenement[] {
  const regle = options.regle;
  const largeur = Math.max(4, Math.min(64, options.largeur));
  const generations = Math.max(4, Math.min(256, options.generations));
  const dureeNote = options.dureeNote;
  const degres = GAMMES[normaliserGamme(options.gamme)] ?? GAMMES["Pentatonique majeure"];
  const base = 12 + (options.octave * 12) + (DEMI_TONS_CLE[normaliserCle(options.cle)] ?? 0);
  const rnd = randomSeed(options.graine);

  let ligne: number[] = Array.from<number>({ length: largeur }).fill(0);
  if (options.graine === 0) {
    ligne[Math.floor(largeur / 2)] = 1;
  } else {
    for (let i = 0; i < largeur; i++) ligne[i] = rnd() < 0.3 ? 1 : 0;
  }

  const notes: NoteEvenement[] = [];
  for (let g = 0; g < generations; g++) {
    const actives = ligne.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (actives.length > 0) {
      const t = g * dureeNote;
      const fin = t + dureeNote;
      if (normaliserMode(options.mode) === "Mélodie") {
        const idx = actives[Math.floor(rnd() * actives.length)];
        const midi = snapperNote(base + idx, degres);
        notes.push({ note: midi, velocite: options.velocite, debut: t, fin });
      } else {
        // Polyphonie : limiter à 4 voix simultanées pour garder la clarté.
        const selection = actives.length > 4 ? actives.filter((_, i) => i % Math.ceil(actives.length / 4) === 0).slice(0, 4) : actives;
        for (const x of selection) {
          const midi = snapperNote(base + x, degres);
          notes.push({ note: midi, velocite: options.velocite, debut: t, fin });
        }
      }
    }
    ligne = appliquerRegle1D(ligne, regle);
  }
  return notes;
}

export async function genererAutomateCellulaire(options: OptionsAutomateCellulaire): Promise<{ audio: AudioBuffer; midi: File; notes: NoteEvenement[] }> {
  const notes = genererNotesAutomateCellulaire(options);
  const tempo = notes.length > 0 ? 60 / options.dureeNote : 120;
  const midiFile = notesVersFichierMidi(notes, tempo);
  let audio: AudioBuffer;
  try {
    audio = await rendreSequence(notes, options.timbre, options.volume);
  } catch (e) {
    if (options.timbre === "SoundFont") {
      audio = await rendreSequence(notes, "FM/Oscillateurs", options.volume);
    } else {
      throw e;
    }
  }
  return { audio, midi: midiFile, notes };
}

export function normaliserMode(v: string): "Polyphonie" | "Mélodie" {
  if (v === "Mélodie" || v === "Melody" || v === "melody") return "Mélodie";
  return "Polyphonie";
}

export function normaliserCle(v: string): string {
  const map: Record<string, string> = {
    Do: "Do", C: "Do",
    "Do#": "Do#", "C#": "Do#",
    Ré: "Ré", D: "Ré",
    "Mi♭": "Mi♭", Eb: "Mi♭",
    Mi: "Mi", E: "Mi",
    Fa: "Fa", F: "Fa",
    "Fa#": "Fa#", "F#": "Fa#",
    Sol: "Sol", G: "Sol",
    "Sol#": "Sol#", "G#": "Sol#",
    La: "La", A: "La",
    "Si♭": "Si♭", Bb: "Si♭",
    Si: "Si", B: "Si",
  };
  return map[v] ?? "Do";
}

export function normaliserGamme(v: string): string {
  const map: Record<string, string> = {
    Majeur: "Majeur", Major: "Majeur",
    "Mineur naturel": "Mineur naturel", "Natural minor": "Mineur naturel",
    "Pentatonique majeure": "Pentatonique majeure", "Major pentatonic": "Pentatonique majeure",
    "Pentatonique mineure": "Pentatonique mineure", "Minor pentatonic": "Pentatonique mineure",
    Chromatique: "Chromatique", Chromatic: "Chromatique",
  };
  return map[v] ?? "Pentatonique majeure";
}

export function normaliserTimbre(v: string): "FM/Oscillateurs" | "SoundFont" {
  if (v.includes("FM") || v.includes("Osc")) return "FM/Oscillateurs";
  return "SoundFont";
}

export { GAMMES };
