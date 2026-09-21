// audio/mandelbrot.ts — Génère une mélodie depuis l'ensemble de Mandelbrot.
// Chaque note est produite à partir d'un point c du plan complexe ; le nombre
// d'itérations avant divergence (ou le temps de séjour) détermine la hauteur,
// la vélocité et/ou l'octave.

import { notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi } from "./midi";
import { DEMI_TONS_CLE } from "./commun";
import { degresGammeMelodie } from "./generation";
import { caractereTimbre } from "./timbres";

export type ModeMandelbrot = "escape" | "dwell" | "octave";

export interface OptionsMandelbrot {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  maxIter: number;
  mode: ModeMandelbrot;
  nbNotes: number;
  dureeNote: number; // en fraction de temps (1 = une noire)
  tempo: number;
  cle: string;
  gamme: string;
  /** La note MIDI du Do de l'octave de base (Do4 = 60, comme les autres nœuds mélodiques). */
  octaveBase: number;
  /** Largeur de la plage de hauteurs : 1 = deux octaves de la gamme. */
  sensibilite: number;
  /** Ce que deviennent les points de l'ensemble lui-même, qui ne divergent jamais. */
  interieur?: "silence" | "tonique";
  timbre: string;
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

/**
 * Les points de la vue, sur une grille légèrement bousculée. Parcourus ligne par ligne, ou colonne
 * par colonne : le mode Octave prend l'octave de la hauteur dans l'image, et un parcours par lignes
 * la ferait simplement suivre le temps.
 */
function echantillonnerPoints(
  xMin: number, xMax: number, yMin: number, yMax: number,
  nbNotes: number, graine: number, parColonnes: boolean,
): { x: number; y: number; ny: number }[] {
  const rng = creerRng(graine);
  const points: { x: number; y: number; ny: number }[] = [];
  const cols = Math.ceil(Math.sqrt(nbNotes));
  const rows = Math.ceil(nbNotes / cols);
  const [externe, interne] = parColonnes ? [cols, rows] : [rows, cols];
  for (let e = 0; e < externe && points.length < nbNotes; e++) {
    for (let k = 0; k < interne && points.length < nbNotes; k++) {
      const [c, r] = parColonnes ? [e, k] : [k, e];
      const nx = (c + 0.5 + (rng() - 0.5) * 0.4) / cols;
      const ny = (r + 0.5 + (rng() - 0.5) * 0.4) / rows;
      points.push({ x: xMin + nx * (xMax - xMin), y: yMin + ny * (yMax - yMin), ny });
    }
  }
  return points;
}

/**
 * Le nombre d'itérations ramené à [0, 1] sur une échelle logarithmique. Presque tous les points
 * divergent en quelques itérations et seuls ceux du bord en demandent des centaines : sur une échelle
 * linéaire, les uns s'écraseraient en bas et les autres grimperaient sans fin. En logarithme, chaque
 * doublement du nombre d'itérations monte d'autant.
 */
export function iterationsNormalisees(escape: number, maxIter: number): number {
  // log(n) / log(max) : exactement 0 pour un point qui s'échappe à la première itération, 1 au
  // maximum — de quoi parcourir toute la plage de hauteurs, et toute celle des durées en Dwell.
  return Math.log(Math.max(1, escape)) / Math.log(Math.max(2, maxIter));
}

export function genererNotesMandelbrot(options: OptionsMandelbrot) {
  const {
    xMin, xMax, yMin, yMax, maxIter, mode, nbNotes, dureeNote,
    cle, gamme, octaveBase, sensibilite, tempo,
  } = options;
  const interieur = options.interieur ?? "silence";
  const points = echantillonnerPoints(xMin, xMax, yMin, yMax, nbNotes, options.graine, mode === "octave");
  const degresGamme = degresGammeMelodie(gamme);
  const decalageCle = DEMI_TONS_CLE[cle] ?? 0;
  const notes: { note: number; velocite: number; debut: number; fin: number }[] = [];

  // La durée d'une note en fraction de temps ; le tempo donne la durée réelle d'un temps.
  const pasBase = Math.max(0.01, dureeNote * (60 / Math.max(1, tempo)));
  // La plage de hauteurs : deux octaves de la gamme à sensibilité 1, jamais au-delà du clavier.
  const etendue = Math.max(1, Math.round(2 * degresGamme.length * Math.max(0.1, sensibilite)));

  let temps = 0;
  for (const { x, y, ny } of points) {
    const escape = itererMandelbrot(x, y, maxIter);
    const dedans = escape >= maxIter;
    const norme = iterationsNormalisees(escape, maxIter);
    // Dwell : la note s'attarde d'autant plus que le point a mis longtemps à diverger.
    const pas = mode === "dwell" && !dedans ? pasBase * (0.5 + 1.5 * norme) : pasBase;
    const debut = temps;
    temps += pas;

    if (dedans) {
      // L'ensemble lui-même : le noir de l'image. Silence — le bord de la fractale fait alors le
      // rythme — ou une basse tenue sur la tonique, une octave sous la base.
      if (interieur === "tonique") notes.push({ note: Math.max(0, octaveBase - 12 + decalageCle), velocite: 60, debut, fin: debut + pas * 0.95 });
      continue;
    }

    let midiNote: number;
    if (mode === "octave") {
      // L'octave vient de la hauteur dans l'image (le haut à l'aigu), le degré des itérations.
      const oct = Math.min(2, Math.floor(ny * 3));
      const degre = Math.min(degresGamme.length - 1, Math.floor(norme * degresGamme.length * Math.max(0.1, sensibilite)) % degresGamme.length);
      midiNote = snapperNote(degre, decalageCle, degresGamme, octaveBase + oct * 12);
    } else {
      midiNote = snapperNote(Math.min(etendue, Math.floor(norme * etendue)), decalageCle, degresGamme, octaveBase);
    }
    const velocite = Math.min(127, 60 + Math.round(norme * 67));
    notes.push({ note: midiNote, velocite, debut, fin: debut + pas * 0.9 });
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
  const audio = await rendreSequence(notes, mode, options.volume, options.instrument ?? 0, options.banque ?? 0, caractereTimbre(options.timbre));
  return { audio, notes, midiFile };
}
