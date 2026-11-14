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

// LES PREMIÈRES DÉCLARATIONS, du lot 3b (2026-11-14). Ce que la régénération de la dette au lot 3a
// y avait fait entrer, contre la règle écrite plus haut, et ce que l'élargissement des gammes fait
// naître : chaque ligne a été examinée, et les coïncidences de gammes vues se séparer sur un rendu
// plus long ou sous une autre graine.

const SEGMENT = "une taille au moins aussi longue que l'intervalle rend l'entrée telle quelle, et les réglages du segment n'ont plus rien à régler ; dit dans leur documentation";
const RESERVOIR = "le rendu d'essai, aux mesures et à la graine par défaut, n'atteint que quelques degrés, et ces gammes s'y accordent ; seize mesures ou une autre graine les séparent";
const SEQUENCEUR = "le motif par défaut n'allume que trois rangées de la grille, et ces gammes s'accordent sur leurs degrés";
const UNE_HAUTEUR = "le son d'essai n'a qu'une hauteur, un la, et ces gammes le ramènent sur la même note";
const UN_TIRAGE = "sans objectif, le nœud rend un seul tirage à graine fixe, qui évite les degrés où ces gammes diffèrent ; une autre graine les sépare";
const UNE_SUITE = "la suite trouvée à la graine d'essai évite les degrés où ces gammes diffèrent ; une autre graine les sépare";
const UNE_NOTE = "l'arbre n° 0 du catalogue, le défaut, n'a qu'une note, qui tombe au même rang dans ces gammes";

