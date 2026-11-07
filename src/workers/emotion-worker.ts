// src/workers/emotion-worker.ts — La mesure de l'analyse émotionnelle, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/emotion-mesures.ts` : ce fichier ne
// fait que les joindre. UNE SEULE TÂCHE : l'analyse d'ensemble sur le premier canal, la sonie et la
// brillance sur le mélange. La combinaison et le rapport, qui passent par `traduire`, se font dans
// la page avec `decrireEmotion`.
//
// **Relevé avant, sur les trois secondes du son d'essai et sans qu'un seul message passe : 211 ms.**
import { mesurerEmotion, type DemandeEmotion, type MesuresEmotion } from "../audio/emotion-mesures";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandeEmotion, MesuresEmotion>(mesurerEmotion);
