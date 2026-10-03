// src/workers/formule-spectrale-worker.ts — La formule spectrale, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/math-formules.ts` : ce fichier ne
// fait que les joindre. `AudioBuffer` n'y servait que de récipient.
//
// **Relevé avant, sur trois secondes de son : 232 millisecondes, sans qu'un seul message passe.**
// Le coût vient du nombre d'évaluations : une par case de spectre et par trame, soit quelques
// centaines de milliers d'appels à une expression compilée.
import { formuleSpectraleVoie, type OptionsFormuleSpectrale } from "../audio/math-formules";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsFormuleSpectrale, Float32Array>(formuleSpectraleVoie);
