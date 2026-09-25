// src/workers/harmoniser-worker.ts — L'harmonizer d'une voie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/effets-spectral.ts`. Il n'a pu venir
// ici qu'après avoir donné un cœur pur à la transposition : ce composant dépend d'elle, et c'était
// `AudioBuffer`, simple récipient, qui le retenait dans le fil.
import { harmoniserVoie, type OptionsHarmoniser } from "../audio/effets-spectral";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<Record<string, number>, Float32Array>(
  (x, o) => harmoniserVoie(x, o as unknown as OptionsHarmoniser),
);
