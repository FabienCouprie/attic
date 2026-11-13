// plugins/categories/electroacoustique.ts — Les illusions, l'électroacoustique et les banques.
//
// Les illusions auditives, les spectrogrammes en image, le quiz et le parcours, l'électroacoustique
// et la restauration, les banques SFZ et Csound.
//
// UNE TRANCHE DE L'ORDRE DU CATALOGUE, ET NON UN THÈME PUR : voir `plugins/index.ts`.
import type { FicheAudio } from "../../audio/types-domaine";

import { fiches as f_paradoxe_triton } from "../paradoxe-triton";
import { fiches as f_fondamentale_manquante } from "../fondamentale-manquante";
import { fiches as f_illusion_octave } from "../illusion-octave";
import { fiches as f_battements_binauraux } from "../battements-binauraux";
import { fiches as f_effets_cresson } from "../effets-cresson";
import { fiches as f_spectrogramme_image } from "../spectrogramme-image";
import { fiches as f_spectrogramme_operations } from "../spectrogramme-operations";
import { fiches as f_quiz } from "../quiz";
import { fiches as f_parcours } from "../parcours";
import { fiches as f_ficheTechnique } from "../fiche-technique";
import { fiches as f_particules } from "../particules";
import { fiches as f_montageGrains } from "../montage-grains";
import { fiches as f_ecrans } from "../ecrans";
import { fiches as f_atomes } from "../atomes";
import { fiches as f_ondelettes } from "../ondelettes";
import { fiches as f_ecosysteme } from "../ecosysteme";
import { fiches as f_ssp } from "../ssp";
import { fiches as f_boucleCollection } from "../boucle-collection";
import { fiches as f_multicanal } from "../multicanal";
import { fiches as f_concret } from "../concret";
import { fiches as f_objetsSonores } from "../objets-sonores";
import { fiches as f_spectralCdp } from "../spectral-cdp";
import { fiches as f_correction_hauteur } from "../correction-hauteur";
import { fiches as f_stereo_morphing } from "../stereo-morphing";
import { fiches as f_finitions } from "../finitions";
import { fiches as f_declipper } from "../declipper";
import { fiches as f_inpainting } from "../inpainting";
import { fiches as f_pghi } from "../pghi";
import { fiches as f_fdn } from "../fdn";
import { fiches as f_clavier_banque } from "../clavier-banque";
import { fiches as f_export_sfz } from "../export-sfz";
import { fiches as f_instrument } from "../instrument-graphe";
import { fiches as f_clavier_sfz } from "../clavier-sfz";
import { fiches as f_repartiteur_midi } from "../repartiteur-midi";
import { fiches as f_banque_sfz } from "../banque-sfz";
import { fiches as f_csound_partition } from "../csound-partition";
import { fiches as f_csound_orchestre } from "../csound-orchestre";
import { fiches as f_csound_aleatoire } from "../csound-aleatoire";
import { fiches as f_csound_formules } from "../csound-formules";

export const fiches = [
  ...f_paradoxe_triton,
  ...f_fondamentale_manquante,
  ...f_illusion_octave,
  ...f_battements_binauraux,
  ...f_effets_cresson,
  ...f_spectrogramme_image,
  ...f_spectrogramme_operations,
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
  ...f_concret,
  ...f_objetsSonores,
  ...f_spectralCdp,
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
] as FicheAudio[];
