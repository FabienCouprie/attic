// src/workers/correction-hauteur-worker.ts — La correction de hauteur d'une voie, hors du fil.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/correction-hauteur.ts`, qui ne
// mentionne jamais `AudioBuffer` : ce fichier ne fait que les joindre.
import {
  corrigerHauteur, type OptionsCorrection, type ResultatCorrection,
} from "../audio/correction-hauteur";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsCorrection, ResultatCorrection>(corrigerHauteur);
