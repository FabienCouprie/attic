// audio/palette-harmonique.ts — Extraction d'une palette d'image et conversion
// en séquence musicale. Chaque couleur dominante devient une note (mélodie) ou
// un accord (harmonie), selon sa teinte, saturation, luminosité et position.

import type { PixelBuffer } from "./pixeltone";
import { imageDataDepuisFichier } from "./pixeltone";
import { rgbToHsl, distanceRgb2 } from "./couleurs";
import { notesVersFichierMidi, rendreSequence, type NoteEvenement } from "./midi";

export interface CouleurExtraite {
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
  x: number;
  y: number;
  count: number;
}

export interface OptionsPaletteHarmonique {
  cle: string;
  gamme: string;
  mode: "melodie" | "harmonie";
  octave: number;
  portee: number;
  duree: number;
  nbCouleurs: number;
  ordre: "horizontal" | "vertical" | "luminosite" | "saturation";
  modeRendu: "FM/Oscillateurs" | "SoundFont";
  instrument: number;
  volume: number;
  tempo: number;
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

export function extrairePalette(
  pixels: PixelBuffer,
  nbCouleurs: number,
  maxEchantillons = 5000,
): CouleurExtraite[] {
  const w = pixels.width;
  const h = pixels.height;
  const data = pixels.data;
  const total = w * h;
  const step = Math.max(1, Math.floor(total / maxEchantillons));
  const echantillons: { r: number; g: number; b: number; x: number; y: number }[] = [];
  for (let i = 0; i < total; i += step) {
    const idx = i * 4;
    const a = data[idx + 3];
    if (a === 0) continue;
    echantillons.push({
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
      x: (i % w) / Math.max(1, w - 1),
      y: Math.floor(i / w) / Math.max(1, h - 1),
    });
  }
  if (echantillons.length === 0) {
    echantillons.push({ r: 128, g: 128, b: 128, x: 0.5, y: 0.5 });
  }

  const k = Math.max(1, Math.min(nbCouleurs, echantillons.length));

  // k-means++ initialisation
  const centroids: { r: number; g: number; b: number; x: number; y: number }[] = [];
  const rng = () => Math.random();
  let premier = Math.floor(rng() * echantillons.length);
  centroids.push({ ...echantillons[premier] });
  while (centroids.length < k) {
    let meilleurIdx = 0;
    let meilleureDist = -1;
    for (let i = 0; i < echantillons.length; i++) {
      let dMin = Infinity;
      for (const c of centroids) {
        const d = distanceRgb2(echantillons[i], c);
        if (d < dMin) dMin = d;
      }
      if (dMin > meilleureDist) {
        meilleureDist = dMin;
        meilleurIdx = i;
      }
    }
    centroids.push({ ...echantillons[meilleurIdx] });
  }

  // Itérations Lloyd
  const assignments = new Int32Array(echantillons.length);
  for (let it = 0; it < 10; it++) {
    // assignation
    let changed = 0;
    for (let i = 0; i < echantillons.length; i++) {
      let dMin = Infinity;
      let best = 0;
      for (let j = 0; j < centroids.length; j++) {
        const d = distanceRgb2(echantillons[i], centroids[j]);
        if (d < dMin) {
          dMin = d;
          best = j;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed++;
      }
    }
    if (changed === 0) break;
    // mise à jour
    for (let j = 0; j < centroids.length; j++) {
      let sr = 0, sg = 0, sb = 0, sx = 0, sy = 0, n = 0;
      for (let i = 0; i < echantillons.length; i++) {
        if (assignments[i] !== j) continue;
        const e = echantillons[i];
        sr += e.r;
        sg += e.g;
        sb += e.b;
        sx += e.x;
        sy += e.y;
        n++;
      }
      if (n > 0) {
        centroids[j].r = sr / n;
        centroids[j].g = sg / n;
        centroids[j].b = sb / n;
        centroids[j].x = sx / n;
        centroids[j].y = sy / n;
      }
    }
  }

  // Construction du résultat avec HSL et comptage
  const clusters: { r: number; g: number; b: number; x: number; y: number; count: number }[] = centroids.map((c) => ({ ...c, count: 0 }));
  for (let i = 0; i < echantillons.length; i++) {
    clusters[assignments[i]].count++;
  }

  return clusters.map((c) => {
    const r = Math.round(c.r);
    const g = Math.round(c.g);
    const b = Math.round(c.b);
    const [h, s, l] = rgbToHsl(r, g, b);
    return {
      r, g, b, h, s, l,
      x: c.x,
      y: c.y,
      count: c.count,
    };
  });
}

function intervallesGamme(nom: string): number[] {
  return GAMMES[nom] ?? GAMMES["majeur"];
}

function noteDepuisCouleur(couleur: CouleurExtraite, options: OptionsPaletteHarmonique): number {
  const intervals = intervallesGamme(options.gamme);
  const cleIdx = Math.max(0, NOTES.indexOf(options.cle));
  const base = (options.octave + 1) * 12 + cleIdx;
  const deg = Math.floor((couleur.h / 360) * intervals.length) % intervals.length;
  const semi = intervals[deg];
  const octOffset = Math.min(options.portee - 1, Math.floor(couleur.l * options.portee));
  return Math.max(0, Math.min(127, base + semi + octOffset * 12));
}

function estGammeMajeure(gamme: string): boolean {
  const g = gamme.toLowerCase();
  return g.includes("majeur") || g === "majeur" || g === "chromatique";
}

export function couleursVersNotes(
  couleurs: CouleurExtraite[],
  options: OptionsPaletteHarmonique,
): NoteEvenement[] {
  const notes: NoteEvenement[] = [];
  const dureeNote = Math.min(options.duree, options.duree / Math.max(1, couleurs.length));
  const triade = estGammeMajeure(options.gamme) ? [0, 4, 7] : [0, 3, 7];

  const xs = couleurs.map((c) => c.x);
  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const maxX = xs.length > 0 ? Math.max(...xs) : 0;
  const span = maxX - minX;

  for (const c of couleurs) {
    const root = noteDepuisCouleur(c, options);
    const velocite = Math.max(40, Math.min(120, Math.round(40 + c.s * 80)));
    const ratio = span > 0 ? (c.x - minX) / span : 0;
    const debut = ratio * (options.duree - dureeNote);
    const fin = debut + Math.max(0.1, dureeNote);
    if (options.mode === "harmonie") {
      for (const offset of triade) {
        const note = Math.max(0, Math.min(127, root + offset));
        notes.push({ note, velocite, debut, fin });
      }
    } else {
      notes.push({ note: root, velocite, debut, fin });
    }
  }
  return notes;
}

export async function genererPaletteHarmonique(
  image: File,
  options: OptionsPaletteHarmonique,
): Promise<{ audio: AudioBuffer; midi: File | null; palette: CouleurExtraite[] }> {
  const pixels = await imageDataDepuisFichier(image, 512);
  const palette = extrairePalette(pixels, options.nbCouleurs);

  // Tri selon l'ordre choisi
  switch (options.ordre) {
    case "horizontal":
      palette.sort((a, b) => a.x - b.x);
      break;
    case "vertical":
      palette.sort((a, b) => a.y - b.y);
      break;
    case "luminosite":
      palette.sort((a, b) => b.l - a.l);
      break;
    case "saturation":
      palette.sort((a, b) => b.s - a.s);
      break;
  }

  const notes = couleursVersNotes(palette, options);
  const { programme, banque } = decodeInstrument(options.instrument);
  const audio = await rendreSequence(notes, options.modeRendu, options.volume, programme, banque);
  const midi = notes.length > 0 ? notesVersFichierMidi(notes, options.tempo, 0, banque, programme) : null;
  return { audio, midi, palette };
}

function decodeInstrument(valeur: number): { programme: number; banque: number } {
  if (valeur < 0) return { programme: -1, banque: -1 };
  const programme = Math.max(0, Math.min(127, Math.round(valeur % 128)));
  const banque = Math.max(0, Math.floor(valeur / 128));
  return { programme, banque };
}

export { imageDataDepuisFichier };
