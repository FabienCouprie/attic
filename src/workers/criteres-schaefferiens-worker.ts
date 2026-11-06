// src/workers/criteres-schaefferiens-worker.ts — Les critères de Schaeffer, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/criteres-schaefferiens.ts` : ce
// fichier ne fait que les joindre.
//
// UNE SEULE TÂCHE : la masse, la forme et l'allure se lisent sur le même canal, et le calcul ne se
// coupe pas en morceaux indépendants. Relevé au banc avant, dans le fil : 379 ms de gel total sur
// les trois secondes du son d'essai, sans qu'un seul message passe.
import {
  criteresDeLaDemande, type CriteresSchaefferiens, type DemandeCriteres,
} from "../audio/criteres-schaefferiens";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandeCriteres, CriteresSchaefferiens>(criteresDeLaDemande);
