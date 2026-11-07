// audio/emotion-mesures.ts — Ce que l'analyse émotionnelle mesure, sans un mot de texte.
//
// Ses quatre indices viennent de deux mesures : l'analyse d'ensemble, qui donne le tempo et le mode,
// et les descripteurs de Meyda, qui donnent la sonie et la brillance. Les deux se font ici, dans le
// worker ; `emotion.ts` les combine en valence et en éveil, et rédige.

import { mesurerAnalyse, type MesuresAnalyse } from "./analyse-mesures";
import { melangerVoies } from "./commun";
import { extraireValeursMeyda, valeursCentroideHz } from "./descripteurs-valeurs";

export interface DemandeEmotion {
  /**
   * Les canaux du son. L'analyse d'ensemble ne lit que le premier, les descripteurs lisent leur
   * mélange, et le mélange se fait ICI : fait dans la page, il gelait de 9 à 10 ms avant l'envoi.
   */
  canaux: Float32Array[];
  sampleRate: number;
}

export interface MesuresEmotion {
  analyse: MesuresAnalyse;
  /** La valeur efficace et le centroïde en hertz de chaque trame, aux réglages par défaut. */
  rms: number[];
  centroide: number[];
}

export function mesurerEmotion({ canaux, sampleRate }: DemandeEmotion): MesuresEmotion {
  const melange = melangerVoies(canaux);
  return {
    analyse: mesurerAnalyse({ mono: canaux[0], sampleRate }),
    rms: extraireValeursMeyda(melange, sampleRate, "rms"),
    centroide: valeursCentroideHz(melange, sampleRate),
  };
}
