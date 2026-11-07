// audio/analyse-transcription.ts — Trouver les pics d'un spectre, et en tirer des notes.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import type { NoteEvenement } from "./midi-sequence";
import { traduire } from "../i18n";
import type { OptionsCentroidSpectral } from "./analyse-descripteurs";
import { transcrireMonoVoies } from "./transcription-mesures";

// La taille de fenêtre de l'analyse vit dans `descripteurs-valeurs.ts`, que lit le worker.
export { tailleFenetreAnalyse } from "./descripteurs-valeurs";
// Les pics du spectre et les notes qu'on en tire vivent dans `transcription-mesures.ts`, que lit le
// worker du Transcripteur MIDI.
export { fusionnerNotesRepetees } from "./transcription-mesures";

// Accepte l'id canonique ("moyenne"/"mediane"/"maximum"), l'ancien libellé
// français ET l'anglais. Le cas « Médiane » était un bug silencieux : son
// `toLowerCase()` vaut « médiane » (avec accent), ne correspondait à aucun cas,
// et repartait tel quel — or le calcul en aval teste `case "mediane"` (sans
// accent) et retombait donc sur la moyenne. Autrement dit, choisir « Médiane »
// en français calculait en réalité une moyenne, alors que « Median » en anglais
// fonctionnait. Les `optionIds` suppriment la cause à la racine ; cette
// tolérance reste nécessaire pour les projets déjà enregistrés.
export function normaliserAggregation(valeur: string): OptionsCentroidSpectral["aggregation"] {
  switch (valeur.trim().toLowerCase()) {
    case "moyenne": case "average": return "moyenne";
    case "mediane": case "médiane": case "median": return "mediane";
    case "maximum": return "maximum";
    default: return "moyenne";
  }
}

export function traduireAggregation(valeur: string): string {
  const map: Record<string, string> = {
    "moyenne": "analyse.aggregation_moyenne",
    "mediane": "analyse.aggregation_mediane",
    "maximum": "analyse.aggregation_maximum",
    "average": "analyse.aggregation_moyenne",
    "median": "analyse.aggregation_mediane",
  };
  return map[valeur.toLowerCase()] ? traduire(map[valeur.toLowerCase()]) : valeur;
}

export function traduireType(valeur: string): string {
  const map: Record<string, string> = {
    "chanson": "analyse.chanson",
    "instrumental": "analyse.instrumental",
    "incertain": "analyse.incertain",
  };
  return map[valeur] ? traduire(map[valeur]) : valeur;
}

/** La transcription monophonique d'un tampon : celle de `transcription-mesures.ts`, sur ses canaux. */
export function transcrireMono(
  buffer: AudioBuffer,
  seuilOnset: number,
  noteMin: number,
  noteMax: number,
): NoteEvenement[] {
  const canaux = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  return transcrireMonoVoies(canaux, buffer.sampleRate, seuilOnset, noteMin, noteMax);
}
