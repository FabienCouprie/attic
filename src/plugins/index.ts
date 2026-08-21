// plugins/index.ts — Re-exporte les fiches de tous les plugins du domaine audio.
// L'adaptateur (audio/adaptateur.ts) importe ces fiches et les enregistre dans
// le registre. Aucun side-effect à l'import — les modules ne font qu'exporter.
import type { FicheAudio } from "../audio/types-domaine";

import { fiches as f_entrees } from "./entrees";
import { fiches as f_effets } from "./effets";
import { fiches as f_analyse } from "./analyse";
import { fiches as f_sorties } from "./sorties";
import { fiches as f_sortie_texte } from "./sortie-texte";
import { fiches as f_entrees_extra } from "./entrees-extra";
import { fiches as f_generateurs } from "./generateurs";
import { fiches as f_montage } from "./montage";
import { fiches as f_melangeur_logistique } from "./melangeur-logistique";
import { fiches as f_sortie_conversion } from "./sortie-conversion";
import { fiches as f_separation } from "./separation";
import { fiches as f_collections } from "./collections";
import { fiches as f_visualisation } from "./visualisation";
import { fiches as f_sequenceurs } from "./sequenceurs";
import { fiches as f_enveloppe } from "./enveloppe";
import { fiches as f_instruments } from "./instruments";
import { fiches as f_styles_musicaux } from "./styles-musicaux";
import { fiches as f_emotions } from "./emotions";
import { fiches as f_tessitures } from "./tessitures";
import { fiches as f_generateur_script_ia } from "./generateur-script-ia";
import { fiches as f_musicgen } from "./musicgen";
import { fiches as f_texte_provider } from "./texte-provider";
import { fiches as f_tts } from "./tts";
import { fiches as f_tts_piper } from "./tts-piper";
import { fiches as f_tts_kokoro } from "./tts-kokoro";
import { fiches as f_tts_francais } from "./tts-francais";
import { fiches as f_speech_to_text } from "./speech-to-text";
import { fiches as f_sherpa_asr } from "./sherpa-asr";
import { fiches as f_traduction } from "./traduction";
import { fiches as f_prompt_graphe } from "./prompt-graphe";
import { fiches as f_pochette } from "./pochette";
import { fiches as f_textgen } from "./textgen";
import { fiches as f_generateur_paroles } from "./generateur-paroles";
import { fiches as f_galerie_exposition } from "./galerie-exposition";
import { fiches as f_gestion_nodes } from "./gestion-nodes";
import { fiches as f_python_processor } from "./python-processor";
import { fiches as f_julia_processor } from "./julia-processor";
import { fiches as f_frontiere } from "./frontiere";
import { fiches as f_couleur_suno_ia } from "./couleur-suno-ia";
import { fiches as f_ollama } from "./ollama";
import { fiches as f_texte_vers_midi } from "./texte-vers-midi";
import { fiches as f_tonal } from "./tonal";
import { fiches as f_vexflow } from "./vexflow";
import { fiches as f_soundtouch } from "./soundtouch";
import { fiches as f_tone_synths } from "./tone-synths";
import { fiches as f_phase_vocoder } from "./phase-vocoder";
import { fiches as f_resonance } from "./resonance";
import { fiches as f_ddsp } from "./ddsp";
import { fiches as f_stable_audio_3 } from "./stable-audio-3";
import { fiches as f_continuation_stable_audio_3 } from "./continuation-stable-audio-3";
import { fiches as f_magenta } from "./magenta";
import { fiches as f_pure_data } from "./pure-data";
import { fiches as f_songsee } from "./songsee";
import { fiches as f_image_export } from "./image-export";
import { fiches as f_export_svg } from "./export-svg";
import { fiches as f_image_rendu } from "./image-rendu";
import { fiches as f_pixeltone } from "./pixeltone";
import { fiches as f_palette_harmonique } from "./palette-harmonique";
import { fiches as f_dessin_sonore } from "./dessin-sonore";
import { fiches as f_couleur_rgb } from "./couleur-rgb";
import { fiches as f_spectre_visible } from "./spectre-visible";
import { fiches as f_color_looper } from "./color-looper";
import { fiches as f_camelot } from "./camelot";
import { fiches as f_entree_image } from "./entree-image";
import { fiches as f_entree_pdf } from "./entree-pdf";
import { fiches as f_extraction_pdf } from "./extraction-pdf";
import { fiches as f_lecteur_svg } from "./lecteur-svg";
import { fiches as f_separateur_canaux } from "./separateur-canaux";
import { fiches as f_hard_panner } from "./hard-panner";
import { fiches as f_ocr } from "./ocr";
import { fiches as f_carte_sonore } from "./carte-sonore";
import { fiches as f_automate_cellulaire } from "./automate-cellulaire";
import { fiches as f_texte_image } from "./texte-image";
import { fiches as f_legende_image } from "./legende-image";
import { fiches as f_algebre_musicale } from "./algebre-musicale";
import { fiches as f_coordonnees_sur_carte } from "./coordonnees-sur-carte";
import { fiches as f_alignement_dtw } from "./alignement-dtw";
import { fiches as f_etirement_dtw } from "./etirement-dtw";
import { fiches as f_pca_neuronale } from "./pca-neuronale";
import { fiches as f_continuation_spectrale } from "./continuation-spectrale";
import { fiches as f_accords_vers_notation } from "./accords-vers-notation";
import { fiches as f_risset } from "./risset";
import { fiches as f_lucier } from "./lucier";
import { fiches as f_reich } from "./reich";
import { fiches as f_wishart } from "./wishart";
import { fiches as f_gendyn } from "./gendyn";
import { fiches as f_stockhausen } from "./stockhausen";
import { fiches as f_nancarrow } from "./nancarrow";
import { fiches as f_pulsars } from "./pulsars";

export const toutesLesFiches: FicheAudio[] = [
  ...f_entrees,
  ...f_effets,
  ...f_analyse,
  ...f_sorties,
  ...f_sortie_texte,
  ...f_entrees_extra,
  ...f_generateurs,
  ...f_montage,
  ...f_melangeur_logistique,
  ...f_sortie_conversion,
  ...f_separation,
  ...f_collections,
  ...f_visualisation,
  ...f_sequenceurs,
  ...f_enveloppe,
  ...f_instruments,
  ...f_styles_musicaux,
  ...f_emotions,
  ...f_tessitures,
  ...f_generateur_script_ia,
  ...f_musicgen,
  ...f_texte_provider,
  ...f_tts,
  ...f_tts_piper,
  ...f_tts_kokoro,
  ...f_tts_francais,
  ...f_speech_to_text,
  ...f_sherpa_asr,
  ...f_traduction,
  ...f_prompt_graphe,
  ...f_pochette,
  ...f_textgen,
  ...f_generateur_paroles,
  ...f_galerie_exposition,
  ...f_gestion_nodes,
  ...f_python_processor,
  ...f_julia_processor,
  ...f_frontiere,
  ...f_couleur_suno_ia,
  ...f_ollama,
  ...f_texte_vers_midi,
  ...f_tonal,
  ...f_vexflow,
  ...f_soundtouch,
  ...f_tone_synths,
  ...f_phase_vocoder,
  ...f_resonance,
  ...f_ddsp,
  ...f_stable_audio_3,
  ...f_continuation_stable_audio_3,
  ...f_magenta,
  ...f_pure_data,
  ...f_songsee,
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
  ...f_texte_image,
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
  ...f_reich,
  ...f_wishart,
  ...f_gendyn,
  ...f_stockhausen,
  ...f_nancarrow,
  ...f_pulsars,
];
