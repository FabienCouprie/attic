// src/workers/binaural-worker.ts — Les battements binauraux, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/battements-binauraux.ts` : ce fichier
// ne fait que les joindre. `AudioBuffer` n'y servait que de récipient.
//
// **Relevé avant, sur les réglages par défaut : 475 millisecondes, sans qu'un seul message passe.**
// Le coût n'est pas dans la synthèse mais dans la MESURE que le rapport annonce — trois
// démodulations sur un million trois cent mille échantillons.
//
// UNE SEULE TÂCHE : les deux canaux se mesurent aussi en somme, donc ils ne sont pas indépendants,
// et la démodulation est un filtre récursif, qui ne se coupe pas en tranches.
import { rendreBinaural, type OptionsRendu, type RenduBinaural } from "../audio/battements-binauraux";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<OptionsRendu, RenduBinaural>(rendreBinaural);
