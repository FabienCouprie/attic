// audio/pixeltone.ts — Sonification d'image façon pixeltone.js : chaque pixel
// devient une tranche sonore dont les trois canaux R, G, B sont mappés à des
// fréquences distinctes. Aucune dépendance externe : le décodage image se fait
// via canvas et l'audio par synthèse directe d'ondes sinusoïdales.

import { frequenceDepuisValeur } from "./commun";

export interface OptionsPixeltone {
  /** Durée en secondes attribuée à chaque pixel. */
  dureePixel: number;
  /** Fréquence min/max du canal rouge (Hz). */
  rouge: [number, number];
  /** Fréquence min/max du canal vert (Hz). */
  vert: [number, number];
  /** Fréquence min/max du canal bleu (Hz). */
  bleu: [number, number];
  /** Direction de balayage de l'image. */
  balayage: "horizontal" | "vertical" | "zigzag";
  /** Fréquence d'échantillonnage de sortie. */
  sampleRate?: number;
  /** Volume de sortie (0–100). */
  volume?: number;
  /** Nombre de canaux audio de sortie (1 ou 2). */
  canaux?: 1 | 2;
}

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array | number[];
}

export function* pixelsEnOrdre(
  width: number,
  height: number,
  balayage: OptionsPixeltone["balayage"],
): Generator<{ x: number; y: number }> {
  if (balayage === "vertical") {
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) yield { x, y };
    }
  } else if (balayage === "zigzag") {
    for (let y = 0; y < height; y++) {
      const reverse = y % 2 === 1;
      for (let x = 0; x < width; x++) {
        yield { x: reverse ? width - 1 - x : x, y };
      }
    }
  } else {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) yield { x, y };
      }
  }
}

export async function imageDataDepuisFichier(fichier: File, largeurMax?: number): Promise<PixelBuffer> {
  if (typeof document === "undefined") {
    throw new Error("Le décodage d'image nécessite un environnement navigateur.");
  }
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Impossible de charger l'image."));
    });

    const max = largeurMax && largeurMax > 0 ? largeurMax : img.width;
    let w = img.width;
    let h = img.height;
    if (w > max) {
      h = Math.round(h * (max / w));
      w = max;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible.");
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function sonifierDepuisPixels(
  pixels: PixelBuffer,
  options: OptionsPixeltone,
): AudioBuffer {
  const sr = options.sampleRate ?? 44100;
  const dureePixel = Math.max(0.001, options.dureePixel);
  const echantillonsParPixel = Math.max(1, Math.round(dureePixel * sr));
  const nbPixels = pixels.width * pixels.height;
  const totalEchantillons = echantillonsParPixel * nbPixels;
  const channels = options.canaux === 1 ? 1 : 2;
  const buffer = new AudioBuffer({ numberOfChannels: channels, length: totalEchantillons, sampleRate: sr });
  const data = pixels.data;

  const [rMin, rMax] = options.rouge;
  const [gMin, gMax] = options.vert;
  const [bMin, bMax] = options.bleu;
  const volume = Math.max(0, Math.min(1, (options.volume ?? 80) / 100)) * 0.5;

  const phase = { r: 0, g: 0, b: 0 };
  let echantillonGlobal = 0;

  for (const { x, y } of pixelsEnOrdre(pixels.width, pixels.height, options.balayage)) {
    const idx = (y * pixels.width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const freqR = frequenceDepuisValeur(r, rMin, rMax);
    const freqG = frequenceDepuisValeur(g, gMin, gMax);
    const freqB = frequenceDepuisValeur(b, bMin, bMax);
    const ampR = (r / 255) * volume;
    const ampG = (g / 255) * volume;
    const ampB = (b / 255) * volume;

    const deltaR = (2 * Math.PI * freqR) / sr;
    const deltaG = (2 * Math.PI * freqG) / sr;
    const deltaB = (2 * Math.PI * freqB) / sr;

    for (let i = 0; i < echantillonsParPixel; i++) {
      const sample = Math.sin(phase.r) * ampR + Math.sin(phase.g) * ampG + Math.sin(phase.b) * ampB;
      phase.r += deltaR;
      phase.g += deltaG;
      phase.b += deltaB;
      for (let ch = 0; ch < channels; ch++) {
        buffer.getChannelData(ch)[echantillonGlobal] = sample;
      }
      echantillonGlobal++;
    }
  }

  return buffer;
}

export async function sonifierImage(fichier: File, options: OptionsPixeltone, largeurMax?: number): Promise<AudioBuffer> {
  const pixels = await imageDataDepuisFichier(fichier, largeurMax);
  return sonifierDepuisPixels(pixels, options);
}
