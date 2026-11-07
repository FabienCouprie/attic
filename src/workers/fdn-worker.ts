// src/workers/fdn-worker.ts — La réverbération à réseau de retards, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/fdn.ts` : ce fichier ne fait que les
// joindre. UNE SEULE TÂCHE : les deux côtés passent dans le même réseau, et la réponse
// impulsionnelle et ses deux mesures se prennent sur les mêmes réglages.
//
// **Relevé avant, sur les trois secondes du son d'essai et sans qu'un seul message passe : 105 ms,
// pour un calcul qui croît avec la durée du son et de sa queue.**
import { reverbererFdn, type DemandeFdn, type ResultatFdn } from "../audio/fdn";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandeFdn, ResultatFdn>(reverbererFdn);
