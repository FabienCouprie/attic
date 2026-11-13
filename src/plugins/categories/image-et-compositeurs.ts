// plugins/categories/image-et-compositeurs.ts — L'image et les compositeurs.
//
// L'image, la couleur et le PDF, l'alignement et la continuation spectrale, puis les procédés de
// compositeurs et les synthèses.
//
// UNE TRANCHE DE L'ORDRE DU CATALOGUE, ET NON UN THÈME PUR : voir `plugins/index.ts`.
import type { FicheAudio } from "../../audio/types-domaine";

import { fiches as f_image_export } from "../image-export";
import { fiches as f_export_svg } from "../export-svg";
import { fiches as f_image_rendu } from "../image-rendu";
import { fiches as f_pixeltone } from "../pixeltone";
import { fiches as f_palette_harmonique } from "../palette-harmonique";
import { fiches as f_dessin_sonore } from "../dessin-sonore";
import { fiches as f_couleur_rgb } from "../couleur-rgb";
import { fiches as f_spectre_visible } from "../spectre-visible";
import { fiches as f_color_looper } from "../color-looper";
import { fiches as f_camelot } from "../camelot";
import { fiches as f_entree_image } from "../entree-image";
import { fiches as f_entree_pdf } from "../entree-pdf";
import { fiches as f_extraction_pdf } from "../extraction-pdf";
import { fiches as f_lecteur_svg } from "../lecteur-svg";
import { fiches as f_separateur_canaux } from "../separateur-canaux";
import { fiches as f_hard_panner } from "../hard-panner";
import { fiches as f_ocr } from "../ocr";
import { fiches as f_carte_sonore } from "../carte-sonore";
import { fiches as f_automate_cellulaire } from "../automate-cellulaire";
import { fiches as f_texte_vers_dessin } from "../index-texte-vers-dessin";
import { fiches as f_legende_image } from "../legende-image";
import { fiches as f_algebre_musicale } from "../algebre-musicale";
import { fiches as f_coordonnees_sur_carte } from "../coordonnees-sur-carte";
import { fiches as f_alignement_dtw } from "../alignement-dtw";
import { fiches as f_etirement_dtw } from "../etirement-dtw";
import { fiches as f_pca_neuronale } from "../pca-neuronale";
import { fiches as f_continuation_spectrale } from "../continuation-spectrale";
import { fiches as f_accords_vers_notation } from "../accords-vers-notation";
import { fiches as f_risset } from "../risset";
import { fiches as f_lucier } from "../lucier";
import { fiches as f_apparier } from "../appariement-reference";
import { fiches as f_reich } from "../reich";
import { fiches as f_wishart } from "../wishart";
import { fiches as f_gendyn } from "../gendyn";
import { fiches as f_stockhausen } from "../stockhausen";
import { fiches as f_nancarrow } from "../nancarrow";
import { fiches as f_pulsars } from "../pulsars";
import { fiches as f_cribles } from "../cribles";
import { fiches as f_theorie_composition } from "../theorie-composition";
import { fiches as f_modeles_physiques } from "../modeles-physiques";
import { fiches as f_syntheses_exotiques } from "../syntheses-exotiques";
import { fiches as f_oscillateur_analogique } from "../oscillateur-analogique";
import { fiches as f_effets_rotatifs } from "../effets-rotatifs";
import { fiches as f_table_onde } from "../table-onde";
import { fiches as f_fm_operateurs } from "../fm-operateurs";
import { fiches as f_theorie_avancee } from "../theorie-avancee";
import { fiches as f_csound } from "../csound";

export const fiches = [
  ...f_image_export,
  ...f_export_svg,
  ...f_image_rendu,
  ...f_pixeltone,
  ...f_palette_harmonique,
  ...f_dessin_sonore,
  ...f_couleur_rgb,
  ...f_spectre_visible,
  ...f_color_looper,
  ...f_camelot,
  ...f_entree_image,
  ...f_entree_pdf,
  ...f_extraction_pdf,
  ...f_lecteur_svg,
  ...f_separateur_canaux,
  ...f_hard_panner,
  ...f_ocr,
  ...f_carte_sonore,
  ...f_automate_cellulaire,
  ...f_texte_vers_dessin,
  ...f_legende_image,
  ...f_algebre_musicale,
  ...f_coordonnees_sur_carte,
  ...f_alignement_dtw,
  ...f_etirement_dtw,
  ...f_pca_neuronale,
  ...f_continuation_spectrale,
  ...f_accords_vers_notation,
  ...f_risset,
  ...f_lucier,
  ...f_apparier,
  ...f_reich,
  ...f_wishart,
  ...f_gendyn,
  ...f_stockhausen,
  ...f_nancarrow,
  ...f_pulsars,
  ...f_cribles,
  ...f_theorie_composition,
  ...f_modeles_physiques,
  ...f_syntheses_exotiques,
  ...f_oscillateur_analogique,
  ...f_effets_rotatifs,
  ...f_table_onde,
  ...f_fm_operateurs,
  ...f_theorie_avancee,
  ...f_csound,
] as FicheAudio[];
