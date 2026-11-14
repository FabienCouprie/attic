// audio/croisement-inscriptions.ts — Ce que la passe de croisement a le droit de relever.
//
// DEUX LISTES PAR NATURE, et elles ne se valent pas. Les DÉCLARÉES sont tranchées : une inertie
// légitime, dite dans la documentation du réglage en français et en anglais, ou deux valeurs qui
// rendent légitimement la même chose ; chacune porte sa raison. Les À EXAMINER sont la dette du lot 1
// de la passe de complétude (2026-11-14) : tout ce que la première passe a relevé, avant que Fabien
// tranche. Elle ne peut que décroître : le lot 3 en sort chaque ligne, déclarée ou réparée.
//
// LA DETTE EST UNE DONNÉE ET NON DU CODE. Tirée une fois du relevé de la passe, elle tient en
// centaines de lignes qu'aucune main n'a écrites ; elle vit donc dans `croisement-dette.json`, une
// inscription par ligne, et ne se régénère jamais : la régénérer laisserait entrer une inertie neuve
// sans que personne l'ait vue. Le garde en plafonne le compte.

import type { CoincidenceInscrite, InertieInscrite } from "./croisement-registre";
import dette from "./croisement-dette.json";

/** Les inerties légitimes, chacune dite dans la documentation du réglage gouverné. */
export const INERTIES_DECLAREES: InertieInscrite[] = [];

/** Les coïncidences légitimes, chacune avec sa raison. */
export const COINCIDENCES_DECLAREES: CoincidenceInscrite[] = [];

/** La dette des inerties relevées au lot 1, à trancher. */
export const INERTIES_A_EXAMINER: readonly InertieInscrite[] = dette.inerties as InertieInscrite[];

/** La dette des coïncidences relevées au lot 1, à trancher. */
export const COINCIDENCES_A_EXAMINER: readonly CoincidenceInscrite[] = dette.coincidences;
