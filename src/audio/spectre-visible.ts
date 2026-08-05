// audio/spectre-visible.ts — Spectre visible → spectre audible.
// Convertit une couleur (RGB) en longueur d'onde approximative, puis transpose
// la fréquence de la lumière dans le domaine audible par divisions d'octaves.

import { rgbToHsl } from "./couleurs";

export interface OptionsSpectreVisible {
  r: number;
  g: number;
  b: number;
  octave: number;
  duree: number;
  volume: number;
  canaux: 1 | 2;
  sampleRate?: number;
}

export function longueurOndeDepuisHue(hue: number): number {
  // Approximation : rouge ~ 700 nm, violet ~ 380 nm
  return 700 - (hue / 360) * 320;
}

export function frequenceAudibleDepuisCouleur(
  r: number,
  g: number,
  b: number,
  octave: number,
): { frequence: number; longueurOnde: number } {
  const [h] = rgbToHsl(r, g, b);
  const lambda = longueurOndeDepuisHue(h);
  const c = 299_792_458; // m/s
  const fLumiere = c / (lambda * 1e-9);
  const fAudible = fLumiere / Math.pow(2, octave + 40);
  return { frequence: fAudible, longueurOnde: lambda };
}

export function midiDepuisFrequence(frequence: number): number {
  return 69 + 12 * Math.log2(frequence / 440);
}

export function genererSpectreVisibleAudio(options: OptionsSpectreVisible): AudioBuffer {
  const sr = options.sampleRate ?? 44100;
  const length = Math.max(1, Math.round(options.duree * sr));
  const channels = options.canaux === 1 ? 1 : 2;
  const buffer = new AudioBuffer({ numberOfChannels: channels, length, sampleRate: sr });
  const vol = Math.max(0, Math.min(1, options.volume / 100)) * 0.5;
  const { frequence } = frequenceAudibleDepuisCouleur(options.r, options.g, options.b, options.octave);
  const delta = (2 * Math.PI * frequence) / sr;
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const sample = Math.sin(phase) * vol;
    phase += delta;
    for (let ch = 0; ch < channels; ch++) {
      buffer.getChannelData(ch)[i] = sample;
    }
  }
  return buffer;
}
