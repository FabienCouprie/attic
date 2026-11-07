// audio/emotion-mesures.ts — Ce que l'analyse émotionnelle mesure, sans un mot de texte.
//
// Ses quatre indices viennent de deux mesures : l'analyse d'ensemble, qui donne le tempo et le mode,
// et les descripteurs de Meyda, qui donnent la sonie et la brillance. Les deux se font ici, dans le
// worker ; `emotion.ts` les combine en valence et en éveil, et rédige.

import { mesurerAnalyse, type MesuresAnalyse } from "./analyse-mesures";
import { extraireValeursMeyda, valeursCentroideHz } from "./descripteurs-valeurs";

export interface DemandeEmotion {
  /** Le premier canal, seul lu par l'analyse d'ensemble. */
  mono: Float32Array;
  /** Le mélange de tous les canaux, que lisent les descripteurs. */
  melange: Float32Array;
  sampleRate: number;
}

export interface MesuresEmotion {
  analyse: MesuresAnalyse;
  /** La valeur efficace et le centroïde en hertz de chaque trame, aux réglages par défaut. */
  rms: number[];
  centroide: number[];
}

export function mesurerEmotion({ mono, melange, sampleRate }: DemandeEmotion): MesuresEmotion {
  return {
    analyse: mesurerAnalyse({ mono, sampleRate }),
    rms: extraireValeursMeyda(melange, sampleRate, "rms"),
    centroide: valeursCentroideHz(melange, sampleRate),
  };
}
