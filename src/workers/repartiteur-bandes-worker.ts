// src/workers/repartiteur-bandes-worker.ts — Le découpage en bandes, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/repartiteur-bandes.ts` : ce fichier ne
// fait que les joindre. Les neuf voies d'un canal repartent transférées, et non recopiées.
import { repartirVoie, type OptionsRepartition, type ResultatRepartition } from "../audio/repartiteur-bandes";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsRepartition, ResultatRepartition>(repartirVoie);
