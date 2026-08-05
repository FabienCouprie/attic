// audio/camelot.ts — Sonification de la roue de Camelot (harmonic mixing).
// Chaque case Camelot correspond à une tonalité : anneau A = mineurs,
// anneau B = majeurs. Le nœud génère un parcours audio/MIDI qui illustre
// les transitions harmoniques compatibles (+1, -1, même numéro, +7).

import { Chord, Note } from "tonal";
import { notesVersFichierMidi, rendreSequence, type NoteEvenement } from "./midi";

// ─── Cartographie Camelot → symboles d'accords Tonal ───

export const CAMELOT_A: Record<number, string> = {
  1: "Abm", 2: "Ebm", 3: "Bbm", 4: "Fm", 5: "Cm", 6: "Gm",
  7: "Dm", 8: "Am", 9: "Em", 10: "Bm", 11: "F#m", 12: "Dbm",
};

export const CAMELOT_B: Record<number, string> = {
  1: "B", 2: "F#", 3: "Db", 4: "Ab", 5: "Eb", 6: "Bb",
  7: "F", 8: "C", 9: "G", 10: "D", 11: "A", 12: "E",
};

export interface CamelotCode {
  n: number;
  ring: "A" | "B";
}

export function parseCamelot(code: string): CamelotCode | null {
  const m = code.trim().match(/^(\d{1,2})([ABab])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 12) return null;
  const ring = m[2].toUpperCase() as "A" | "B";
  return { n, ring };
}

export function camelotToAccord(code: string): string | null {
  const p = parseCamelot(code);
  if (!p) return null;
  return p.ring === "A" ? CAMELOT_A[p.n] : CAMELOT_B[p.n];
}

export function camelotToString(code: CamelotCode): string {
  return `${code.n}${code.ring}`;
}

// ─── Génération du parcours ───

export type ParcoursCamelot = "complet" | "voisins" | "aleatoire";

function voisin(code: CamelotCode, type: "same" | "plus1" | "moins1" | "plus7"): CamelotCode {
  if (type === "same") return { n: code.n, ring: code.ring === "A" ? "B" : "A" };
  let n = code.n;
  if (type === "plus1") n = (n % 12) + 1;
  if (type === "moins1") n = ((n - 2 + 12) % 12) + 1;
  if (type === "plus7") n = ((n + 6 - 1) % 12) + 1;
  return { n, ring: code.ring };
}

const CYCLE_VOISINS: ("same" | "plus1" | "moins1" | "plus7")[] = ["plus1", "same", "moins1", "plus7"];

export function genererParcoursCamelot(
  depart: string,
  parcours: ParcoursCamelot,
  pas: number,
): string[] {
  const start = parseCamelot(depart);
  if (!start) return [];
  const codes: string[] = [camelotToString(start)];
  let current = start;
  for (let i = 1; i < pas; i++) {
    if (parcours === "complet") {
      current = { n: (current.n % 12) + 1, ring: current.ring };
    } else if (parcours === "voisins") {
      const type = CYCLE_VOISINS[(i - 1) % CYCLE_VOISINS.length];
      current = voisin(current, type);
    } else {
      const type = CYCLE_VOISINS[Math.floor(Math.random() * CYCLE_VOISINS.length)];
      current = voisin(current, type);
    }
    codes.push(camelotToString(current));
  }
  return codes;
}

// ─── Rendu musical ───

function notesAccordAscendantes(accord: string, octave: number): number[] {
  const c = Chord.get(accord);
  if (!c || !c.notes.length) return [];
  const notes: number[] = [];
  let lastMidi = -Infinity;
  for (const n of c.notes) {
    let midi = Note.midi(`${n}${octave}`) ?? 0;
    while (midi < lastMidi) midi += 12;
    notes.push(midi);
    lastMidi = midi;
  }
  return notes;
}

export interface OptionsCamelot {
  depart: string;
  parcours: ParcoursCamelot;
  pas: number;
  tempo: number;
  dureeNote: number;
  octave: number;
  mode: "bloc" | "arpege";
  modeRendu: "FM/Oscillateurs" | "SoundFont";
  instrument: number;
  volume: number;
}

function decodeInstrument(valeur: number): { programme: number; banque: number } {
  if (valeur < 0) return { programme: -1, banque: -1 };
  const programme = Math.max(0, Math.min(127, Math.round(valeur % 128)));
  const banque = Math.max(0, Math.floor(valeur / 128));
  return { programme, banque };
}

