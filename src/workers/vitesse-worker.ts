// src/workers/vitesse-worker.ts — La lecture à vitesse variable, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/concret.ts` : ce fichier ne fait
// que les joindre. `AudioBuffer` n'y servait que de récipient, et c'est lui seul qui retenait le
// calcul dans le fil.
//
// **Relevé avant, sur trois secondes de son : 516 millisecondes, sans qu'un seul message passe.**
// La lecture coûte trente-deux multiplications par échantillon, le sinus cardinal fenêtré étant
// pris sur huit passages par zéro de chaque côté.
import { vitesseVariableVoie, type OptionsVitesse } from "../audio/concret";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsVitesse, Float32Array>(vitesseVariableVoie);
