// audio/couleur-rgb.ts — Synthèse d'une couleur RGB en trois oscillateurs.
// Chaque canal (R, G, B) pilote une fréquence dans une plage réglable.

import { plafonnerCrete } from "./commun";
import { frequenceDepuisValeur } from "./commun";

export interface OptionsCouleurRGB {
  r: number;
  g: number;
  b: number;
  duree: number;
  volume: number;
  canaux: 1 | 2;
  rouge: [number, number];
  vert: [number, number];
  bleu: [number, number];
  sampleRate?: number;
}

export function genererCouleurRGBAudio(options: OptionsCouleurRGB): AudioBuffer {
  const sr = options.sampleRate ?? 44100;
  const length = Math.max(1, Math.round(options.duree * sr));
  const channels = options.canaux === 1 ? 1 : 2;
  const buffer = new AudioBuffer({ numberOfChannels: channels, length, sampleRate: sr });
  const vol = Math.max(0, Math.min(1, options.volume / 100)) * 0.5;

  const freqR = frequenceDepuisValeur(options.r, ...options.rouge);
  const freqG = frequenceDepuisValeur(options.g, ...options.vert);
  const freqB = frequenceDepuisValeur(options.b, ...options.bleu);

  const phase = { r: 0, g: 0, b: 0 };
  const deltaR = (2 * Math.PI * freqR) / sr;
  const deltaG = (2 * Math.PI * freqG) / sr;
  const deltaB = (2 * Math.PI * freqB) / sr;

  // Les tableaux des canaux sont pris une fois, hors de la boucle : les redemander à chaque
  // échantillon coûtait 21 s pour 4 s de son sous le moteur audio des tests.
  const sorties = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  for (let i = 0; i < length; i++) {
    const sample = (Math.sin(phase.r) + Math.sin(phase.g) + Math.sin(phase.b)) * vol;
    phase.r += deltaR;
    phase.g += deltaG;
    phase.b += deltaB;
    for (let ch = 0; ch < channels; ch++) sorties[ch][i] = sample;
  }

  // Trois sinus à la moitié du volume chacun : jusqu'à 1,2 au volume par défaut.
  return plafonnerCrete(buffer);
}

export function parsePlage(texte: string, defaut: [number, number]): [number, number] {
  const parts = texte.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
  if (parts.length >= 2) return [Math.max(20, parts[0]), Math.max(20, parts[1])];
  return defaut;
}
