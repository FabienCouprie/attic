// audio/automate-cellulaire.ts — Génération musicale par automate cellulaire.
// Supporte les automates 1D (règles 0–255) et 2D (Conway, Highlife) avec
// plusieurs topologies, modes de voix et mappings.

import { DEMI_TONS_CLE } from "./commun";
import { notesVersFichierMidi, rendreSequence, type NoteEvenement } from "./midi";
import { degresGammeMelodie } from "./generation";

const REGLES_1D_NOMS: Record<number, string> = {
  18: "18",
  22: "22",
  26: "26",
  30: "30",
  45: "45",
  54: "54",
  60: "60",
  62: "62",
  73: "73",
  90: "90",
  102: "102",
  105: "105",
  110: "110",
  122: "122",
  126: "126",
  150: "150",
  160: "160",
  184: "184",
  204: "204",
  225: "225",
  232: "232",
  240: "240",
  250: "250",
};

export const REGLES_1D = Object.keys(REGLES_1D_NOMS).map(Number).sort((a, b) => a - b);

export const REGLES_2D: Record<string, { naitre: number[]; survie: number[] }> = {
  "Conway": { naitre: [3], survie: [2, 3] },
  "Highlife": { naitre: [3, 6], survie: [2, 3] },
};

export type Topologie = "1D" | "2D Conway" | "2D Highlife";
export type ModeVoix = "Polyphonie" | "Mélodie" | "Arpège";
export type Mapping = "Hauteur" | "Vélocité" | "Durée" | "Hauteur + vélocité";

export interface OptionsAutomateCellulaire {
  regle: number;
  reglePersonnalisee: number;
  topologie: Topologie;
  modeVoix: ModeVoix;
  mapping: Mapping;
  largeur: number;
  hauteur: number;
  generations: number;
  graine: number;
  cle: string;
  gamme: string;
  octave: number;
  dureeNote: number;
  velocite: number;
  volume: number;
  timbre: "FM/Oscillateurs" | "SoundFont";
  instrument: number;
  probabilite: number;
  densiteMax: number;
}

export function normaliserTopologie(v: string): Topologie {
  const s = v.toLowerCase().replace(/\s+/g, " ");
  if (s.includes("highlife") || s.includes("high life")) return "2D Highlife";
  if (s.includes("conway") || s.includes("2d")) return "2D Conway";
  return "1D";
}

export function normaliserModeVoix(v: string): ModeVoix {
  const s = v.toLowerCase();
  if (s.includes("arp") || s.includes("arpège") || s.includes("arpegg")) return "Arpège";
  if (s.includes("mélodie") || s.includes("melody") || s.includes("lead")) return "Mélodie";
  return "Polyphonie";
}

export function normaliserMapping(v: string): Mapping {
  const s = v.toLowerCase();
  if (s.includes("durée") || s.includes("duration") || s.includes("longueur")) return "Durée";
  if (
    (s.includes("hauteur") || s.includes("pitch") || s.includes("note")) &&
    (s.includes("vélocité") || s.includes("velocity") || s.includes("intensité") || s.includes("+"))
  ) return "Hauteur + vélocité";
  if (s.includes("vélocité") || s.includes("velocity") || s.includes("intensité")) return "Vélocité";
  return "Hauteur";
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
    "Mi♭": "Mi♭", Eb: "Mi♭", "D#": "Mi♭",
    Mi: "Mi", E: "Mi",
    Fa: "Fa", F: "Fa",
    "Fa#": "Fa#", "F#": "Fa#",
    Sol: "Sol", G: "Sol",
    "Sol#": "Sol#", "G#": "Sol#",
    La: "La", A: "La",
    "Si♭": "Si♭", Bb: "Si♭", "A#": "Si♭",
    Si: "Si", B: "Si",
  };
  return map[v] ?? "Do";
}

