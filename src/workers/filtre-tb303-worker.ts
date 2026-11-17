// src/workers/filtre-tb303-worker.ts — L'échelle à diodes, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/filtre-tb303.ts` : ce fichier ne fait
// que les joindre. La voie filtrée repart transférée, et non recopiée.
import { filtrerVoieTb303, type OptionsFiltreTb303, type ResultatFiltreTb303 } from "../audio/filtre-tb303";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsFiltreTb303, ResultatFiltreTb303>(filtrerVoieTb303);
