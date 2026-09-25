// src/workers/sms-worker.ts — L'analyse SMS d'une voie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/sms.ts`, qui ne mentionne jamais
// `AudioBuffer` : ce fichier ne fait que les joindre.
import { traiterVoie, type OptionsVoieSms, type VoieSms } from "../audio/sms";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsVoieSms, VoieSms>(traiterVoie);