// Retourne l'id canonique attendu par degresGammeMelodie (audio/generation.ts) —
// accepte indifféremment l'ancien libellé français, anglais, ou un id déjà
// canonique (le paramètre "Gamme" a des optionIds : ctx.paramTexte renvoie
// donc déjà l'id canonique la plupart du temps — cette fonction reste
// idempotente pour ce cas, et gère aussi les valeurs brutes des anciens
// projets ou des appels directs, ex. les tests).
export function normaliserGamme(v: string): string {
  const map: Record<string, string> = {
    Majeur: "majeur", Major: "majeur", majeur: "majeur",
    "Mineur naturel": "mineur", "Natural minor": "mineur", mineur: "mineur",
    "Mineur harmonique": "mineur-harmonique", "Harmonic minor": "mineur-harmonique", "mineur-harmonique": "mineur-harmonique",
    Dorien: "dorien", Dorian: "dorien", dorien: "dorien",
    Phrygien: "phrygien", Phrygian: "phrygien", phrygien: "phrygien",
    Lydien: "lydien", Lydian: "lydien", lydien: "lydien",
    Mixolydien: "mixolydien", Mixolydian: "mixolydien", mixolydien: "mixolydien",
    Locrien: "locrien", Locrian: "locrien", locrien: "locrien",
    "Pentatonique majeure": "pentatonique-majeure", "Major pentatonic": "pentatonique-majeure", "pentatonique-majeure": "pentatonique-majeure",
    "Pentatonique mineure": "pentatonique-mineure", "Minor pentatonic": "pentatonique-mineure", "pentatonique-mineure": "pentatonique-mineure",
    Chromatique: "chromatique", Chromatic: "chromatique", chromatique: "chromatique",
  };
  return map[v] ?? "pentatonique-majeure";
}

// Comparaison insensible à la casse : accepte l'id canonique ("fm"), les
// anciens libellés FR/EN ("FM/Oscillateurs", "FM/Oscillators") et tout ce qui
// mentionne FM/Osc. Sans le `toLowerCase()`, l'id "fm" ne correspondait à aucun
// motif et retombait à tort sur "SoundFont".
export function normaliserTimbre(v: string): "FM/Oscillateurs" | "SoundFont" {
  const s = v.trim().toLowerCase();
  if (s === "soundfont") return "SoundFont";
  if (s.includes("fm") || s.includes("osc")) return "FM/Oscillateurs";
  return "SoundFont";
}

function decodeInstrument(valeur: number): { programme: number; banque: number } {
  if (valeur < 0) return { programme: -1, banque: -1 };
  const programme = Math.max(0, Math.min(127, Math.round(valeur % 128)));
  const banque = Math.max(0, Math.floor(valeur / 128));
  return { programme, banque };
}

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
  const suivante = Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const l = ligne[(i - 1 + n) % n];
    const c = ligne[i];
    const r = ligne[(i + 1) % n];
    const idx = (l << 2) | (c << 1) | r;
    suivante[i] = (regle >> idx) & 1;
  }
  return suivante;
}

function compterVoisins(grille: number[][], x: number, y: number): number {
  const h = grille.length;
  const w = grille[0]?.length ?? 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const yy = (y + dy + h) % h;
      const xx = (x + dx + w) % w;
      count += grille[yy][xx];
    }
  }
  return count;
}

function appliquerRegle2D(grille: number[][], regle: { naitre: number[]; survie: number[] }): number[][] {
  const h = grille.length;
  const w = grille[0]?.length ?? 0;
  const suivante: number[][] = Array.from({ length: h }, () => Array<number>(w).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = compterVoisins(grille, x, y);
      if (grille[y][x]) {
        suivante[y][x] = regle.survie.includes(v) ? 1 : 0;
      } else {
        suivante[y][x] = regle.naitre.includes(v) ? 1 : 0;
      }
    }
  }
  return suivante;
}

function regleEffective(options: OptionsAutomateCellulaire): number | { naitre: number[]; survie: number[] } {
  if (normaliserTopologie(options.topologie) === "1D") {
    const rp = options.reglePersonnalisee ?? 0;
    if (options.regle === 0 || rp > 0) {
      return Math.max(0, Math.min(255, rp || 90));
    }
    return REGLES_1D.includes(options.regle) ? options.regle : 90;
  }
  return REGLES_2D[normaliserTopologie(options.topologie) === "2D Highlife" ? "Highlife" : "Conway"];
}

function initialiserLigne1D(largeur: number, graine: number, rnd: () => number): number[] {
  const ligne = Array<number>(largeur).fill(0);
  if (graine === 0) {
    ligne[Math.floor(largeur / 2)] = 1;
  } else {
    for (let i = 0; i < largeur; i++) ligne[i] = rnd() < 0.3 ? 1 : 0;
  }
  return ligne;
}

