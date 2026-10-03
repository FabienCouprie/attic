// src/workers/cdp-worker.ts — Trois mises en forme du spectre, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/spectral-cdp.ts` : ce fichier ne
// fait que les joindre. Ce module de calcul ne mentionne jamais `AudioBuffer` ; c'est le passage
// par canal qui l'enveloppait qui retenait les trois dans le fil.
//
// UN SEUL WORKER POUR TROIS COMPOSANTS, parce que le mode voyage avec les réglages. Et les valeurs
// qui changeaient de trame en trame, jusqu'ici lues par un appel de fonction, voyagent en tableau :
// une fermeture ne se sérialise pas.
//
// **Relevé avant, sur trois secondes de son, et les trois figeaient TOTALEMENT** : 277 ms pour
// l'arpège, 265 pour l'étirement et pour le crible, sans qu'un seul message passe.
import { cdpVoie, type OptionsCdp } from "../audio/spectral-cdp";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsCdp, Float32Array>((x, o) => cdpVoie(x, o));
