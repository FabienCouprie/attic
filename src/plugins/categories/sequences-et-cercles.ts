// plugins/categories/sequences-et-cercles.ts — La vidéo, les séquences et les cercles.
//
// La vidéo et les spirales, puis les séquences, les arbres rythmiques, les solveurs et les cercles.
//
// UNE TRANCHE DE L'ORDRE DU CATALOGUE, ET NON UN THÈME PUR : voir `plugins/index.ts`.
import type { FicheAudio } from "../../audio/types-domaine";

import { fiches as f_montage_video } from "../montage-video";
import { fiches as f_extrait_video } from "../extrait-video";
import { fiches as f_separer_image_son } from "../separer-image-son";
import { fiches as f_bruitage_ia } from "../bruitage-ia";
import { fiches as f_visualiseur_multipiste } from "../visualiseur-multipiste";
import { fiches as f_spirale_quintes } from "../spirale-quintes";
import { fiches as f_spirale_logarithmique } from "../spirale-logarithmique";
import { fiches as f_harmonie_spectrale } from "../harmonie-spectrale";
import { fiches as f_sequence } from "../sequence";
import { fiches as f_midi_vers_sequence } from "../midi-vers-sequence";
import { fiches as f_sequence_formes } from "../sequence-formes";
import { fiches as f_series_morphologie } from "../series-morphologie";
import { fiches as f_arbre_rythmique } from "../arbre-rythmique";
import { fiches as f_quantification } from "../quantification";
import { fiches as f_voix } from "../voix";
import { fiches as f_maquette } from "../maquette";
import { fiches as f_separation_voix } from "../separation-voix";
import { fiches as f_contrepoint_solveur } from "../contrepoint-solveur";
import { fiches as f_evolution } from "../evolution";
import { fiches as f_reecriture_arbre } from "../reecriture-arbre";
import { fiches as f_matrice_parametres } from "../matrice-parametres";
import { fiches as f_formule_sequence } from "../formule-sequence";
import { fiches as f_boucle_voix } from "../boucle-voix";
import { fiches as f_boucle_creneau } from "../boucle-creneau";
import { fiches as f_solveur_contraintes } from "../solveur-contraintes";
import { fiches as f_rouleau_sequence } from "../rouleau-sequence";
import { fiches as f_cercle } from "../cercle";
import { fiches as f_cercle_transformations } from "../cercle-transformations";
import { fiches as f_cercle_boucle } from "../cercle-boucle";
import { fiches as f_cercle_assemblage } from "../cercle-assemblage";
import { fiches as f_sequence_assemblage } from "../sequence-assemblage";
import { fiches as f_micromontage } from "../micromontage";
import { fiches as f_passage_zero } from "../passage-zero";
import { fiches as f_dosage } from "../dosage";
import { fiches as f_cercle_film } from "../cercle-film";
import { fiches as f_video_export } from "../video-export";
import { fiches as f_spirale_spatiale } from "../spirale-spatiale";
import { fiches as f_ampleur } from "../ampleur";
import { fiches as f_arc_en_ciel } from "../arc-en-ciel";
import { fiches as f_sequence_sur_banque } from "../sequence-sur-banque";

export const fiches = [
  ...f_montage_video,
  ...f_extrait_video,
  ...f_separer_image_son,
  ...f_bruitage_ia,
  ...f_visualiseur_multipiste,
  ...f_spirale_quintes,
  ...f_spirale_logarithmique,
  ...f_harmonie_spectrale,
  ...f_sequence,
  ...f_midi_vers_sequence,
  ...f_sequence_formes,
  ...f_series_morphologie,
  ...f_arbre_rythmique,
  ...f_quantification,
  ...f_voix,
  ...f_maquette,
  ...f_separation_voix,
  ...f_contrepoint_solveur,
  ...f_evolution,
  ...f_reecriture_arbre,
  ...f_matrice_parametres,
  ...f_formule_sequence,
  ...f_boucle_voix,
  ...f_boucle_creneau,
  ...f_solveur_contraintes,
  ...f_rouleau_sequence,
  ...f_cercle,
  ...f_cercle_transformations,
  ...f_cercle_boucle,
  ...f_cercle_assemblage,
  ...f_sequence_assemblage,
  ...f_micromontage,
  ...f_passage_zero,
  ...f_dosage,
  ...f_cercle_film,
  ...f_video_export,
  ...f_spirale_spatiale,
  ...f_ampleur,
  ...f_arc_en_ciel,
  ...f_sequence_sur_banque,
] as FicheAudio[];
