// src/workers/hauteur-worker.ts — Le suivi de hauteur d'une voie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/hauteur.ts`, qui ne mentionne jamais
// `AudioBuffer` : ce fichier ne fait que les joindre. Le coût vaut le détour, la notice du composant
// l'annonçant à environ 112 ms par seconde de son : une prise de trois minutes figeait donc
// l'application une vingtaine de secondes.
import { suivreVoie, type OptionsVoieHauteur, type SuiviHauteur } from "../audio/hauteur";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsVoieHauteur, SuiviHauteur>(suivreVoie);
