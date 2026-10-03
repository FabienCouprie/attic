// src/workers/hachee-worker.ts — La réverbération hachée, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/reverbes-etendues.ts` : ce fichier
// ne fait que les joindre. `AudioBuffer` n'y servait que de récipient.
//
// **Relevé avant, sur trois secondes de son : 154 millisecondes, sans qu'un seul message passe.**
// C'est le plus léger des composants déplacés, et il marque la frontière : sous cette centaine et
// demie de millisecondes, le démarrage de l'ouvrier coûterait plus que le gel qu'il évite.
import {
  reverberationHachee, type OptionsHachee, type ResultatHachee,
} from "../audio/reverbes-etendues";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsHachee, ResultatHachee>(reverberationHachee);
