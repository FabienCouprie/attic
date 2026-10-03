// src/workers/ecosysteme-worker.ts — L'écosystème de Di Scipio, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/ecosysteme.ts` : ce fichier ne fait
// que les joindre. `AudioBuffer` n'y servait que de récipient.
//
// **Relevé avant, sur trois secondes de monde et quinze secondes de sortie : 228 millisecondes, sans
// qu'un seul message passe.** Le coût ne vient pas de l'entrée mais de la DURÉE DEMANDÉE : la boucle
// tourne échantillon par échantillon sur toute la sortie, et le réglage monte jusqu'à deux minutes.
import { vivreVoie, type OptionsEcosysteme, type Resultat } from "../audio/ecosysteme";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsEcosysteme, Resultat>(vivreVoie);
