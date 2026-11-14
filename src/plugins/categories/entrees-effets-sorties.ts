// plugins/categories/entrees-effets-sorties.ts — Les entrées, les effets, l'analyse et les sorties.
//
// Le premier catalogue : les entrées de son et de fichier, les cinq fichiers d'effets, l'analyse,
// les sorties, le texte, le débruitage et l'esthétique.
//
// UNE TRANCHE DE L'ORDRE DU CATALOGUE, ET NON UN THÈME PUR : voir `plugins/index.ts`.
import type { FicheAudio } from "../../audio/types-domaine";

import { fiches as f_entrees } from "../entrees";
import { fiches as f_effets } from "../effets";
import { fiches as f_effets_spectral } from "../effets-spectral";
import { fiches as f_repartiteur_bandes } from "../repartiteur-bandes";
import { fiches as f_effets_midi } from "../effets-midi";
import { fiches as f_effets_modulation } from "../effets-modulation";
import { fiches as f_effets_temporel } from "../effets-temporel";
import { fiches as f_analyse } from "../analyse";
import { fiches as f_sorties } from "../sorties";
import { fiches as f_sortie_texte } from "../sortie-texte";
import { fiches as f_modifier_texte } from "../modifier-texte";
import { fiches as f_debruitage_ia } from "../debruitage-ia";
import { fiches as f_esthetique } from "../esthetique";
import { fiches as f_entrees_extra } from "../entrees-extra";

export const fiches = [
  ...f_entrees,
  // L'ORDRE COMPTE : c'est celui du catalogue engendré. Les cinq fichiers d'effets se suivent dans
  // l'ordre où leurs fiches se suivaient quand ils n'en faisaient qu'un.
  ...f_effets,
  ...f_effets_spectral,
  // Le découpage en bandes suit l'égaliseur, dont il reprend les neuf bandes.
  ...f_repartiteur_bandes,
  ...f_effets_midi,
  ...f_effets_modulation,
  ...f_effets_temporel,
  ...f_analyse,
  ...f_sorties,
  ...f_sortie_texte,
  ...f_modifier_texte,
  ...f_debruitage_ia,
  ...f_esthetique,
  ...f_entrees_extra,
] as FicheAudio[];
