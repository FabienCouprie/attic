// plugins/categories/voix-et-texte.ts — La visualisation, la voix et le texte.
//
// La visualisation, les séquenceurs, les instruments et les styles, puis la voix, la parole, le
// texte et les modèles de langue.
//
// UNE TRANCHE DE L'ORDRE DU CATALOGUE, ET NON UN THÈME PUR : voir `plugins/index.ts`.
import type { FicheAudio } from "../../audio/types-domaine";

import { fiches as f_visualisation } from "../visualisation";
import { fiches as f_sequenceurs } from "../sequenceurs";
import { fiches as f_enveloppe } from "../enveloppe";
import { fiches as f_instruments } from "../instruments";
import { fiches as f_styles_musicaux } from "../styles-musicaux";
import { fiches as f_emotions } from "../emotions";
import { fiches as f_tessitures } from "../tessitures";
import { fiches as f_generateur_script_ia } from "../generateur-script-ia";
import { fiches as f_texte_provider } from "../texte-provider";
import { fiches as f_tts } from "../tts";
import { fiches as f_tts_piper } from "../tts-piper";
import { fiches as f_tts_kokoro } from "../tts-kokoro";
import { fiches as f_tts_francais } from "../tts-francais";
import { fiches as f_speech_to_text } from "../speech-to-text";
import { fiches as f_sherpa_asr } from "../sherpa-asr";
import { fiches as f_vosk_asr } from "../vosk-asr";
import { fiches as f_parole_vers_sequence } from "../parole-vers-sequence";
import { fiches as f_zones_vers_midi } from "../zones-vers-midi";
import { fiches as f_sous_titres } from "../sous-titres";
import { fiches as f_sous_titres_incrustes } from "../sous-titres-incrustes";
import { fiches as f_chanson_locale } from "../chanson-locale";
import { fiches as f_transcription_midi } from "../transcription-midi";
import { fiches as f_qui_parle_quand } from "../qui-parle-quand";
import { fiches as f_aligner_texte } from "../aligner-texte";
import { fiches as f_couper_aux_mots } from "../couper-aux-mots";
import { fiches as f_traduction } from "../traduction";
import { fiches as f_prompt_graphe } from "../prompt-graphe";
import { fiches as f_pochette } from "../pochette";
import { fiches as f_textgen } from "../textgen";
import { fiches as f_generateur_paroles } from "../generateur-paroles";
import { fiches as f_galerie_exposition } from "../galerie-exposition";
import { fiches as f_gestion_nodes } from "../gestion-nodes";
import { fiches as f_python_processor } from "../python-processor";
import { fiches as f_julia_processor } from "../julia-processor";
import { fiches as f_frontiere } from "../frontiere";
import { fiches as f_couleur_suno_ia } from "../couleur-suno-ia";
import { fiches as f_ollama } from "../ollama";

export const fiches = [
  ...f_visualisation,
  ...f_sequenceurs,
  ...f_enveloppe,
  ...f_instruments,
  ...f_styles_musicaux,
  ...f_emotions,
  ...f_tessitures,
  ...f_generateur_script_ia,
  ...f_texte_provider,
  ...f_tts,
  ...f_tts_piper,
  ...f_tts_kokoro,
  ...f_tts_francais,
  ...f_speech_to_text,
  ...f_sherpa_asr,
  ...f_vosk_asr,
  ...f_parole_vers_sequence,
  ...f_zones_vers_midi,
  ...f_sous_titres,
  ...f_sous_titres_incrustes,
  ...f_chanson_locale,
  ...f_transcription_midi,
  ...f_qui_parle_quand,
  ...f_aligner_texte,
  ...f_couper_aux_mots,
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
] as FicheAudio[];
