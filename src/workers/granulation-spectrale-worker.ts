// src/workers/granulation-spectrale-worker.ts — La granulation spectrale, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/granulation-spectrale.ts` : ce
// fichier ne fait que les joindre. Le module de calcul ne mentionne jamais `AudioBuffer` et
// travaille déjà par voie.
//
// POURQUOI HORS DU FIL. La reconstruction de phase est la part lourde du procédé : PGHI parcourt
// tout le spectrogramme par un tas de priorité, et Griffin-Lim le reparcourt une fois par tour
// demandé. La durée du son, la taille écrite et le recouvrement décident ensemble du nombre de
// trames, de sorte que le coût monte vite sans que le réglage qui le fait monter soit visible.
import {
  granulationSpectraleVoie,
  type OptionsGranulationSpectrale, type ResultatGranulationSpectrale,
} from "../audio/granulation-spectrale";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsGranulationSpectrale, ResultatGranulationSpectrale>(granulationSpectraleVoie);
