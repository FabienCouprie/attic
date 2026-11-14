// audio/analyse-transcription.ts — Les libellés de l'analyse : agrégation et type de pièce.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.
//
// LA TRANSCRIPTION MONOPHONIQUE QUI DONNAIT SON NOM À CE FICHIER EST PARTIE le 2026-11-14, avec le
// seul composant qui l'appelait, le « Transcripteur MIDI ». Le nom du fichier est resté.

import { traduire } from "../i18n";
import type { OptionsCentroidSpectral } from "./analyse-descripteurs";

// La taille de fenêtre de l'analyse vit dans `descripteurs-valeurs.ts`, que lit le worker.
export { tailleFenetreAnalyse } from "./descripteurs-valeurs";

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
