// src/workers/spectrogramme-worker.ts — La synthèse d'un spectrogramme, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/spectrogramme-mel.ts` : ce fichier
// ne fait que les joindre. Ce module de calcul ne mentionne jamais `AudioBuffer`, ce qui est
// exactement ce qui le rend transportable ici.
//
// POURQUOI CELUI-CI EN PARTICULIER. Trente-deux tours de Griffin-Lim sur cinq secondes de son
// coûtent vingt-cinq secondes, et relevé par Fabien : « quand un seul composant prend du temps, cela
// fige toute l'application ». C'est le calcul le plus long de la famille, donc le premier à sortir.
import { synthetiserVoie, type OptionsSynthese, type Synthese } from "../audio/spectrogramme-mel";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsSynthese, Synthese>(synthetiserVoie);