export function genererNotesCamelot(options: OptionsCamelot): { notes: NoteEvenement[]; codes: string[]; accords: string[] } {
  const codes = genererParcoursCamelot(options.depart, options.parcours, Math.max(1, options.pas));
  const accords = codes.map(camelotToAccord).filter((a): a is string => a !== null);
  const notes: NoteEvenement[] = [];
  const stepDur = 60 / Math.max(1, options.tempo);
  const noteDur = Math.max(0.05, stepDur * options.dureeNote);
  const velocite = 100;

  for (let i = 0; i < accords.length; i++) {
    const accord = accords[i];
    const midiNotes = notesAccordAscendantes(accord, options.octave);
    if (midiNotes.length === 0) continue;
    const debut = i * stepDur;

    if (options.mode === "bloc") {
      for (const note of midiNotes) {
        notes.push({ note, velocite, debut, fin: debut + noteDur });
      }
    } else {
      const subDur = Math.max(0.02, noteDur / midiNotes.length);
      for (let j = 0; j < midiNotes.length; j++) {
        const d = debut + j * subDur;
        notes.push({ note: midiNotes[j], velocite, debut: d, fin: d + subDur });
      }
    }
  }

  return { notes, codes, accords };
}

export async function genererCamelot(options: OptionsCamelot): Promise<{ audio: AudioBuffer; midi: File; notes: NoteEvenement[]; codes: string[]; accords: string[] }> {
  const { notes, codes, accords } = genererNotesCamelot(options);
  const { programme, banque } = decodeInstrument(options.instrument);
  const audio = await rendreSequence(notes, options.modeRendu, options.volume, programme, banque);
  const midi = notes.length > 0
    ? notesVersFichierMidi(notes, options.tempo, 0, banque, programme)
    : new File([], "camelot.mid", { type: "audio/midi" });
  return { audio, midi, notes, codes, accords };
}

// ─── Visualisation SVG ───

export interface OptionsSvgCamelot {
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  radiusB?: number;
  radiusA?: number;
}

export function genererSvgCamelot(codes: string[], options: OptionsSvgCamelot = {}): File {
  const width = options.width ?? 600;
  const height = options.height ?? 600;
  const cx = options.cx ?? width / 2;
  const cy = options.cy ?? height / 2;
  const radiusB = options.radiusB ?? Math.min(width, height) * 0.36;
  const radiusA = options.radiusA ?? Math.min(width, height) * 0.22;

  function position(code: string): { x: number; y: number } | null {
    const p = parseCamelot(code);
    if (!p) return null;
    const r = p.ring === "A" ? radiusA : radiusB;
    const angle = (p.n - 1) * (Math.PI / 6) - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  const pathSet = new Set(codes.map((c) => c.toUpperCase()));
  const pathLines: string[] = [];
  for (let i = 0; i < codes.length - 1; i++) {
    const a = position(codes[i]);
    const b = position(codes[i + 1]);
    if (!a || !b) continue;
    pathLines.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#8e6fce" stroke-width="3" marker-end="url(#arrow)" />`);
  }

  let nodesSvg = "";
  for (let n = 1; n <= 12; n++) {
    for (const ring of ["B", "A"] as const) {
      const code = `${n}${ring}`;
      const pos = position(code);
      if (!pos) continue;
      const accord = camelotToAccord(code);
      const isOnPath = pathSet.has(code);
      const fill = isOnPath ? "#a855f7" : (ring === "B" ? "#4a3b5c" : "#5e3a5e");
      const stroke = isOnPath ? "#f5f0f8" : "#2d2342";
      const r = ring === "B" ? 26 : 22;
      nodesSvg += `
        <circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2" />
        <text x="${pos.x.toFixed(1)}" y="${(pos.y - 4).toFixed(1)}" text-anchor="middle" fill="#f5f0f8" font-size="${ring === "B" ? 12 : 10}" font-weight="600" font-family="system-ui, sans-serif">${code}</text>
        <text x="${pos.x.toFixed(1)}" y="${(pos.y + 10).toFixed(1)}" text-anchor="middle" fill="#a99bb8" font-size="${ring === "B" ? 10 : 9}" font-family="system-ui, sans-serif">${accord ?? ""}</text>
      `;
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 L2,4 Z" fill="#8e6fce" />
    </marker>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#120e1b" />
  <circle cx="${cx}" cy="${cy}" r="${radiusB}" fill="none" stroke="#2d2342" stroke-width="2" />
  <circle cx="${cx}" cy="${cy}" r="${radiusA}" fill="none" stroke="#2d2342" stroke-width="2" />
  <text x="${cx}" y="30" text-anchor="middle" fill="#e8e0f0" font-size="18" font-weight="600" font-family="system-ui, sans-serif">Roue de Camelot</text>
  <text x="${cx}" y="${height - 16}" text-anchor="middle" fill="#7d6e8f" font-size="12" font-family="system-ui, sans-serif">${codes.join(" → ")}</text>
  ${pathLines.join("\n")}
  ${nodesSvg}
</svg>`;

  return new File([svg], "camelot.svg", { type: "image/svg+xml" });
}
