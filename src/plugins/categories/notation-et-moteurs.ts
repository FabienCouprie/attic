// plugins/categories/notation-et-moteurs.ts — La notation et les moteurs.
//
// La notation ABC et VexFlow, puis les topologies, les synthèses Tone, le vocodeur de phase, Magenta
// et Pure Data.
//
// UNE TRANCHE DE L'ORDRE DU CATALOGUE, ET NON UN THÈME PUR : voir `plugins/index.ts`.
import type { FicheAudio } from "../../audio/types-domaine";

import { fiches as f_texte_vers_midi } from "../texte-vers-midi";
import { fiches as f_abc_vers_midi } from "../abc-vers-midi";
import { fiches as f_midi_vers_abc } from "../midi-vers-abc";
import { fiches as f_abc_contraintes } from "../abc-contraintes";
import { fiches as f_abc_reprise } from "../abc-reprise";
import { fiches as f_tonal } from "../tonal";
import { fiches as f_vexflow } from "../vexflow";
import { fiches as f_soundtouch } from "../soundtouch";
import { fiches as f_pitch_progressif } from "../pitch-progressif";
import { fiches as f_moebius } from "../moebius";
import { fiches as f_tore } from "../tore";
import { fiches as f_klein } from "../klein";
import { fiches as f_tresse } from "../tresse";
import { fiches as f_dirac } from "../dirac";
import { fiches as f_miroir } from "../miroir";
import { fiches as f_cantor } from "../cantor";
import { fiches as f_tone_synths } from "../tone-synths";
import { fiches as f_tone_synths_fm } from "../tone-synths-fm";
import { fiches as f_phase_vocoder } from "../phase-vocoder";
import { fiches as f_resonance } from "../resonance";
import { fiches as f_ddsp } from "../ddsp";
import { fiches as f_magenta } from "../magenta";
import { fiches as f_pure_data } from "../pure-data";
import { fiches as f_songsee } from "../songsee";

export const fiches = [
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
  ...f_tone_synths_fm,
  ...f_phase_vocoder,
  ...f_resonance,
  ...f_ddsp,
  ...f_magenta,
  ...f_pure_data,
  ...f_songsee,
] as FicheAudio[];
