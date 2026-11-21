// audio/color-looper.ts — Séquenceur pas-à-pas où chaque pas est une couleur.
// La couleur choisit la note (teinte → degré, luminosité → octave).

import { rgbToHsl, hexToRgb } from "./couleurs";
import { notesVersFichierMidi } from "./midi-ecriture";
import { rendreSequence, type NoteEvenement } from "./midi-sequence";
import { degresDesAccords, degresGammeAccords } from "./generation";
import { demiTonDeCle } from "./cles";
import { triadeDuDegre } from "./triades-gamme";

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

/**
 * La note d'une couleur, et l'écart de son degré à la tonique.
 *
 * EN ACCORDS, LA TEINTE CHOISIT PARMI LES DEGRÉS D'ACCORD, et non parmi tous ceux de la gamme : un
 * accord ne se bâtit pas sur la note de passage de la bebop dominante, décision de Fabien du
 * 2026-11-15. La mélodie, elle, la joue.
 */
function noteDepuisCouleur(
  rgb: { r: number; g: number; b: number }, cle: string, gamme: string, octave: number, portee: number, enAccord: boolean,
): { note: number; semi: number } {
  const [h, , l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const intervals = enAccord ? degresDesAccords(gamme) : degresGammeAccords(gamme);
  const cleIdx = demiTonDeCle(cle) ?? 0;
  const base = (octave + 1) * 12 + cleIdx;
  const deg = Math.floor((h / 360) * intervals.length) % intervals.length;
  const semi = intervals[deg];
  const octOffset = Math.min(portee - 1, Math.floor(l * portee));
  return { note: Math.max(0, Math.min(127, base + semi + octOffset * 12)), semi };
}

// LA TRIADE SE BÂTIT SUR LE DEGRÉ DE CHAQUE COULEUR, un degré sur deux dans la gamme
// (`triades-gamme.ts`). Elle se calculait une seule fois, sur la tonique, puis se posait sur chaque
// fondamentale : en mi bémol majeur, l'accord sur fa sortait fa, la, do, sous 22 gammes sur 25 hors
// de la gamme, relevé par le banc des gammes le 2026-11-21. Le commentaire d'alors la disait
// « généralisée aux modes ».

export function genererNotesColorLooper(options: OptionsColorLooper): NoteEvenement[] {
  const couleurs = parseCouleurs(options.couleurs);
  const notes: NoteEvenement[] = [];
  const stepDur = 60 / Math.max(1, options.tempo);
  const noteDur = Math.max(0.05, stepDur * options.dureeNote);
  const totalSteps = couleurs.length * Math.max(1, options.mesures);
  const enAccord = options.mode !== "melodie";
  const degresAccords = degresDesAccords(options.gamme);

  for (let step = 0; step < totalSteps; step++) {
    const c = couleurs[step % couleurs.length];
    const { note: root, semi } = noteDepuisCouleur(c, options.cle, options.gamme, options.octave, options.portee, enAccord);
    const triade = enAccord ? triadeDuDegre(degresAccords, semi) : [0];
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
