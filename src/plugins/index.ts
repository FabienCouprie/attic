// plugins/index.ts — Re-exporte les fiches de tous les plugins du domaine audio.
// L'adaptateur (audio/adaptateur.ts) importe ces fiches et les enregistre dans
// le registre. Aucun side-effect à l'import — les modules ne font qu'exporter.
import type { PluginDef } from "../core";

import { fiches as f_entrees } from "./entrees";
import { fiches as f_effets } from "./effets";
import { fiches as f_analyse } from "./analyse";
import { fiches as f_sorties } from "./sorties";
import { fiches as f_sortie_texte } from "./sortie-texte";
import { fiches as f_entrees_extra } from "./entrees-extra";
import { fiches as f_generateurs } from "./generateurs";
import { fiches as f_montage } from "./montage";
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
import { fiches as f_speech_to_text } from "./speech-to-text";
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

export const toutesLesFiches: PluginDef[] = [
  ...f_entrees,
  ...f_effets,
  ...f_analyse,
  ...f_sorties,
  ...f_sortie_texte,
  ...f_entrees_extra,
  ...f_generateurs,
  ...f_montage,
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
  ...f_speech_to_text,
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
];
