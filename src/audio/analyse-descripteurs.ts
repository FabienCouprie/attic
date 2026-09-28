// audio/analyse-descripteurs.ts — Les descripteurs spectraux, et leur agregation.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import Meyda from "meyda";
import { traduire } from "../i18n";
import { normaliserAggregation, tailleFenetreAnalyse, traduireAggregation } from "./analyse-transcription";

export interface OptionsCentroidSpectral {
  fenetre?: number;
  pas?: number;
  aggregation?: "moyenne" | "mediane" | "maximum";
}

export interface ResultatCentroidSpectral {
  valeur: number;
  texte: string;
  trames: number;
}

export type MeydaFeatureSimple =
  | "rms"
  | "zcr"
  | "spectralCentroid"
  | "spectralRolloff"
  | "spectralFlatness"
  | "spectralSpread"
  | "energy";

function extraireValeursMeyda(
  buffer: AudioBuffer,
  feature: MeydaFeatureSimple,
  options: OptionsCentroidSpectral = {},
): number[] {
  const fenetre = tailleFenetreAnalyse(options.fenetre || 2048);
  const pas = Math.max(64, options.pas || Math.floor(fenetre / 2));
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < nCh; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / nCh;
  }

  Meyda.sampleRate = sr;
  Meyda.bufferSize = fenetre;
  Meyda.windowingFunction = "hanning";

  const valeurs: number[] = [];
  for (let debut = 0; debut + fenetre <= length; debut += pas) {
    const frame = mono.slice(debut, debut + fenetre);
    const features = Meyda.extract(feature, frame);
    const val = typeof features === "number" ? features : (features as any)?.[feature];
    if (typeof val === "number" && Number.isFinite(val)) valeurs.push(val);
  }
  return valeurs;
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
  const nCh = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < nCh; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / nCh;
  }

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

function agregerValeurs(
  valeurs: number[],
  aggregation: OptionsCentroidSpectral["aggregation"] = "moyenne",
): number {
  if (valeurs.length === 0) return 0;
  switch (aggregation) {
    case "mediane": {
      const sorted = [...valeurs].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    case "maximum":
      return Math.max(...valeurs);
    case "moyenne":
    default:
      return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
  }
}

export function calculerCentroidSpectralMeyda(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): ResultatCentroidSpectral {
  const fenetre = tailleFenetreAnalyse(options.fenetre || 2048);
  const facteurHz = buffer.sampleRate / fenetre;
  const valeurs = extraireValeursMeyda(buffer, "spectralCentroid", options).map((v) => v * facteurHz);
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
  const valeurs = extraireValeursMeyda(buffer, "rms", options);
  const aggregation = normaliserAggregation(options.aggregation || "moyenne");
  const aggLabel = traduireAggregation(options.aggregation || "moyenne");
  if (valeurs.length === 0) {
    return { valeur: -Infinity, texte: traduire("analyse.non_calculable", traduire("analyse.rms_label")), trames: 0 };
  }
  const rms = agregerValeurs(valeurs, aggregation);
  const db = 20 * Math.log10(rms + 1e-10);
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

export function calculerRolloffSpectralMeyda(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): ResultatCentroidSpectral {
  const fenetre = tailleFenetreAnalyse(options.fenetre || 2048);
  const facteurHz = buffer.sampleRate / fenetre;
  const valeurs = extraireValeursMeyda(buffer, "spectralRolloff", options).map((v) => v * facteurHz);
  const aggregation = normaliserAggregation(options.aggregation || "moyenne");
  const aggLabel = traduireAggregation(options.aggregation || "moyenne");
  if (valeurs.length === 0) {
    return { valeur: 0, texte: traduire("analyse.non_calculable", traduire("analyse.rolloff_spectral_label")), trames: 0 };
  }
  const valeur = agregerValeurs(valeurs, aggregation);
  const texte = traduire("analyse.rolloff_spectral", valeur.toFixed(1), aggLabel, valeurs.length);
  return { valeur, texte, trames: valeurs.length };
}

