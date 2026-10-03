// src/workers/gout-worker.ts — Les cinq dimensions du goût d'un son, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/gout.ts` : ce fichier ne fait que
// les joindre. Les canaux sont rassemblés en une voie AVANT l'envoi, un goût étant une propriété du
// son et non de son image stéréo : l'ouvrier n'en reçoit donc qu'une.
//
// **Relevé avant, sur trois secondes de son : 248 millisecondes pour « Le goût d'un son », sans
// qu'un seul message passe ; et c'est la plus légère des trois prises.** Le coût est dans le suivi
// de hauteur et dans la dissonance des partiels, une transformée par trame chacun.
import { mesurerVoie, type MesuresGout, type OptionsVoieGout } from "../audio/gout";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsVoieGout, MesuresGout>(mesurerVoie);
