// src/workers/atomes-worker.ts — La poursuite adaptative d'une voie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/atomes.ts`, qui ne mentionne jamais
// `AudioBuffer` : ce fichier ne fait que les joindre.
import { decomposer, type Decomposition, type OptionsDecomposition } from "../audio/atomes";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsDecomposition, Decomposition>(decomposer);