/** Les inerties légitimes, chacune dite dans la documentation du réglage gouverné. */
export const INERTIES_DECLAREES: InertieInscrite[] = [
  { ou: "beat-repeat·Feedback", sous: "Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: SEGMENT },
  { ou: "beat-repeat·Feedback", sous: "Taille", valeurs: ["1/2", "1/4.", "1/4"], raison: SEGMENT },
  { ou: "beat-repeat·Mix", sous: "Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: SEGMENT },
  { ou: "beat-repeat·Mix", sous: "Taille", valeurs: ["1/2", "1/4.", "1/4"], raison: SEGMENT },
  { ou: "beat-repeat·Répétitions", sous: "Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: SEGMENT },
  { ou: "beat-repeat·Répétitions", sous: "Taille", valeurs: ["1/2", "1/4.", "1/4"], raison: SEGMENT },
  { ou: "beat-repeat·Tempo", sous: "Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: SEGMENT },
  { ou: "beat-repeat·Tempo", sous: "Taille", valeurs: ["1/2", "1/4.", "1/4"], raison: SEGMENT },
  { ou: "beat-repeat·Taille", sous: "Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: "sous ces intervalles, les deux tailles que la passe éprouve, 1/2 et 1/4 pointée, sont plus longues et rendent l'entrée telle quelle ; une taille plus courte s'entend, et sa documentation le dit" },
  { ou: "boite-rythmes·Caisse claire", sous: "Patron", valeurs: ["Techno"], raison: "le patron Techno n'a pas de caisse claire ; dit dans la documentation du réglage" },
];

/** Les coïncidences légitimes, chacune avec sa raison. */
export const COINCIDENCES_DECLAREES: CoincidenceInscrite[] = [
  { ou: "beat-repeat·Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: "sous la taille par défaut, 1/16, un intervalle qui n'est pas plus long qu'elle rend l'entrée telle quelle" },
  { ou: "beat-repeat·Taille", valeurs: ["1/2", "1/4.", "1/4"], raison: "sous l'intervalle par défaut, 1/4, une taille qui n'est pas plus courte que lui rend l'entrée telle quelle" },
  { ou: "generateur-fractal·Gamme", valeurs: ["majeur", "bebop-dominant"], raison: "le motif par défaut, « Triade M », n'atteint jamais la septième, seul degré où le majeur et la bebop dominante diffèrent" },
  { ou: "serie-infinie·Gamme", valeurs: ["majeur", "mineur", "pentatonique-majeure", "chromatique", "dorien", "phrygien", "lydien", "mixolydien", "locrien", "mineur-harmonique", "mineur-melodique", "pentatonique-mineure", "blues", "alteree", "lydien-dominant", "phrygien-dominant", "bebop-dominant", "ton-entier", "diminuee-ton-demi", "diminuee-demi-ton", "augmentee", "double-seconde-augmentee", "hongroise-mineure", "hirajoshi", "in-sen"], raison: "en lecture par demi-tons, le défaut, la gamme ne sert pas" },
  { ou: "reservoir-musical·Gamme", valeurs: ["majeur", "lydien", "mixolydien", "lydien-dominant"], raison: RESERVOIR },
  { ou: "reservoir-musical·Gamme", valeurs: ["mineur", "mineur-harmonique", "hongroise-mineure"], raison: RESERVOIR },
  { ou: "reservoir-musical·Gamme", valeurs: ["dorien", "mineur-melodique"], raison: RESERVOIR },
  { ou: "reservoir-musical·Gamme", valeurs: ["phrygien", "locrien", "alteree"], raison: RESERVOIR },
  { ou: "reservoir-musical·Gamme", valeurs: ["phrygien-dominant", "double-seconde-augmentee"], raison: RESERVOIR },
  { ou: "multi-reservoirs·Gamme", valeurs: ["mineur", "dorien"], raison: RESERVOIR },
  { ou: "multi-reservoirs·Gamme", valeurs: ["mineur-harmonique", "mineur-melodique"], raison: RESERVOIR },
  { ou: "sequenceur-melodique·Gamme", valeurs: ["majeur", "lydien", "mixolydien", "lydien-dominant", "phrygien-dominant", "double-seconde-augmentee"], raison: SEQUENCEUR },
  { ou: "sequenceur-melodique·Gamme", valeurs: ["mineur", "dorien", "phrygien", "mineur-harmonique", "mineur-melodique", "hongroise-mineure"], raison: SEQUENCEUR },
  { ou: "sequenceur-melodique·Gamme", valeurs: ["blues", "ton-entier"], raison: SEQUENCEUR },
  { ou: "sequenceur-melodique·Gamme", valeurs: ["locrien", "alteree"], raison: SEQUENCEUR },
  { ou: "sequenceur-melodique·Gamme", valeurs: ["bebop-dominant", "diminuee-ton-demi"], raison: SEQUENCEUR },
  { ou: "correction-hauteur·Gamme", valeurs: ["chromatique", "majeur", "pentatonique-majeure", "dorien", "lydien", "mixolydien", "mineur-melodique", "lydien-dominant", "bebop-dominant", "diminuee-ton-demi", "diminuee-demi-ton"], raison: UNE_HAUTEUR },
  { ou: "correction-hauteur·Gamme", valeurs: ["mineur", "phrygien", "locrien", "alteree", "phrygien-dominant", "ton-entier"], raison: UNE_HAUTEUR },
  { ou: "correction-hauteur·Gamme", valeurs: ["mineur-harmonique", "augmentee", "double-seconde-augmentee", "hongroise-mineure", "hirajoshi"], raison: UNE_HAUTEUR },
  { ou: "correction-hauteur·Gamme", valeurs: ["pentatonique-mineure", "blues", "in-sen"], raison: UNE_HAUTEUR },
  { ou: "evolution-melodie·Gamme", valeurs: ["majeur", "mineur-harmonique", "mineur-melodique"], raison: UN_TIRAGE },
  { ou: "evolution-melodie·Gamme", valeurs: ["mineur", "dorien", "mixolydien"], raison: UN_TIRAGE },
  { ou: "evolution-melodie·Gamme", valeurs: ["phrygien", "phrygien-dominant"], raison: UN_TIRAGE },
  { ou: "evolution-melodie·Gamme", valeurs: ["lydien", "hongroise-mineure"], raison: UN_TIRAGE },
  { ou: "solveur-contraintes·Gamme", valeurs: ["majeur", "mixolydien"], raison: UNE_SUITE },
  { ou: "solveur-contraintes·Gamme", valeurs: ["mineur", "mineur-harmonique", "dorien", "mineur-melodique"], raison: UNE_SUITE },
  { ou: "solveur-contraintes·Gamme", valeurs: ["lydien", "lydien-dominant"], raison: UNE_SUITE },
  { ou: "solveur-contraintes·Gamme", valeurs: ["phrygien-dominant", "double-seconde-augmentee"], raison: UNE_SUITE },
  { ou: "arbre-rythmique·Gamme", valeurs: ["chromatique", "mineur", "pentatonique-mineure", "dorien", "phrygien", "mixolydien", "locrien", "alteree", "lydien-dominant", "phrygien-dominant", "bebop-dominant", "ton-entier", "diminuee-demi-ton", "in-sen"], raison: UNE_NOTE },
  { ou: "arbre-rythmique·Gamme", valeurs: ["majeur", "mineur-harmonique", "lydien", "mineur-melodique", "diminuee-ton-demi", "augmentee", "double-seconde-augmentee", "hongroise-mineure"], raison: UNE_NOTE },
];

/** La dette des inerties relevées au lot 1, à trancher. */
export const INERTIES_A_EXAMINER: readonly InertieInscrite[] = dette.inerties as InertieInscrite[];

/** La dette des coïncidences relevées au lot 1, à trancher. */
export const COINCIDENCES_A_EXAMINER: readonly CoincidenceInscrite[] = dette.coincidences;
