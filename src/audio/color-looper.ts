// audio/color-looper.ts — Séquenceur pas-à-pas où chaque pas est une couleur.
// La couleur choisit la note (teinte → degré, luminosité → octave).

import { rgbToHsl, hexToRgb } from "./couleurs";
import { notesVersFichierMidi, rendreSequence, type NoteEvenement } from "./midi";

export interface OptionsColorLooper {
  couleurs: string;
  cle: string;
  gamme: string;
  octave: number;
  portee: number;
  mode: "melodie" | "harmonie";
  tempo: number;
  dureeNote: number; // fraction d'un temps
  mesures: number;
  modeRendu: "FM/Oscillateurs" | "SoundFont";
  instrument: number;
  volume: number;
}

const GAMMES: Record<string, number[]> = {
  majeur: [0, 2, 4, 5, 7, 9, 11],
  mineur: [0, 2, 3, 5, 7, 8, 10],
  "pentatonique majeur": [0, 2, 4, 7, 9],
  "pentatonique mineur": [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatique: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function rgbTextToRgb(texte: string): { r: number; g: number; b: number } | null {
  const match = texte.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/);
  if (!match) return null;
  return {
    r: Math.max(0, Math.min(255, parseInt(match[1], 10))),
    g: Math.max(0, Math.min(255, parseInt(match[2], 10))),
    b: Math.max(0, Math.min(255, parseInt(match[3], 10))),
  };
}

export function parseCouleurs(texte: string): { r: number; g: number; b: number }[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of texte) {
    if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (depth === 0 && (ch === "," || ch === ";" || ch === "|")) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  const result: { r: number; g: number; b: number }[] = [];
  for (const p of tokens) {
    const fromHex = hexToRgb(p);
    if (fromHex) {
      result.push(fromHex);
      continue;
    }
    const fromRgb = rgbTextToRgb(p);
    if (fromRgb) {
      result.push(fromRgb);
      continue;
    }
    // Fallback gris si non reconnu
    result.push({ r: 128, g: 128, b: 128 });
  }
  if (result.length === 0) {
    result.push({ r: 128, g: 128, b: 128 });
  }
  return result;
}

function intervallesGamme(nom: string): number[] {
  return GAMMES[nom] ?? GAMMES["majeur"];
}

function noteDepuisCouleur(rgb: { r: number; g: number; b: number }, cle: string, gamme: string, octave: number, portee: number): number {
  const [h, , l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const intervals = intervallesGamme(gamme);
  const cleIdx = Math.max(0, NOTES.indexOf(cle));
  const base = (octave + 1) * 12 + cleIdx;
  const deg = Math.floor((h / 360) * intervals.length) % intervals.length;
  const semi = intervals[deg];
  const octOffset = Math.min(portee - 1, Math.floor(l * portee));
  return Math.max(0, Math.min(127, base + semi + octOffset * 12));
}

function estGammeMajeure(gamme: string): boolean {
  const g = gamme.toLowerCase();
  return g.includes("majeur") || g === "chromatique";
}

export function genererNotesColorLooper(options: OptionsColorLooper): NoteEvenement[] {
  const couleurs = parseCouleurs(options.couleurs);
  const notes: NoteEvenement[] = [];
  const stepDur = 60 / Math.max(1, options.tempo);
  const noteDur = Math.max(0.05, stepDur * options.dureeNote);
  const triade = estGammeMajeure(options.gamme) ? [0, 4, 7] : [0, 3, 7];
  const totalSteps = couleurs.length * Math.max(1, options.mesures);

  for (let step = 0; step < totalSteps; step++) {
    const c = couleurs[step % couleurs.length];
    const root = noteDepuisCouleur(c, options.cle, options.gamme, options.octave, options.portee);
    const velocite = Math.max(40, Math.min(120, Math.round(40 + rgbToHsl(c.r, c.g, c.b)[1] * 80)));
    const debut = step * stepDur;
    const fin = debut + noteDur;
    if (options.mode === "harmonie") {
      for (const offset of triade) {
        notes.push({ note: Math.max(0, Math.min(127, root + offset)), velocite, debut, fin });
      }
    } else {
      notes.push({ note: root, velocite, debut, fin });
    }
  }
  return notes;
}

export async function genererColorLooper(options: OptionsColorLooper): Promise<{ audio: AudioBuffer; midi: File; notes: NoteEvenement[] }> {
  const notes = genererNotesColorLooper(options);
  const { programme, banque } = decodeInstrument(options.instrument);
  const audio = await rendreSequence(notes, options.modeRendu, options.volume, programme, banque);
  const midi = notes.length > 0 ? notesVersFichierMidi(notes, options.tempo, 0, banque, programme) : new File([], "loop.mid", { type: "audio/midi" });
  return { audio, midi, notes };
}

function decodeInstrument(valeur: number): { programme: number; banque: number } {
  if (valeur < 0) return { programme: -1, banque: -1 };
  const programme = Math.max(0, Math.min(127, Math.round(valeur % 128)));
  const banque = Math.max(0, Math.floor(valeur / 128));
  return { programme, banque };
}
