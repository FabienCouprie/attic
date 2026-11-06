// src/workers/declipper-worker.ts — La restauration d'écrêtage, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/declipper.ts` : ce fichier ne fait
// que les joindre. Le calcul travaillait déjà canal par canal, le seuil se devinant sur chacun.
//
// **Relevé avant, sur les trois secondes du son d'essai et sans qu'un seul message passe :
// 2 875 ms au seuil manuel de 0,5, et 12 176 ms à celui de 0,3.**
import { declipperVoie, type ReglagesDeclipVoie, type ResultatDeclip } from "../audio/declipper";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<ReglagesDeclipVoie, ResultatDeclip>(declipperVoie);
