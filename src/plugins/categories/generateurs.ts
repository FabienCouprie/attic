// plugins/categories/generateurs.ts — Les générateurs.
//
// Mélodies, accords, glissandos, pulsations, fractales, rythmes, sources et réservoirs.
//
// UNE TRANCHE DE L'ORDRE DU CATALOGUE, ET NON UN THÈME PUR : voir `plugins/index.ts`.
import type { FicheAudio } from "../../audio/types-domaine";

import { fiches as f_generateurs } from "../generateurs";
import { fiches as f_gamme_jouee } from "../gamme-jouee";
import { fiches as f_accords_joues } from "../accords-joues";
import { fiches as f_glissando_harmonique } from "../glissando-harmonique";
import { fiches as f_glissando_de_gamme } from "../glissando-de-gamme";
import { fiches as f_pulsation } from "../pulsation";
import { fiches as f_cercle_gamme } from "../cercle-gamme";
import { fiches as f_cercle_retouche } from "../cercle-retouche";
import { fiches as f_cantor_deplacement } from "../cantor-deplacement";
import { fiches as f_melodie_sur_accords } from "../melodie-sur-accords";
import { fiches as f_generateurs_fractals } from "../generateurs-fractals";
import { fiches as f_generateurs_rythme } from "../generateurs-rythme";
import { fiches as f_generateurs_sources } from "../generateurs-sources";
import { fiches as f_generateurs_reservoirs } from "../generateurs-reservoirs";
import { fiches as f_generateurs_echantillons } from "../generateurs-echantillons";

export const fiches = [
  // Les six fichiers de générateurs se suivent dans l'ordre où leurs fiches se suivaient quand ils
  // n'en faisaient qu'un : c'est cet ordre que le catalogue engendré reflète.
  ...f_generateurs,
  ...f_gamme_jouee,
  ...f_accords_joues,
  ...f_glissando_harmonique,
  ...f_glissando_de_gamme,
  ...f_pulsation,
  ...f_cercle_gamme,
  ...f_cercle_retouche,
  ...f_cantor_deplacement,
  ...f_melodie_sur_accords,
  ...f_generateurs_fractals,
  ...f_generateurs_rythme,
  ...f_generateurs_sources,
  ...f_generateurs_reservoirs,
  ...f_generateurs_echantillons,
] as FicheAudio[];
