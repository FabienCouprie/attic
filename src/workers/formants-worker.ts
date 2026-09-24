// src/workers/formants-worker.ts — Le décalage de formants d'une voie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/formants.ts`. Il est le coût
// dominant du voice changer sur ses préréglages les plus employés ; les autres étapes de sa chaîne
// sont rendues par `OfflineAudioContext`, qui ne bloque pas le fil principal.
import { shiftFormantsVoie, type OptionsFormants } from "../audio/formants";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsFormants, Float32Array>(shiftFormantsVoie);
