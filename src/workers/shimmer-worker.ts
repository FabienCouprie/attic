// src/workers/shimmer-worker.ts — Le shimmer d'une voie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/reverbes-etendues.ts`. Ce module
// employait le Web Audio en un seul point, un `new AudioBuffer` posé pour appeler la transposition :
// c'était ce qui interdisait à ce composant de sortir du fil, et le cœur pur de la transposition l'a
// levé.
import { shimmerVoie, type OptionsVoieShimmer, type ResultatShimmer } from "../audio/reverbes-etendues";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsVoieShimmer, ResultatShimmer>(shimmerVoie);
