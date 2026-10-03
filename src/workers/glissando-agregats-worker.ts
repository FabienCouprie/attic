// src/workers/glissando-agregats-worker.ts — Le glissement entre deux agrégats, hors du fil.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/glissando.ts` : ce fichier ne fait
// que les joindre. `AudioBuffer` n'y servait que de récipient, et `OfflineAudioContext` de fabrique.
//
// **DEUX COMPOSANTS PARTAGENT CET OUVRIER**, « Glissando de gamme » et « Glissando harmonique » :
// le même rendu, deux manières de choisir les agrégats. Relevé avant, sans qu'un seul message
// passe : **492 millisecondes pour le premier, 176 pour le second.**
//
// UNE SEULE TÂCHE, et c'est le calcul qui l'impose : la phase s'accumule d'un échantillon au
// suivant, donc deux moitiés rendues séparément se recolleraient sur un saut de phase.
import { sonDuGlissando, type OptionsSonGlissando } from "../audio/glissando";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<OptionsSonGlissando, { echantillons: Float32Array }>(sonDuGlissando);
