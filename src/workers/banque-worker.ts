// src/workers/banque-worker.ts — Les zones d'une banque de clavier, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/clavier-banque-lot.ts` : ce fichier
// ne fait que les joindre. C'est le PREMIER worker du dépôt qui travaille par tâche et non par
// canal, et le premier qu'on lance à plusieurs exemplaires en même temps.
//
// **Relevé avant, sur trois secondes de son : 14 390 millisecondes, sans qu'un seul message passe.**
// C'était le plus long gel de tout le catalogue, et le seul que le socle par canal ne pouvait pas
// prendre : la banque ne découpe pas son travail par canal mais par racine.
import { preparerBanque, zoneDuLot, type OptionsLotBanque, type PrepareBanque, type ZoneBrute } from "../audio/clavier-banque-lot";
import { servirParLot } from "./servir-par-lot";

servirParLot<OptionsLotBanque, PrepareBanque, ZoneBrute>(preparerBanque, zoneDuLot);
