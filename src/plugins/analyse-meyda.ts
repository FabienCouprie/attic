// plugins/analyse-meyda.ts — Les quatre descripteurs que la bibliothèque Meyda calcule, nés d'une fabrique.
//
// POURQUOI CE FICHIER, et il n'a rien changé à ce qu'ils font. Ils vivaient dans `analyse.ts`, qui a
// atteint quatre cents lignes de code, le plafond de la norme, et que la pièce 1 du plan
// `work/plan-reglages-par-nom-2026-11-11.md` faisait passer d'une ligne au-delà. Ils en sont la part
// la plus détachable : une fabrique et ses quatre appels, qui ne partagent rien avec les autres fiches.
//
// ILS GARDENT LEUR PLACE AU REGISTRE : `analyse.ts` les étale à l'endroit exact où ils étaient
// écrits, de sorte que l'ordre de la palette et du catalogue ne bouge pas, et que `avecDoc` et la
// table des noms dits les traitent comme avant.
import type { FicheAudio } from "../audio/types-domaine";
import {
  calculerCentroidSpectralMeyda, calculerRMS_Meyda, calculerZCR_Meyda, calculerRolloffSpectralMeyda,
  type OptionsCentroidSpectral, type ResultatCentroidSpectral,
} from "../audio";
import { entreeAudio, sansEntree } from "./lire-entree";

function noeudMeyda(
  id: string,
  nom: string,
  nomEn: string,
  resume: string,
  resumeEn: string,
  nomSortie: string,
  nomSortieEn: string,
  fn: (audio: AudioBuffer, options: OptionsCentroidSpectral) => ResultatCentroidSpectral,
): FicheAudio {
  return {
    id, nom, nomEn, univers: "Visualisation", famille: "Analyse",
    resume, resumeEn,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: nomSortie, nomEn: nomSortieEn, type: "texte" }],
    parametres: [
      { nom: "Fenêtre", nomEn: "Window", type: "nombre", plage: [64, 8192], pas: 64, defaut: 2048, unite: "éch.", uniteEn: "samples",
        doc: "Taille de la fenêtre d'analyse (arrondie à la puissance de 2 supérieure).", docEn: "Analysis window size (rounded up to the next power of 2)." },
      { nom: "Pas", nomEn: "Hop", type: "nombre", plage: [64, 4096], pas: 64, defaut: 1024, unite: "éch.", uniteEn: "samples",
        doc: "Décalage entre deux fenêtres d'analyse.", docEn: "Hop size between analysis frames." },
      { nom: "Agrégation", nomEn: "Aggregation", type: "choix", options: ["Moyenne", "Médiane", "Maximum"], optionIds: ["moyenne","mediane","maximum"], defaut: "Moyenne",
        doc: "Méthode de combinaison des valeurs par trame.", docEn: "Aggregation method for the per-frame values.", optionsEn: ["Average", "Median", "Maximum"], defautEn: "Average" },
    ],
    async executer(ctx) {
      const audio = entreeAudio(ctx, 0, { sorties: 2 });
      if (sansEntree(audio)) return audio;
      const fenetre = ctx.paramNombre("Fenêtre", 2048);
      const pas = ctx.paramNombre("Pas", 1024);
      const aggregation = ctx.paramTexte("Agrégation", "Moyenne") as OptionsCentroidSpectral["aggregation"];
      const resultat = fn(audio, { fenetre, pas, aggregation });
      return { valeurs: [audio, resultat.texte], message: resultat.texte };
   },
  };
}

/** Les quatre descripteurs, dans l'ordre où le registre les a toujours portés. */
export const fichesMeyda: FicheAudio[] = [
  noeudMeyda(
    "centroide-spectral", "Centroïde spectral (Meyda)", "Spectral Centroid (Meyda)",
    "Calcule le centroïde spectral du signal avec la bibliothèque Meyda.",
    "Computes the spectral centroid of the signal using the Meyda library.",
    "Centroïde", "Centroid", calculerCentroidSpectralMeyda),
  noeudMeyda(
    "rms-meyda", "RMS (Meyda)", "RMS (Meyda)",
    "Calcule le niveau RMS moyen du signal en dBFS avec Meyda.",
    "Computes the average RMS level of the signal in dBFS using Meyda.",
    "RMS", "RMS", calculerRMS_Meyda),
  noeudMeyda(
    "zcr-meyda", "ZCR (Meyda)", "ZCR (Meyda)",
    "Compte les passages par zéro par fenêtre avec Meyda.",
    "Counts zero crossings per frame using Meyda.",
    "ZCR", "ZCR", calculerZCR_Meyda),
  noeudMeyda(
    "rolloff-spectral-meyda", "Rolloff spectral (Meyda)", "Spectral Rolloff (Meyda)",
    "Calcule la fréquence de rolloff spectral avec Meyda.",
    "Computes the spectral rolloff frequency using Meyda.",
    "Rolloff", "Rolloff", calculerRolloffSpectralMeyda),
];
