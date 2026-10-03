// src/workers/wishart-worker.ts — Les quatre mises en forme du spectre, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/spectral-wishart.ts` : ce fichier
// ne fait que les joindre. Ce module de calcul ne mentionne jamais `AudioBuffer` ; c'est le
// composant qui l'enveloppait qui retenait les quatre dans le fil.
//
// UN SEUL WORKER POUR QUATRE COMPOSANTS, parce que le mode voyage avec les réglages. Passer la
// transformation elle-même aurait demandé quatre workers, un par fonction, et quatre fois le même
// découpage en trames.
//
// **Relevé avant, sur trois secondes de son, et les quatre figeaient TOTALEMENT** : 329 ms pour le
// traçage, 260 pour le flou, 238 pour le glissando intérieur, sans qu'un seul message passe.
import { wishartVoie, type OptionsWishart } from "../audio/spectral-wishart";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsWishart, Float32Array>((x, o) => wishartVoie(x, o));
