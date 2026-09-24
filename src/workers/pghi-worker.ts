// src/workers/pghi-worker.ts — La reconstruction de phase, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/pghi.ts` : ce fichier ne fait que
// les joindre. `audio/pghi.ts` ne mentionne jamais `AudioBuffer`, ce qui est exactement ce qui le
// rend transportable ici.
import { reconstruire, type OptionsReconstruction, type Reconstruction } from "../audio/pghi";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsReconstruction, Reconstruction>(reconstruire);
