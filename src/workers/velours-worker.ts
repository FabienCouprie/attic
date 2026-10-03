// src/workers/velours-worker.ts — La réverbération par bruit de velours, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/velours.ts` : ce fichier ne fait que
// les joindre. `AudioBuffer` n'y servait que de récipient.
//
// **Relevé avant, sur trois secondes de son : 203 millisecondes, sans qu'un seul message passe.**
// Le coût vient des deux transformées de la convolution, dont la taille suit la somme des longueurs
// du son et de la queue — une queue de deux secondes porte donc le calcul à 262 144 points.
import { velourVoie, type OptionsVoieVelours, type VoieVelours } from "../audio/velours";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsVoieVelours, VoieVelours>(velourVoie);
