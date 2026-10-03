// src/workers/ondelettes-worker.ts — Le seuillage par ondelettes, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/ondelettes.ts` : ce fichier ne fait
// que les joindre. Ce module de calcul ne mentionne jamais `AudioBuffer` et travaillait déjà par
// voie ; il ne lui manquait qu'une signature à un seul objet de réglages.
//
// **Relevé avant, sur trois secondes de son : 429 millisecondes, sans qu'un seul message passe.**
// Et le réglage « Décalages » multiplie ce temps par lui-même : à huit, le gel durait huit fois
// plus longtemps.
import { ondelettesVoie, type OptionsVoieOndelettes, type ResultatVoieOndelettes } from "../audio/ondelettes";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsVoieOndelettes, ResultatVoieOndelettes>(ondelettesVoie);
