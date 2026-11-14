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
//
// SIX LIGNES Y SONT ENTRÉES AU LOT 3c, examinées une à une, sur la décision de Fabien du 2026-11-14 :
// la même inertie qu'elle portait déjà, vue sous un gouverneur neuf qui n'en est pas la cause, pour le
// règle personnalisée, la hauteur et le moteur de l'automate cellulaire, le swing du séquenceur
// d'accords, l'étalement des accords joués et la graine de la roue de Camelot. Le lot 3d les remplace
// par une déclaration chacune, sous leur vraie condition. SEPT AUTRES, sous la même règle : les
// graines neuves des accords joués et de la gamme jouée, que seul le sens aléatoire fait agir.

import type { CoincidenceInscrite, InertieConditionnee, InertieInscrite } from "./croisement-registre";
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

// LES DÉCLARATIONS DU LOT 3b-2 (2026-11-14), que l'élargissement des fenêtres et des valeurs de note
// fait naître ou grandir. Chacune remplace une ligne de la dette, devenue fausse quand la liste a
// gagné des valeurs, et chaque raison d'entrée a été vue se défaire sous une entrée qui donne prise.
const VUE_SEULE = "la taille ne règle que la vue, qui calcule son propre spectre : le nœud rend son entrée telle quelle";

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
  { ou: "sms-sinusoides-bruit·Seuil", sous: "Fenêtre", valeurs: ["512", "1024", "8192"], raison: "le son d'essai n'a pas de partiel à la fois saillant et faible : les pics qui dépassent leur voisinage de la saillie sont tous près du plus fort, et le seuil n'a rien à écarter ; vingt harmoniques de 440 Hz espacés de 4 dB le font agir de 512 à 8192 points ; dit dans sa documentation" },
];

const UNE_GRAINE = "la graine ne tire que l'ordre aléatoire, et hors de lui elle n'a rien à tirer ; dit dans sa documentation";

/**
 * Les inerties déclarées par leur VRAIE CONDITION (lot 3d, 2026-11-14) : chacune couvre chaque lancer
 * où sa condition tient, sous n'importe quel gouverneur, et tombe dès que le réglage y agit. Elles
 * remplacent les inscriptions par gouverneur de la même inertie, déclarées ou en dette.
 */
export const INERTIES_CONDITIONNEES: InertieConditionnee[] = [
  { ou: "automate-cellulaire·Règle personnalisée", quand: { reglage: "Règle", sauf: ["Personnalisée"] }, raison: "le numéro de règle n'est lu que quand la règle choisie est « Personnalisée » ; dit dans sa documentation" },
  { ou: "automate-cellulaire·Hauteur", quand: { reglage: "Topologie", valeurs: ["1D"] }, raison: "une ligne à une dimension n'a pas de hauteur de grille ; dit dans sa documentation" },
  { ou: "automate-cellulaire·Synthèse", quand: { banc: true }, raison: "non mesurable au banc : sans SoundFont chargé, les trois moteurs rendent en FM, l'automatique comme le SoundFont, qui l'annonce dans son message" },
  { ou: "automate-cellulaire·Densité max", quand: { reglage: "Mode voix", valeurs: ["melodie", "arpege"] }, raison: "la mélodie et l'arpège jouent une note par pas, et le plafond des notes simultanées ne borne rien ; dit dans sa documentation" },
  { ou: "accords-joues·Étalement", quand: { reglage: "Façon", valeurs: ["plaque"] }, raison: "un accord plaqué fait partir ses notes ensemble, et l'étalement de leurs départs n'a rien à répartir ; dit dans sa documentation" },
  { ou: "accords-joues·Graine", quand: { reglage: "Sens", sauf: ["aleatoire"] }, raison: UNE_GRAINE },
  { ou: "gamme-jouee·Graine", quand: { reglage: "Sens", sauf: ["aleatoire"] }, raison: UNE_GRAINE },
  { ou: "arpegiateur-midi·Graine", quand: { reglage: "Direction", sauf: ["aleatoire"] }, raison: UNE_GRAINE },
  { ou: "camelot·Graine", quand: { reglage: "Parcours", sauf: ["aleatoire"] }, raison: "la graine ne tire que le parcours aléatoire, et le parcours complet comme les voisins n'ont rien à tirer ; dit dans sa documentation" },
  { ou: "tonal-grille·Durée", quand: { reglage: "Mode", valeurs: ["arpege"] }, raison: "en arpège, chaque note dure une croche, et la durée de l'accord n'a plus rien à régler ; dit dans sa documentation" },
  { ou: "color-looper·Durée note", quand: { reglage: "Mode", valeurs: ["arpege", "roule"] }, raison: "en arpège comme en roulé, les trois notes de l'accord se partagent le pas, et la durée d'une note n'a plus rien à régler ; dit dans sa documentation" },
  { ou: "boite-rythmes·Caisse claire", quand: { reglage: "Patron", valeurs: ["Techno"] }, raison: "le patron Techno n'a pas de caisse claire ; dit dans la documentation du réglage" },
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
  { ou: "analyseur-spectre·Fenêtre", valeurs: ["256", "512", "1024", "2048", "4096", "8192"], raison: VUE_SEULE },
  { ou: "spectrogramme·Fenêtre", valeurs: ["256", "512", "1024", "2048", "4096", "8192"], raison: VUE_SEULE },
  { ou: "restauration-ecretage·Fenêtre", valeurs: ["256", "512", "1024", "2048", "4096", "8192"], raison: "le son d'essai n'est pas écrêté, et la restauration le rend tel quel quelle que soit la fenêtre ; un sinus écrêté à la moitié de sa crête sépare les six tailles" },
  { ou: "transposeur-quantiseur-midi·Quantisation", valeurs: ["none", "1/4", "1/8", "1/16", "1/32", "1/8t", "1/16t", "1/32t"], raison: "le MIDI d'essai pose ses attaques sur des noires, que toute grille divisant la noire laisse en place comme l'absence de grille ; une grille plus large ou pointée les déplace, et huit notes jouées à côté de la grille séparent les huit valeurs" },
  { ou: "arpegiateur-midi·Direction", valeurs: ["montant", "ordre-de-jeu"], raison: "le MIDI d'essai joue les notes de chaque accord du grave à l'aigu, et l'ordre de jeu y est l'ordre montant ; un accord joué sol, do, mi les sépare" },
];

/** La dette des inerties relevées au lot 1, à trancher. */
export const INERTIES_A_EXAMINER: readonly InertieInscrite[] = dette.inerties as InertieInscrite[];

/** La dette des coïncidences relevées au lot 1, à trancher. */
export const COINCIDENCES_A_EXAMINER: readonly CoincidenceInscrite[] = dette.coincidences;
