// plugins/index.ts — Re-exporte les fiches de tous les plugins du domaine audio.
// L'adaptateur (audio/adaptateur.ts) importe ces fiches et les enregistre dans
// le registre. Aucun side-effect à l'import — les modules ne font qu'exporter.
import type { FicheAudio } from "../audio/types-domaine";

import { fiches as f_entrees } from "./entrees";
import { fiches as f_effets } from "./effets";
import { fiches as f_analyse } from "./analyse";
import { fiches as f_sorties } from "./sorties";
import { fiches as f_sortie_texte } from "./sortie-texte";
import { fiches as f_modifier_texte } from "./modifier-texte";
import { fiches as f_debruitage_ia } from "./debruitage-ia";
import { fiches as f_esthetique } from "./esthetique";
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
import { fiches as f_abc_vers_midi } from "./abc-vers-midi";
import { fiches as f_midi_vers_abc } from "./midi-vers-abc";
import { fiches as f_abc_contraintes } from "./abc-contraintes";
import { fiches as f_abc_reprise } from "./abc-reprise";
import { fiches as f_tonal } from "./tonal";
import { fiches as f_vexflow } from "./vexflow";
import { fiches as f_soundtouch } from "./soundtouch";
import { fiches as f_pitch_progressif } from "./pitch-progressif";
import { fiches as f_moebius } from "./moebius";
import { fiches as f_tore } from "./tore";
import { fiches as f_klein } from "./klein";
import { fiches as f_tresse } from "./tresse";
import { fiches as f_dirac } from "./dirac";
import { fiches as f_miroir } from "./miroir";
import { fiches as f_cantor } from "./cantor";
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
import { fiches as f_cribles } from "./cribles";
import { fiches as f_theorie_composition } from "./theorie-composition";
import { fiches as f_modeles_physiques } from "./modeles-physiques";
import { fiches as f_syntheses_exotiques } from "./syntheses-exotiques";
import { fiches as f_theorie_avancee } from "./theorie-avancee";
import { fiches as f_csound } from "./csound";
import { fiches as f_documentation } from "./documentation";
import { fiches as f_clavier_apprentissage } from "./clavier-apprentissage";
import { fiches as f_vitesse_midi } from "./vitesse-midi";
import { fiches as f_hpss } from "./hpss";
import { fiches as f_decaleur } from "./decaleur-frequence";
import { fiches as f_texture } from "./texture-statistique";
import { fiches as f_sms } from "./sms";
import { fiches as f_velours } from "./velours";
import { fiches as f_courbe } from "./courbe";
import { fiches as f_hauteur } from "./hauteur";
import { fiches as f_stn } from "./stn";
import { fiches as f_retard_spectral } from "./retard-spectral";
import { fiches as f_spectral_wishart } from "./spectral-wishart";
import { fiches as f_brassage } from "./brassage";
import { fiches as f_deplacement } from "./deplacement";
import { fiches as f_theorie_rythme_voix } from "./theorie-rythme-voix";
import { fiches as f_dissonance } from "./dissonance";
import { fiches as f_masquage_schillinger_gammes } from "./masquage-schillinger-gammes";
import { fiches as f_caracteristiques_piste } from "./caracteristiques-piste";
import { fiches as f_synthese_features } from "./synthese-features";
import { fiches as f_cercle_pulsant } from "./cercle-pulsant";
import { fiches as f_ampleur } from "./ampleur";
import { fiches as f_quiz } from "./quiz";
import { fiches as f_parcours } from "./parcours";
import { fiches as f_ficheTechnique } from "./fiche-technique";
import { fiches as f_particules } from "./particules";
import { fiches as f_montageGrains } from "./montage-grains";
import { fiches as f_ecrans } from "./ecrans";
import { fiches as f_atomes } from "./atomes";
import { fiches as f_ondelettes } from "./ondelettes";
import { fiches as f_ecosysteme } from "./ecosysteme";
import { fiches as f_ssp } from "./ssp";
import { fiches as f_boucleCollection } from "./boucle-collection";
import { fiches as f_multicanal } from "./multicanal";
import { fiches as f_correction_hauteur } from "./correction-hauteur";
import { fiches as f_stereo_morphing } from "./stereo-morphing";
import { fiches as f_finitions } from "./finitions";
import { fiches as f_declipper } from "./declipper";
import { fiches as f_inpainting } from "./inpainting";
import { fiches as f_pghi } from "./pghi";
import { fiches as f_fdn } from "./fdn";
import { fiches as f_clavier_banque } from "./clavier-banque";
import { fiches as f_export_sfz } from "./export-sfz";
import { fiches as f_instrument } from "./instrument-graphe";
import { fiches as f_clavier_sfz } from "./clavier-sfz";
import { fiches as f_repartiteur_midi } from "./repartiteur-midi";
import { fiches as f_banque_sfz } from "./banque-sfz";
import { fiches as f_csound_partition } from "./csound-partition";
import { fiches as f_csound_orchestre } from "./csound-orchestre";
import { fiches as f_csound_aleatoire } from "./csound-aleatoire";
import { fiches as f_csound_formules } from "./csound-formules";

