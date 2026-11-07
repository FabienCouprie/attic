// src/workers/analyse-worker.ts — La mesure de l'analyse d'ensemble, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/analyse-mesures.ts` : ce fichier ne
// fait que les joindre. UNE SEULE TÂCHE : le tempo, la tonalité et le type se mesurent sur le même
// canal. Le rapport, qui passe par `traduire`, se rédige dans la page avec `decrireAnalyse`.
//
// **Relevé avant, sur les trois secondes du son d'essai et sans qu'un seul message passe : 112 ms
// pour le « Détecteur de tempo », 111 ms pour l'« Analyse audio ».**
import { mesurerAnalyse, type DemandeAnalyse, type MesuresAnalyse } from "../audio/analyse-mesures";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandeAnalyse, MesuresAnalyse>(mesurerAnalyse);
