// plugins/categories/montage-et-spectral.ts — Le montage, le spectral et le grain.
//
// Le montage et le mélange, la conversion, la séparation, les collections, la documentation, le
// goût et le parfum, puis le traitement spectral, le grain et les critères schaefferiens.
//
// UNE TRANCHE DE L'ORDRE DU CATALOGUE, ET NON UN THÈME PUR : voir `plugins/index.ts`.
import type { FicheAudio } from "../../audio/types-domaine";

import { fiches as f_montage } from "../montage";
import { fiches as f_melangeur_logistique } from "../melangeur-logistique";
import { fiches as f_sortie_conversion } from "../sortie-conversion";
import { fiches as f_separation } from "../separation";
import { fiches as f_collections } from "../collections";
import { fiches as f_documentation } from "../documentation";
import { fiches as f_demonstration } from "../demonstration";
import { fiches as f_verovio } from "../verovio";
import { fiches as f_gout } from "../gout";
import { fiches as f_assaisonnement } from "../assaisonnement";
import { fiches as f_parfum } from "../parfum";
import { fiches as f_accordMets } from "../accord-mets";
import { fiches as f_clavier_apprentissage } from "../clavier-apprentissage";
import { fiches as f_vitesse_midi } from "../vitesse-midi";
import { fiches as f_hpss } from "../hpss";
import { fiches as f_decaleur } from "../decaleur-frequence";
import { fiches as f_texture } from "../texture-statistique";
import { fiches as f_sms } from "../sms";
import { fiches as f_velours } from "../velours";
import { fiches as f_courbe } from "../courbe";
import { fiches as f_hauteur } from "../hauteur";
import { fiches as f_stn } from "../stn";
import { fiches as f_retard_spectral } from "../retard-spectral";
import { fiches as f_retard_granulaire } from "../retard-granulaire";
import { fiches as f_granulation_ecologique } from "../granulation-ecologique";
import { fiches as f_vosim } from "../vosim";
import { fiches as f_grain_schaefferien } from "../grain-schaefferien";
import { fiches as f_criteres_schaefferiens } from "../criteres-schaefferiens";
import { fiches as f_bytebeat } from "../bytebeat";
import { fiches as f_suites_entieres } from "../suites-entieres";
import { fiches as f_spectral_wishart } from "../spectral-wishart";
import { fiches as f_brassage } from "../brassage";
import { fiches as f_deplacement } from "../deplacement";
import { fiches as f_theorie_rythme_voix } from "../theorie-rythme-voix";
import { fiches as f_dissonance } from "../dissonance";
import { fiches as f_masquage_schillinger_gammes } from "../masquage-schillinger-gammes";
import { fiches as f_caracteristiques_piste } from "../caracteristiques-piste";
import { fiches as f_synthese_features } from "../synthese-features";
import { fiches as f_cercle_pulsant } from "../cercle-pulsant";
import { fiches as f_recaler_niveau } from "../recaler-niveau";

export const fiches = [
  ...f_montage,
  ...f_melangeur_logistique,
  ...f_sortie_conversion,
  ...f_separation,
  ...f_collections,
  ...f_documentation,
  ...f_demonstration,
  ...f_verovio,
  ...f_gout,
  ...f_assaisonnement,
  ...f_parfum,
  ...f_accordMets,
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
  ...f_retard_granulaire,
  ...f_granulation_ecologique,
  ...f_vosim,
  ...f_grain_schaefferien,
  ...f_criteres_schaefferiens,
  ...f_bytebeat,
  ...f_suites_entieres,
  ...f_spectral_wishart,
  ...f_brassage,
  ...f_deplacement,
  ...f_theorie_rythme_voix,
  ...f_dissonance,
  ...f_masquage_schillinger_gammes,
  ...f_caracteristiques_piste,
  ...f_synthese_features,
  ...f_cercle_pulsant,
  ...f_recaler_niveau,
] as FicheAudio[];
