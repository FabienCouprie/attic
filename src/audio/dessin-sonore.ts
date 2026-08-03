// audio/dessin-sonore.ts — Sonification d'un dessin avec formes colorées.
// Chaque région connexe de couleur similaire devient un événement sonore :
// position X → timing, position Y → hauteur, taille → durée/vélocité,
// couleur → octave et timbre (via teinte/luminosité).

import type { PixelBuffer } from "./pixeltone";
import { imageDataDepuisFichier } from "./pixeltone";
import { extrairePalette, type CouleurExtraite } from "./palette-harmonique";
import { rgbToHsl, distanceRgb2 } from "./couleurs";
import { notesVersFichierMidi, rendreSequence, type NoteEvenement } from "./midi";

export interface FormeColoree {
  couleur: CouleurExtraite;
  x: number;
  y: number;
  area: number;
  largeur: number;
  hauteur: number;
}

export interface OptionsDessinSonore {
  cle: string;
  gamme: string;
  mode: "melodie" | "harmonie" | "arpege";
  octave: number;
  portee: number;
  duree: number;
  nbCouleurs: number;
  modeRendu: "FM/Oscillateurs" | "SoundFont";
  instrument: number;
  volume: number;
  tempo: number;
  tailleMin: number; // proportion de l'image (0-1)
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

function intervallesGamme(nom: string): number[] {
  return GAMMES[nom] ?? GAMMES["majeur"];
}

function noteDepuisCouleur(couleur: CouleurExtraite, cle: string, gamme: string, octave: number, portee: number): number {
  const intervals = intervallesGamme(gamme);
  const cleIdx = Math.max(0, NOTES.indexOf(cle));
  const base = (octave + 1) * 12 + cleIdx;
  const deg = Math.floor((couleur.h / 360) * intervals.length) % intervals.length;
  const semi = intervals[deg];
  const octOffset = Math.min(portee - 1, Math.floor(couleur.l * portee));
  return Math.max(0, Math.min(127, base + semi + octOffset * 12));
}

function estGammeMajeure(gamme: string): boolean {
  const g = gamme.toLowerCase();
  return g.includes("majeur") || g === "chromatique";
}

export function detecterFormesColorees(pixels: PixelBuffer, nbCouleurs: number, tailleMin: number): FormeColoree[] {
  const palette = extrairePalette(pixels, nbCouleurs);
  const w = pixels.width;
  const h = pixels.height;
  const data = pixels.data;
  const total = w * h;
  const labels = new Int32Array(total);
  labels.fill(-1);

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const a = data[idx + 3];
    if (a === 0) continue;
    const pixel = { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
    let best = 0;
    let bestD = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const d = distanceRgb2(pixel, palette[p]);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    labels[i] = best;
  }

  const visited = new Uint8Array(total);
  const formes: FormeColoree[] = [];
  const minPixels = Math.max(1, Math.floor(tailleMin * total));

  for (let i = 0; i < total; i++) {
    const label = labels[i];
    if (label < 0 || visited[i]) continue;
    // BFS pour trouver une composante connexe de même label
    const queue: number[] = [i];
    visited[i] = 1;
    let head = 0;
    let sumX = 0, sumY = 0, count = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let sumR = 0, sumG = 0, sumB = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const lx = cur % w;
      const ly = Math.floor(cur / w);
      sumX += lx;
      sumY += ly;
      count++;
      minX = Math.min(minX, lx);
      maxX = Math.max(maxX, lx);
      minY = Math.min(minY, ly);
      maxY = Math.max(maxY, ly);
      const cidx = cur * 4;
      sumR += data[cidx];
      sumG += data[cidx + 1];
      sumB += data[cidx + 2];
      const neighbors = [cur - 1, cur + 1, cur - w, cur + w];
      for (const n of neighbors) {
        if (n < 0 || n >= total) continue;
        if (labels[n] !== label || visited[n]) continue;
        const nx = n % w;
        const ny = Math.floor(n / w);
        // Voisinage 4-connexe : pas de wrap horizontal
        if (Math.abs(nx - lx) + Math.abs(ny - ly) > 1) continue;
        visited[n] = 1;
        queue.push(n);
      }
    }
    if (count < minPixels) continue;
    const r = Math.round(sumR / count);
    const g = Math.round(sumG / count);
    const b = Math.round(sumB / count);
    const [hh, ss, ll] = rgbToHsl(r, g, b);
    formes.push({
      couleur: {
        r, g, b, h: hh, s: ss, l: ll,
        x: sumX / count / Math.max(1, w - 1),
        y: sumY / count / Math.max(1, h - 1),
        count,
      },
      x: sumX / count / Math.max(1, w - 1),
      y: sumY / count / Math.max(1, h - 1),
      area: count,
      largeur: (maxX - minX + 1) / w,
      hauteur: (maxY - minY + 1) / h,
    });
  }

  return formes;
}

export function formesVersNotes(
  formes: FormeColoree[],
  options: OptionsDessinSonore,
): NoteEvenement[] {
  const notes: NoteEvenement[] = [];
  if (formes.length === 0) return notes;
  const maxArea = Math.max(...formes.map((f) => f.area));
  const dureeNote = Math.min(options.duree, options.duree / Math.max(1, formes.length));
  const triade = estGammeMajeure(options.gamme) ? [0, 4, 7] : [0, 3, 7];

  const xs = formes.map((f) => f.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const span = maxX - minX;

  for (const f of formes) {
    const root = noteDepuisCouleur(f.couleur, options.cle, options.gamme, options.octave, options.portee);
    const velocite = Math.max(40, Math.min(120, Math.round(40 + (f.area / maxArea) * 80 + f.couleur.s * 20)));
    const ratio = span > 0 ? (f.x - minX) / span : 0;
    const debut = ratio * (options.duree - dureeNote);
    const fin = debut + Math.max(0.1, dureeNote);
    if (options.mode === "harmonie") {
      for (const offset of triade) {
        const note = Math.max(0, Math.min(127, root + offset));
        notes.push({ note, velocite, debut, fin });
      }
    } else if (options.mode === "arpege") {
      const noteLength = Math.max(0.05, (fin - debut) / triade.length);
      const step = triade.length > 1 ? (fin - debut - noteLength) / (triade.length - 1) : 0;
      for (let i = 0; i < triade.length; i++) {
        const note = Math.max(0, Math.min(127, root + triade[i]));
        const t = debut + i * step;
        notes.push({ note, velocite, debut: t, fin: t + noteLength });
      }
    } else {
      notes.push({ note: root, velocite, debut, fin });
    }
  }
  return notes;
}

export async function genererDessinSonore(
  image: File,
  options: OptionsDessinSonore,
): Promise<{ audio: AudioBuffer; midi: File | null; formes: FormeColoree[] }> {
  const pixels = await imageDataDepuisFichier(image, 512);
  const formes = detecterFormesColorees(pixels, options.nbCouleurs, options.tailleMin);
  const notes = formesVersNotes(formes, options);
  const { programme, banque } = decodeInstrument(options.instrument);
  const audio = await rendreSequence(notes, options.modeRendu, options.volume, programme, banque);
  const midi = notes.length > 0 ? notesVersFichierMidi(notes, options.tempo, 0, banque, programme) : null;
  return { audio, midi, formes };
}

function decodeInstrument(valeur: number): { programme: number; banque: number } {
  if (valeur < 0) return { programme: -1, banque: -1 };
  const programme = Math.max(0, Math.min(127, Math.round(valeur % 128)));
  const banque = Math.max(0, Math.floor(valeur / 128));
  return { programme, banque };
}

export { imageDataDepuisFichier };
