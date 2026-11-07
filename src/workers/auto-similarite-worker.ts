// src/workers/auto-similarite-worker.ts — La matrice d'auto-similarité, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/auto-similarite.ts` : ce fichier ne
// fait que les joindre. UNE SEULE TÂCHE : la matrice compare chaque trame à chaque autre, et ne se
// coupe pas. Le texte de la structure, qui suit la langue, se rédige dans la page.
//
// **Relevé avant, sur deux minutes de son et sans qu'un seul message passe : 1 128 ms à la trame de
// 0,1 s, autant à celle de 0,5 s, le chromagramme pesant plus que la matrice.**
import { analyserAutoSimilarite, type DemandeAutoSimilarite, type ResultatAutoSimilarite } from "../audio/auto-similarite";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandeAutoSimilarite, ResultatAutoSimilarite>(analyserAutoSimilarite);
