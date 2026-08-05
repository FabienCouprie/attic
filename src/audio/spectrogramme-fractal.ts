// audio/spectrogramme-fractal.ts — Génère un spectrogramme dont le motif est un
// bruit fractal (mouvement brownien fractionnaire), puis synthétise l'audio
// correspondant par transformée inverse à court terme (overlap-add).

import { fft } from "./fft";
import { creerFenetreHann } from "./commun";

export interface OptionsSpectrogrammeFractal {
  duree: number; // secondes
  sampleRate?: number;
  fftSize?: number; // puissance de 2
  overlap?: number; // 0..1
  octaves: number; // 1..8
  roughness: number; // 0..1
  graine: number;
  minFreq?: number; // Hz
  maxFreq?: number; // Hz
  forme?: "linear" | "logarithmic";
}

function creerRng(graine: number) {
  let s = graine >>> 0;
  if (s === 0) s = 123456789;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashNoise(rng: () => number, x: number, y: number): number {
  // Mélange simple de coordonnées avec la graine via le RNG.
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function interpolationCosine(a: number, b: number, t: number): number {
  const ft = (1 - Math.cos(t * Math.PI)) / 2;
  return a + (b - a) * ft;
}

function bruit2D(rng: () => number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;
  const n00 = hashNoise(rng, x0, y0);
  const n10 = hashNoise(rng, x1, y0);
  const n01 = hashNoise(rng, x0, y1);
  const n11 = hashNoise(rng, x1, y1);
  const nx0 = interpolationCosine(n00, n10, fx);
  const nx1 = interpolationCosine(n01, n11, fx);
  return interpolationCosine(nx0, nx1, fy);
}

function bruitFractal(
  rng: () => number,
  x: number,
  y: number,
  octaves: number,
  roughness: number,
): number {
  let val = 0;
  let amp = 1;
  let freq = 1;
  let totalAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * bruit2D(rng, x * freq, y * freq);
    totalAmp += amp;
    amp *= roughness;
    freq *= 2;
  }
  return val / totalAmp;
}

function generateSpectrogram(
  frames: number,
  bins: number,
  octaves: number,
  roughness: number,
  graine: number,
  forme: "linear" | "logarithmic",
): number[][] {
  const rng = creerRng(graine);
  const spectro: number[][] = [];
  for (let t = 0; t < frames; t++) {
    const col: number[] = [];
    for (let b = 0; b < bins; b++) {
      const y = forme === "logarithmic" ? Math.log(1 + b) / Math.log(bins) : b / bins;
      const x = t / Math.max(1, frames);
      const val = bruitFractal(rng, x * 4, y * 4, octaves, roughness);
      // Shape: more energy in low-mid frequencies, less in very highs.
      const shaping = Math.exp(-3 * y) * (1 + 4 * y * Math.exp(-2 * y));
      col.push(Math.max(0, (val + 1) * 0.5 * shaping));
    }
    spectro.push(col);
  }
  return spectro;
}

export function synthetiserDepuisSpectrogramme(
  spectro: number[][],
  sampleRate: number,
  fftSize: number,
  overlap: number,
): AudioBuffer {
  const hop = Math.round(fftSize * (1 - overlap));
  const frames = spectro.length;
  const bins = spectro[0].length;
  const nBins = fftSize / 2 + 1;
  if (bins !== nBins) {
    throw new Error(`Le spectrogramme doit avoir ${nBins} bins pour fftSize=${fftSize}`);
  }
  const outLen = hop * (frames - 1) + fftSize;
  const out = new AudioBuffer({ numberOfChannels: 1, length: outLen, sampleRate });
  const dst = out.getChannelData(0);
  const fenetre = creerFenetreHann(fftSize);
  const rng = creerRng(12345);

  for (let f = 0; f < frames; f++) {
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    const spec = spectro[f];
    for (let b = 0; b < nBins; b++) {
      const mag = spec[b] ?? 0;
      const phase = rng() * 2 * Math.PI;
      re[b] = mag * Math.cos(phase);
      im[b] = mag * Math.sin(phase);
      if (b > 0 && b < fftSize / 2) {
        re[fftSize - b] = mag * Math.cos(phase);
        im[fftSize - b] = -mag * Math.sin(phase);
      }
    }
    fft(re, im, true);
    const start = f * hop;
    for (let i = 0; i < fftSize && start + i < outLen; i++) {
      dst[start + i] += re[i] * fenetre[i];
    }
  }

  // Normalisation.
  let pic = 1e-9;
  for (let i = 0; i < outLen; i++) {
    const v = Math.abs(dst[i]);
    if (v > pic) pic = v;
  }
  const g = 0.9 / pic;
  for (let i = 0; i < outLen; i++) dst[i] *= g;

  return out;
}

export async function rendreSpectrogrammeFractal(
  options: OptionsSpectrogrammeFractal,
): Promise<{ audio: AudioBuffer; image?: File }> {
  const sr = options.sampleRate ?? 44100;
  const fftSize = options.fftSize ?? 2048;
  const overlap = Math.max(0, Math.min(0.9, options.overlap ?? 0.75));
  const duree = Math.max(0.1, Math.min(60, options.duree));
  const hop = Math.round(fftSize * (1 - overlap));
  const frames = Math.max(1, Math.ceil((duree * sr - fftSize) / hop) + 1);
  const bins = fftSize / 2 + 1;
  const octaves = Math.max(1, Math.min(8, Math.round(options.octaves)));
  const roughness = Math.max(0, Math.min(1, options.roughness));
  const forme = options.forme ?? "logarithmic";

  const spectro = generateSpectrogram(frames, bins, octaves, roughness, options.graine, forme);
  const audio = synthetiserDepuisSpectrogramme(spectro, sr, fftSize, overlap);

  let image: File | undefined;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = frames;
    canvas.height = bins;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const imgData = ctx.createImageData(frames, bins);
      for (let t = 0; t < frames; t++) {
        for (let b = 0; b < bins; b++) {
          const v = Math.max(0, Math.min(1, spectro[t][b]));
          // Couleur spectro : noir → violet → bleu → cyan → blanc.
          const r = Math.min(255, Math.floor(v * 255 * 1.5));
          const g = Math.min(255, Math.floor(v * v * 255 * 2.5));
          const bCol = Math.min(255, Math.floor(v * 255 * 3));
          const idx = ((bins - 1 - b) * frames + t) * 4;
          imgData.data[idx] = r;
          imgData.data[idx + 1] = g;
          imgData.data[idx + 2] = bCol;
          imgData.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (blob) image = new File([blob], "spectrogramme-fractal.png", { type: "image/png" });
    }
  }

  return { audio, image };
}
