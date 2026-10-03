// src/workers/tonalite-worker.ts — Le changement de tonalité d'une voie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/effets-spectral.ts`. Le cœur pur
// existait déjà, extrait pour l'harmonizer qui en dépend : le composant qui le porte, lui, était
// resté dans le fil. **Mesuré sur trois secondes de son : 245 millisecondes, et pas un seul message
// pendant ce temps**, donc un gel total.
import { changerTonaliteVoie } from "../audio/effets-spectral";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<Record<string, number>, Float32Array>((x, o) => changerTonaliteVoie(x, o.demiTons));
