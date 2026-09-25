// src/workers/texture-worker.ts — La synthèse de texture d'une voie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/texture-statistique.ts`, qui ne
// mentionne jamais `AudioBuffer` : ce fichier ne fait que les joindre. C'est le composant le plus
// lourd du catalogue, mesuré à 7 476 ms sur trois secondes de stéréo, et son coût ne dépend presque
// pas de l'entrée : il est fixé par la durée de sortie, dix secondes par défaut.
import { traiterVoie, type OptionsVoieTexture, type ResultatTexture } from "../audio/texture-statistique";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsVoieTexture, ResultatTexture>(traiterVoie);
