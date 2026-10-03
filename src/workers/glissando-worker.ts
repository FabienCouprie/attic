// src/workers/glissando-worker.ts — Le glissando de tonalité d'une voie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/effets-spectral.ts`. Il n'a pu
// venir ici qu'après avoir donné un cœur pur au glissando : `AudioBuffer` n'y servait que de
// récipient, et c'est lui seul qui retenait le calcul dans le fil.
//
// POURQUOI CELUI-CI D'ABORD. **Mesuré sur trois secondes de son : 615 millisecondes, et pas un seul
// message pendant ce temps.** C'était le plus long gel total du relevé, tous effets confondus.
import { glissandoTonaliteVoie, type OptionsGlissando } from "../audio/effets-spectral";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<Record<string, number>, Float32Array>(
  (x, o) => glissandoTonaliteVoie(x, o as unknown as OptionsGlissando),
);
