// src/workers/multicanal-worker.ts — Le placement et le rendu multicanal, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/multicanal.ts` : ce fichier ne fait
// que les joindre. UNE SEULE TÂCHE : la source se place canal de sortie par canal de sortie, mais
// tous lisent le même mono et les mêmes gains, et les objets s'additionnent dans la même salle.
// Le « Spatialiseur » et le « Rendu d'objets » partagent cet ouvrier.
//
// **Relevé avant, sur deux minutes de son et sans qu'un seul message passe : 663 ms pour le
// Spatialiseur, 872 ms pour le Rendu d'objets, tous deux en 7.1.4.**
import { rendreMulticanal, type DemandeMulticanal } from "../audio/multicanal";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandeMulticanal, Float32Array[]>(rendreMulticanal);
