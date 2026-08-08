// audio/mandelbrot.ts — Génère une mélodie depuis l'ensemble de Mandelbrot.
// Chaque note est produite à partir d'un point c du plan complexe ; le nombre
// d'itérations avant divergence (ou le temps de séjour) détermine la hauteur,
// la vélocité et/ou l'octave.

import { notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi } from "./midi";
import { DEMI_TONS_CLE } from "./commun";
import { degresGammeMelodie } from "./generation";

export type ModeMandelbrot = "escape" | "dwell" | "octave";

export interface OptionsMandelbrot {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  maxIter: number;
  mode: ModeMandelbrot;
  nbNotes: number;
  dureeNote: number; // secondes
  tempo: number;
  cle: string;
  gamme: string;
  octaveBase: number;
  sensibilite: number;
  timbre: "Douce" | "Brillante" | "Percutante";
  volume: number;
  graine: number;
  instrument?: number;
  banque?: number;
}

function creerRng(graine: number) {
  let s = graine >>> 0;
  if (s === 0) s = 123456789;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function itererMandelbrot(cx: number, cy: number, maxIter: number): number {
  let x = 0, y = 0, x2 = 0, y2 = 0;
  let i = 0;
  while (i < maxIter && x2 + y2 <= 4) {
    y = 2 * x * y + cy;
    x = x2 - y2 + cx;
    x2 = x * x;
    y2 = y * y;
    i++;
  }
  return i;
}

function snapperNote(degre: number, decalageCle: number, degresGamme: number[], octaveBase: number): number {
  const octaveDelta = Math.floor(degre / degresGamme.length);
  const idx = ((degre % degresGamme.length) + degresGamme.length) % degresGamme.length;
  return Math.max(0, Math.min(127, octaveBase + decalageCle + degresGamme[idx] + octaveDelta * 12));
}

function echantillonnerPoints(
  xMin: number, xMax: number, yMin: number, yMax: number,
  nbNotes: number,
  graine: number
): { x: number; y: number }[] {
  const rng = creerRng(graine);
  const points: { x: number; y: number }[] = [];
  const cols = Math.ceil(Math.sqrt(nbNotes));
  const rows = Math.ceil(nbNotes / cols);
  let idx = 0;
  for (let r = 0; r < rows && idx < nbNotes; r++) {
    for (let c = 0; c < cols && idx < nbNotes; c++) {
      const nx = (c + 0.5 + (rng() - 0.5) * 0.4) / cols;
      const ny = (r + 0.5 + (rng() - 0.5) * 0.4) / rows;
      points.push({
        x: xMin + nx * (xMax - xMin),
        y: yMin + ny * (yMax - yMin),
      });
      idx++;
    }
  }
  return points;
}

export function genererNotesMandelbrot(options: OptionsMandelbrot) {
  const {
    xMin, xMax, yMin, yMax, maxIter, mode, nbNotes, dureeNote,
    cle, gamme, octaveBase, sensibilite, tempo,
  } = options;

  const points = echantillonnerPoints(xMin, xMax, yMin, yMax, nbNotes, options.graine);
  const degresGamme = degresGammeMelodie(gamme);
  const decalageCle = DEMI_TONS_CLE[cle] ?? 0;
  const notes = [];

  // dureeNote est exprimée en fraction de temps (1 = 1 temps/noire, 0.5 = croche, ...).
  // Le tempo (BPM) donne la durée réelle d'un temps.
  const dureeTemps = 60 / Math.max(1, tempo);
  const dureeNoteReelle = Math.max(0.01, dureeNote * dureeTemps);

  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i];
    const escape = itererMandelbrot(x, y, maxIter);
    const bounded = escape >= maxIter;
    const t = i; // temps en nombre de notes
    const debut = t * dureeNoteReelle;
    const fin = debut + dureeNoteReelle * 0.9;

    let midiNote: number;
    let velocite: number;

    if (mode === "escape") {
      // Plus le point diverge vite, plus la note est haute/forte.
      const degre = Math.floor(escape * sensibilite);
      midiNote = snapperNote(degre, decalageCle, degresGamme, octaveBase);
      velocite = bounded ? 60 : Math.min(127, 60 + Math.floor((escape / maxIter) * 67));
    } else if (mode === "dwell") {
      // Les points de l'ensemble (divergence lente) sont les notes les plus fortes.
      const ratio = escape / maxIter;
      const degre = Math.floor(ratio * sensibilite * degresGamme.length);
      midiNote = snapperNote(degre, decalageCle, degresGamme, octaveBase);
      velocite = Math.min(127, 60 + Math.floor((1 - ratio) * 67));
    } else {
      // octave : la position y choisit l'octave, l'escape choisit le degré.
      const oct = Math.floor(((y - yMin) / (yMax - yMin)) * 3);
      const degre = Math.floor(escape * sensibilite);
      midiNote = snapperNote(degre, decalageCle, degresGamme, octaveBase + oct * 12);
      velocite = bounded ? 60 : Math.min(127, 80 + Math.floor((escape / maxIter) * 47));
    }

    if (Number.isFinite(midiNote)) {
      notes.push({ note: midiNote, velocite, debut, fin });
    }
  }

  return notes;
}

export async function genererMusiqueMandelbrot(
  options: OptionsMandelbrot,
  modeSynthese: "Automatique" | "FM/Oscillateurs" | "SoundFont"
): Promise<{ audio: AudioBuffer; notes: any[]; midiFile: File }> {
  const notes = genererNotesMandelbrot(options);
  const midiFile = await appliquerInstrumentMidi(notesVersFichierMidi(notes, options.tempo), options.instrument ?? 0);
  const useSf2 = modeSynthese === "SoundFont" || (modeSynthese === "Automatique" && (globalThis as any).__attic_sf2__);
  const mode: "FM/Oscillateurs" | "SoundFont" = useSf2 ? "SoundFont" : "FM/Oscillateurs";
  const audio = await rendreSequence(notes, mode, options.volume, options.instrument ?? 0, options.banque ?? 0);
  return { audio, notes, midiFile };
}
