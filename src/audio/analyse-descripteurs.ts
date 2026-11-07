// audio/analyse-descripteurs.ts — Les descripteurs spectraux, et leur agregation.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import Meyda from "meyda";
import { traduire } from "../i18n";
import { normaliserAggregation, traduireAggregation } from "./analyse-transcription";
import { mixdownMono } from "./commun";
import { versDb } from "./decibels";
import {
  agregerValeurs, extraireValeursMeyda as valeursMeyda, tailleFenetreAnalyse, valeursCentroideHz,
  type MeydaFeatureSimple, type OptionsCentroidSpectral,
} from "./descripteurs-valeurs";

// L'extraction et l'agrégation vivent dans `descripteurs-valeurs.ts`, que lit le worker.
export type { MeydaFeatureSimple, OptionsCentroidSpectral } from "./descripteurs-valeurs";

export interface ResultatCentroidSpectral {
  valeur: number;
  texte: string;
  trames: number;
}

/** L'extraction de `descripteurs-valeurs.ts`, sur le mélange mono du tampon. */
function extraireValeursMeyda(
  buffer: AudioBuffer,
  feature: MeydaFeatureSimple,
  options: OptionsCentroidSpectral = {},
): number[] {
  return valeursMeyda(mixdownMono(buffer), buffer.sampleRate, feature, options);
}

// MFCC : Meyda renvoie un tableau de coefficients par trame (pas un scalaire
// comme les autres features), donc extraireValeursMeyda ne convient pas ici —
// même découpage en trames, mais on garde le tableau complet par trame.
export function extraireMFCC(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): number[][] {
  const fenetre = tailleFenetreAnalyse(options.fenetre || 2048);
  const pas = Math.max(64, options.pas || Math.floor(fenetre / 2));
  const sr = buffer.sampleRate;
  const length = buffer.length;
  const mono = mixdownMono(buffer);

  Meyda.sampleRate = sr;
  Meyda.bufferSize = fenetre;
  Meyda.windowingFunction = "hanning";

  const trames: number[][] = [];
  for (let debut = 0; debut + fenetre <= length; debut += pas) {
    const frame = mono.slice(debut, debut + fenetre);
    const features = Meyda.extract("mfcc", frame);
    if (Array.isArray(features) && features.every((v) => Number.isFinite(v))) trames.push(features as number[]);
  }
  return trames;
}

export function calculerCentroidSpectralMeyda(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): ResultatCentroidSpectral {
  return resultatCentroide(valeursCentroideHz(mixdownMono(buffer), buffer.sampleRate, options), options);
}

/** Le centroïde agrégé et son texte, sur les valeurs par trame en hertz qu'a rendues l'extraction. */
export function resultatCentroide(valeurs: number[], options: OptionsCentroidSpectral = {}): ResultatCentroidSpectral {
  const aggregation = normaliserAggregation(options.aggregation || "moyenne");
  const aggLabel = traduireAggregation(options.aggregation || "moyenne");
  if (valeurs.length === 0) {
    return { valeur: 0, texte: traduire("analyse.non_calculable", traduire("analyse.centroide_spectral_label")), trames: 0 };
  }

  const valeur = agregerValeurs(valeurs, aggregation);
  const texte = traduire("analyse.centroide_spectral", valeur.toFixed(1), aggLabel, valeurs.length);
  return { valeur, texte, trames: valeurs.length };
}

export function calculerRMS_Meyda(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): ResultatCentroidSpectral {
  return resultatRms(extraireValeursMeyda(buffer, "rms", options), options);
}

/** La valeur efficace agrégée, en décibels, et son texte, sur les valeurs par trame de l'extraction. */
export function resultatRms(valeurs: number[], options: OptionsCentroidSpectral = {}): ResultatCentroidSpectral {
  const aggregation = normaliserAggregation(options.aggregation || "moyenne");
  const aggLabel = traduireAggregation(options.aggregation || "moyenne");
  if (valeurs.length === 0) {
    return { valeur: -Infinity, texte: traduire("analyse.non_calculable", traduire("analyse.rms_label")), trames: 0 };
  }
  const rms = agregerValeurs(valeurs, aggregation);
  const db = versDb(rms + 1e-10);
  const texte = traduire("analyse.rms", db.toFixed(1), aggLabel, valeurs.length);
  return { valeur: db, texte, trames: valeurs.length };
}

export function calculerZCR_Meyda(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): ResultatCentroidSpectral {
  const valeurs = extraireValeursMeyda(buffer, "zcr", options);
  const aggregation = normaliserAggregation(options.aggregation || "moyenne");
  const aggLabel = traduireAggregation(options.aggregation || "moyenne");
  if (valeurs.length === 0) {
    return { valeur: 0, texte: traduire("analyse.non_calculable", traduire("analyse.zcr_label")), trames: 0 };
  }
  const valeur = agregerValeurs(valeurs, aggregation);
  const texte = traduire("analyse.zcr", valeur.toFixed(0), aggLabel, valeurs.length);
  return { valeur, texte, trames: valeurs.length };
}

// LE ROLLOFF ARRIVE DE MEYDA DÉJÀ EN HERTZ, à la différence du centroïde qui arrive en indice de
// case : meyda le calcule comme `(n + 1) × sampleRate / (2 × (taille − 1))`. Il était multiplié une
// seconde fois par `sampleRate / fenêtre`, soit ×23,4 à 48 kHz sur 2 048 points : le nœud annonçait
// 551 040 Hz pour un son dont la fréquence de Nyquist est 24 000 Hz. Corrigé le 2026-10-28.
export function calculerRolloffSpectralMeyda(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): ResultatCentroidSpectral {
  const valeurs = extraireValeursMeyda(buffer, "spectralRolloff", options);
  const aggregation = normaliserAggregation(options.aggregation || "moyenne");
  const aggLabel = traduireAggregation(options.aggregation || "moyenne");
  if (valeurs.length === 0) {
    return { valeur: 0, texte: traduire("analyse.non_calculable", traduire("analyse.rolloff_spectral_label")), trames: 0 };
  }
  const valeur = agregerValeurs(valeurs, aggregation);
  const texte = traduire("analyse.rolloff_spectral", valeur.toFixed(1), aggLabel, valeurs.length);
  return { valeur, texte, trames: valeurs.length };
}

