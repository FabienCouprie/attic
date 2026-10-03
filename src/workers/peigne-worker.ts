// src/workers/peigne-worker.ts — Les peignes accordés d'une voie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/peigne.ts` : ce fichier ne fait que
// les joindre. `AudioBuffer` n'y servait que de récipient.
//
// **Relevé avant, sur trois secondes de son : 248 millisecondes, sans qu'un seul message passe.**
// Le coût vient de la boucle de rétroaction : une ligne à retard par note de l'accord, relue à
// chaque échantillon avec son passe-tout et son passe-bas.
import { peignesVoie, type OptionsPeigneVoie } from "../audio/peigne";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsPeigneVoie, Float32Array>(peignesVoie);
