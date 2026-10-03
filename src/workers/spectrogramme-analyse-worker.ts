// src/workers/spectrogramme-analyse-worker.ts — L'analyse en mels, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/spectrogramme-mel.ts` : ce fichier
// ne fait que les joindre.
//
// POURQUOI CELLE-CI AUSSI, alors que la synthèse est bien plus longue. Une fois la synthèse sortie,
// le gel qui restait était tout entier ici : **mesuré, 873 millisecondes pour cinq secondes de son**
// contre un pire trou de 973 millisecondes relevé sur la chaîne complète. Laisser la seule pièce
// qui fige encore, dans la famille qu'on vient d'écrire, serait livrer la moitié du travail.
import { analyserVoie, type Analyse, type OptionsAnalyse } from "../audio/spectrogramme-mel";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsAnalyse, Analyse>(analyserVoie);
