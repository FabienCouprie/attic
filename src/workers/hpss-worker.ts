// src/workers/hpss-worker.ts — La séparation harmonique / percussive, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-canal`, le calcul dans `audio/hpss.ts` : ce fichier ne fait que
// les joindre. Ce module de calcul ne mentionne jamais `AudioBuffer` et travaillait déjà par voie ;
// il ne lui manquait qu'une signature à un seul objet de réglages.
//
// **Relevé avant, sur trois secondes de son : 585 millisecondes, sans qu'un seul message passe.**
import { separerVoie, type OptionsHpss, type ResultatHpss } from "../audio/hpss";
import { servirParCanal } from "./servir-par-canal";

servirParCanal<OptionsHpss, ResultatHpss>(separerVoie);
