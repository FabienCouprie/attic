// src/workers/spirale-worker.ts — La spirale équiangle rendue en son, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/spirale-logarithmique.ts` : ce
// fichier ne fait que les joindre. La synthèse était écrite DANS LA PRISE, où rien ne pouvait la
// sortir du fil ; elle a rejoint le module de calcul, qui ne mentionne pas `AudioBuffer`.
//
// **Relevé avant, sur les réglages par défaut : 342 millisecondes, sans qu'un seul message passe.**
// Le coût est un sinus par partiel et par échantillon, soit cinq millions de sinus.
//
// UNE SEULE TÂCHE : la phase de chaque partiel s'intègre d'un échantillon au suivant, et la
// normalisation de crête regarde la somme de tous les partiels sur toute la durée.
import { sonDeSpirale, type OptionsSonSpirale, type SonSpirale } from "../audio/spirale-logarithmique";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<OptionsSonSpirale, SonSpirale>(sonDeSpirale);
