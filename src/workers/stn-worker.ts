// src/workers/stn-worker.ts — La séparation sinus / transitoires / bruit, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/stn.ts`, qui ne mentionne jamais
// `AudioBuffer` : ce fichier ne fait que les joindre.
import { separerStn, type ReglagesStn, type ResultatStn } from "../audio/stn";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<ReglagesStn, ResultatStn>(separerStn);
