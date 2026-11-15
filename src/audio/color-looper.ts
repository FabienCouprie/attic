// audio/color-looper.ts — Séquenceur pas-à-pas où chaque pas est une couleur.
// La couleur choisit la note (teinte → degré, luminosité → octave).

import { rgbToHsl, hexToRgb } from "./couleurs";
import { notesVersFichierMidi } from "./midi-ecriture";
import { rendreSequence, type NoteEvenement } from "./midi-sequence";
import { degresDesAccords, degresGammeAccords, degreAccordProche } from "./generation";
import { demiTonDeCle } from "./cles";

export interface OptionsColorLooper {
  couleurs: string;
  cle: string;
  gamme: string;
  octave: number;
  portee: number;
  mode: "melodie" | "harmonie" | "arpeges" | "roule";
  tempo: number;
  dureeNote: number; // fraction d'un temps
  mesures: number;
  modeRendu: "FM/Oscillateurs" | "SoundFont";
  instrument: number;
  volume: number;
}

// LA CLÉ SE LIT DANS LA TABLE COMMUNE, `audio/cles.ts` : une table privée en dièses seuls jouait Mi♭
// et Si♭ en do.

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

function noteDepuisCouleur(rgb: { r: number; g: number; b: number }, cle: string, gamme: string, octave: number, portee: number): number {
  const [h, , l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const intervals = degresGammeAccords(gamme);
  const cleIdx = demiTonDeCle(cle) ?? 0;
  const base = (octave + 1) * 12 + cleIdx;
  const deg = Math.floor((h / 360) * intervals.length) % intervals.length;
  const semi = intervals[deg];
  const octOffset = Math.min(portee - 1, Math.floor(l * portee));
  return Math.max(0, Math.min(127, base + semi + octOffset * 12));
}

// Tierce et quinte les plus proches dans la gamme choisie (au lieu d'une
// triade majeure/mineure figée) : généralise correctement aux modes
// (quinte diminuée du Locrien...) et aux gammes qui n'ont pas de degré à
// exactement 2/4 crans d'écart (pentatoniques, blues, chromatique).
function triadeGamme(gamme: string): number[] {
  const intervals = degresDesAccords(gamme);
  return [0, degreAccordProche(intervals, 0, 4), degreAccordProche(intervals, 0, 7)];
}

export function genererNotesColorLooper(options: OptionsColorLooper): NoteEvenement[] {
  const couleurs = parseCouleurs(options.couleurs);
  const notes: NoteEvenement[] = [];
  const stepDur = 60 / Math.max(1, options.tempo);
  const noteDur = Math.max(0.05, stepDur * options.dureeNote);
  const triade = triadeGamme(options.gamme);
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
    } else if (options.mode === "arpeges" || options.mode === "roule") {
      // LE ROULÉ PART COMME L'ARPÈGE, sur tout le pas, et tient chaque note jusqu'au bout du pas.
      const subDur = stepDur / triade.length;
      for (const [i, offset] of triade.entries()) {
        const debutArp = step * stepDur + i * subDur;
        const finArp = options.mode === "roule" ? (step + 1) * stepDur : debutArp + subDur;
        notes.push({ note: Math.max(0, Math.min(127, root + offset)), velocite, debut: debutArp, fin: finArp });
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