function initialiserGrille2D(largeur: number, hauteur: number, graine: number, rnd: () => number): number[][] {
  const grille: number[][] = Array.from({ length: hauteur }, () => Array<number>(largeur).fill(0));
  if (graine === 0) {
    const cy = Math.floor(hauteur / 2);
    const cx = Math.floor(largeur / 2);
    // Clignotant (period-2 oscillator) centré : 3 cellules en ligne.
    // Oscille entre horizontal et vertical, donnant une activité stable.
    grille[cy][(cx - 1 + largeur) % largeur] = 1;
    grille[cy][cx] = 1;
    grille[cy][(cx + 1) % largeur] = 1;
  } else {
    for (let y = 0; y < hauteur; y++) {
      for (let x = 0; x < largeur; x++) {
        grille[y][x] = rnd() < 0.3 ? 1 : 0;
      }
    }
  }
  return grille;
}

function muterCellules(ligne: number[], probabilite: number, rnd: () => number): number[] {
  if (probabilite <= 0) return ligne;
  return ligne.map((c) => (rnd() < probabilite ? 1 - c : c));
}

function muterGrille(grille: number[][], probabilite: number, rnd: () => number): number[][] {
  if (probabilite <= 0) return grille;
  return grille.map((ligne) => ligne.map((c) => (rnd() < probabilite ? 1 - c : c)));
}

function indexMidiPourX(x: number, base: number, degres: number[], largeur: number): number {
  // Étaler les positions sur 2 octaves de la gamme pour plus de variété.
  const echelle = Math.floor((x / Math.max(1, largeur - 1)) * (degres.length * 2 - 1));
  return snapperNote(base + echelle, degres);
}

function velocitePourDensite(densite: number, max: number, velociteBase: number): number {
  if (max <= 0) return velociteBase;
  return Math.max(1, Math.min(127, Math.round(velociteBase * (0.5 + 0.5 * (densite / max)))));
}

function construireNotesDepuisLigne(
  options: OptionsAutomateCellulaire,
  temps: number,
  actives: number[],
  densite: number,
  base: number,
  degres: number[],
  rnd: () => number,
  arpegeIndex: number,
): { notes: NoteEvenement[]; arpegeIndex: number } {
  const notes: NoteEvenement[] = [];
  if (actives.length === 0) return { notes, arpegeIndex };
  const dureeBase = options.dureeNote;
  const mode = normaliserModeVoix(options.modeVoix);
  const mapping = normaliserMapping(options.mapping);
  const densiteMax = Math.max(1, options.densiteMax || actives.length);

  if (mode === "Arpège") {
    const idx = actives[arpegeIndex % actives.length];
    const midi = snapperNote(base + idx, degres);
    const vel = mapping === "Vélocité" || mapping === "Hauteur + vélocité"
      ? velocitePourDensite(densite, actives.length, options.velocite)
      : options.velocite;
    const duree = mapping === "Durée" || mapping === "Hauteur + vélocité"
      ? dureeBase * (0.5 + 0.5 * (densite / Math.max(1, actives.length)))
      : dureeBase;
    notes.push({ note: midi, velocite: vel, debut: temps, fin: temps + duree });
    return { notes, arpegeIndex: arpegeIndex + 1 };
  }

  if (mode === "Mélodie") {
    const idx = actives[Math.floor(rnd() * actives.length)];
    const midi = snapperNote(base + idx, degres);
    const vel = mapping === "Vélocité" || mapping === "Hauteur + vélocité"
      ? velocitePourDensite(densite, actives.length, options.velocite)
      : options.velocite;
    const duree = mapping === "Durée" || mapping === "Hauteur + vélocité"
      ? dureeBase * (0.5 + 0.5 * (densite / Math.max(1, actives.length)))
      : dureeBase;
    notes.push({ note: midi, velocite: vel, debut: temps, fin: temps + duree });
    return { notes, arpegeIndex };
  }

  // Polyphonie : limiter le nombre de voix.
  const selection = actives.length > densiteMax
    ? actives.filter((_, i) => i % Math.ceil(actives.length / densiteMax) === 0).slice(0, densiteMax)
    : actives;
  for (let i = 0; i < selection.length; i++) {
    const x = selection[i];
    const midi = mapping === "Hauteur"
      ? indexMidiPourX(x, base, degres, options.largeur)
      : indexMidiPourX(x, base, degres, options.largeur);
    const vel = mapping === "Vélocité" || mapping === "Hauteur + vélocité"
      ? velocitePourDensite(selection.length - i, selection.length, options.velocite)
      : options.velocite;
    const duree = mapping === "Durée" || mapping === "Hauteur + vélocité"
      ? dureeBase * (0.5 + 0.5 * ((selection.length - i) / Math.max(1, selection.length)))
      : dureeBase;
    notes.push({ note: midi, velocite: vel, debut: temps, fin: temps + duree });
  }
  return { notes, arpegeIndex };
}

