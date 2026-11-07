// src/workers/inpainting-worker.ts — Le remplissage de trou, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/inpainting.ts` : ce fichier ne
// fait que les joindre. Le calcul travaillait déjà canal par canal, les trous se détectant sur
// chacun quand on ne les donne pas.
//
// **Relevé avant, sur les trois secondes du son d'essai et sans qu'un seul message passe : 749 ms
// pour les silences détectés à −20 dB, et 8 094 ms à −12 dB.**
import { boucherVoie, type ReglagesTrouVoie, type ResultatInpainting } from "../audio/inpainting";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<ReglagesTrouVoie, ResultatInpainting>(boucherVoie);