export const toutesLesFiches: FicheAudio[] = [
  ...f_entrees,
  ...f_effets,
  ...f_analyse,
  ...f_sorties,
  ...f_sortie_texte,
  ...f_modifier_texte,
  ...f_debruitage_ia,
  ...f_esthetique,
  ...f_entrees_extra,
  ...f_generateurs,
  ...f_montage,
  ...f_melangeur_logistique,
  ...f_sortie_conversion,
  ...f_separation,
  ...f_collections,
  ...f_documentation,
  ...f_clavier_apprentissage,
  ...f_vitesse_midi,
  ...f_hpss,
  ...f_decaleur,
  ...f_texture,
  ...f_sms,
  ...f_velours,
  ...f_courbe,
  ...f_hauteur,
  ...f_stn,
  ...f_retard_spectral,
  ...f_spectral_wishart,
  ...f_brassage,
  ...f_deplacement,
  ...f_theorie_rythme_voix,
  ...f_dissonance,
  ...f_masquage_schillinger_gammes,
  ...f_caracteristiques_piste,
  ...f_synthese_features,
  ...f_cercle_pulsant,
  ...f_ampleur,
  ...f_quiz,
  ...f_parcours,
  ...f_ficheTechnique,
  ...f_particules,
  ...f_montageGrains,
  ...f_ecrans,
  ...f_atomes,
  ...f_ondelettes,
  ...f_ecosysteme,
  ...f_ssp,
  ...f_boucleCollection,
  ...f_multicanal,
  ...f_correction_hauteur,
  ...f_stereo_morphing,
  ...f_finitions,
  ...f_declipper,
  ...f_inpainting,
  ...f_pghi,
  ...f_fdn,
  ...f_clavier_banque,
  ...f_export_sfz,
  ...f_instrument,
  ...f_clavier_sfz,
  ...f_repartiteur_midi,
  ...f_banque_sfz,
  ...f_csound_partition,
  ...f_csound_orchestre,
  ...f_csound_aleatoire,
  ...f_csound_formules,
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
  ...f_abc_vers_midi,
  ...f_midi_vers_abc,
  ...f_abc_contraintes,
  ...f_abc_reprise,
  ...f_tonal,
  ...f_vexflow,
  ...f_soundtouch,
  ...f_pitch_progressif,
  ...f_moebius,
  ...f_tore,
  ...f_klein,
  ...f_tresse,
  ...f_dirac,
  ...f_miroir,
  ...f_cantor,
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
  ...f_cribles,
  ...f_theorie_composition,
  ...f_modeles_physiques,
  ...f_syntheses_exotiques,
  ...f_theorie_avancee,
  ...f_csound,
];