function genererDepuis1D(options: OptionsAutomateCellulaire): NoteEvenement[] {
  const largeur = Math.max(4, Math.min(64, options.largeur));
  const generations = Math.max(4, Math.min(256, options.generations));
  const dureeNote = options.dureeNote;
  const degres = degresGammeMelodie(normaliserGamme(options.gamme));
  const base = 12 + (options.octave * 12) + (DEMI_TONS_CLE[normaliserCle(options.cle)] ?? 0);
  const rnd = randomSeed(options.graine);
  const regle = regleEffective(options) as number;
  const probabilite = Math.max(0, Math.min(1, options.probabilite ?? 0));

  let ligne = initialiserLigne1D(largeur, options.graine, rnd);
  ligne = muterCellules(ligne, probabilite, rnd);

  const notes: NoteEvenement[] = [];
  let arpegeIndex = 0;
  for (let g = 0; g < generations; g++) {
    const actives = ligne.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (actives.length > 0) {
      const t = g * dureeNote;
      const { notes: n, arpegeIndex: ai } = construireNotesDepuisLigne(
        options,
        t,
        actives,
        actives.length,
        base,
        degres,
        rnd,
        arpegeIndex,
      );
      notes.push(...n);
      arpegeIndex = ai;
    }
    ligne = appliquerRegle1D(ligne, regle);
    ligne = muterCellules(ligne, probabilite, rnd);
  }
  return notes;
}

function genererDepuis2D(options: OptionsAutomateCellulaire): NoteEvenement[] {
  const largeur = Math.max(4, Math.min(64, options.largeur));
  const hauteur = Math.max(4, Math.min(64, options.hauteur ?? options.generations));
  const iterations = Math.max(0, Math.min(64, options.generations));
  const dureeNote = options.dureeNote;
  const degres = degresGammeMelodie(normaliserGamme(options.gamme));
  const base = 12 + (options.octave * 12) + (DEMI_TONS_CLE[normaliserCle(options.cle)] ?? 0);
  const rnd = randomSeed(options.graine);
  const regle = regleEffective(options) as { naitre: number[]; survie: number[] };
  const probabilite = Math.max(0, Math.min(1, options.probabilite ?? 0));

  let grille = initialiserGrille2D(largeur, hauteur, options.graine, rnd);
  grille = muterGrille(grille, probabilite, rnd);
  for (let i = 0; i < iterations; i++) {
    grille = appliquerRegle2D(grille, regle);
    grille = muterGrille(grille, probabilite, rnd);
  }

  const notes: NoteEvenement[] = [];
  let arpegeIndex = 0;
  for (let y = 0; y < hauteur; y++) {
    const actives = grille[y].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (actives.length > 0) {
      const t = y * dureeNote;
      const { notes: n, arpegeIndex: ai } = construireNotesDepuisLigne(
        options,
        t,
        actives,
        actives.length,
        base,
        degres,
        rnd,
        arpegeIndex,
      );
      notes.push(...n);
      arpegeIndex = ai;
    }
  }
  return notes;
}

export function genererNotesAutomateCellulaire(options: OptionsAutomateCellulaire): NoteEvenement[] {
  const topologie = normaliserTopologie(options.topologie);
  if (topologie === "1D") {
    return genererDepuis1D(options);
  }
  return genererDepuis2D(options);
}

export async function genererAutomateCellulaire(options: OptionsAutomateCellulaire): Promise<{ audio: AudioBuffer; midi: File; notes: NoteEvenement[] }> {
  const notes = genererNotesAutomateCellulaire(options);
  const tempo = notes.length > 0 ? 60 / options.dureeNote : 120;
  const { programme, banque } = decodeInstrument(options.instrument ?? 0);
  const midiFile = notesVersFichierMidi(notes, tempo, 0, banque, programme);
  let audio: AudioBuffer;
  try {
    audio = await rendreSequence(notes, options.timbre, options.volume, programme, banque);
  } catch (e) {
    if (options.timbre === "SoundFont") {
      audio = await rendreSequence(notes, "FM/Oscillateurs", options.volume, programme, banque);
    } else {
      throw e;
    }
  }
  return { audio, midi: midiFile, notes };
}
