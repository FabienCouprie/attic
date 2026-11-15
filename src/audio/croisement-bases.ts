// audio/croisement-bases.ts — Les réglages de base que la passe de croisement prend à la place des défauts.
//
// POURQUOI CE MODULE EXISTE (lot 3d-2, décision de Fabien du 2026-11-14 : « une entrée propre par nœud
// si c'est simple, sinon non mesurable au banc »). Certains défauts ne donnent prise à aucun réglage :
// l'arbre rythmique n° 0 n'a qu'une note, et l'écart entre deux notes n'a rien à borner ; le motif par
// défaut d'un séquenceur n'allume que des pas pairs, que le swing ne décale pas. Pour ces nœuds, la
// passe part d'autres réglages de base, nommés ici avec leur raison. `ENTREES_PROPRES`, dans
// `audio/croisement-reglages.ts`, fait la même chose pour les ports.
//
// UNE BASE PROPRE CHANGE CE QUE LA PASSE VOIT, et c'est voulu : une inscription qui ne tenait qu'au
// défaut tombe, et se retire.

import type { Reglages } from "./lancer-fiche";
import { motifNomme } from "./cercle";

/** Une grille de motif : `rangees` lignes de seize pas, allumées là où `allume(rangée, pas)`. */
const grille = (rangees: number, allume: (r: number, s: number) => boolean) =>
  Array.from({ length: rangees }, (_, r) => Array.from({ length: 16 }, (_, s) => (allume(r, s) ? "1" : "0")).join("")).join("|");

/** Une ligne qui monte d'une rangée par pas sur les treize rangées, puis redescend : chaque pas sonne. */
const MOTIF_MELODIQUE = grille(13, (r, s) => (s < 13 ? r === s : r === [10, 7, 4][s - 13]));

/**
 * Le motif d'accords par défaut, I, V, VI et IV, et la triade du VIIe degré sur le pas 7.
 *
 * LE PAS 7 ET NON LE DERNIER (lot 3e) : impair, il swingue, et il reste dans la boucle à huit pas,
 * que le « Nombre de pas », devenu gouverneur, essaie aussi ; le pas 15 en sortait.
 */
const MOTIF_ACCORDS = grille(21, (r, s) => ({ 0: 0, 12: 4, 15: 8, 9: 12, 18: 7 } as Record<number, number>)[r] === s);

/** Le charley fermé sur chaque pas, les grosses caisses et la caisse claire par défaut : des contretemps. */
const MOTIF_BATTERIE = ["9000000090000000", "0000900000009000", "9999999999999999", ...Array<string>(5).fill("0".repeat(16))].join("|");

/** Par fiche, les réglages qui remplacent ses défauts dans la passe, et pourquoi. */
export const BASES_PROPRES: Record<string, { reglages: Reglages; raison: string }> = {
  "arbre-rythmique": {
    reglages: { Numéro: 339 },
    raison: "l'arbre n° 0 du catalogue, le défaut, n'a qu'une note : l'écart entre deux notes n'avait rien à borner, et une note seule tombait au même rang dans plusieurs gammes ; le n° 339, quatre triolets, en a douze",
  },
  "l-systeme": {
    reglages: { Exemple: "manuel", Règles: "A=A+A", Gamme: "phrygien" },
    raison: "les algues de Lindenmayer, l'exemple par défaut, n'ont ni « + » ni « - » et ne jouent que la tonique et le deuxième degré, où la plupart des gammes s'accordent : une grammaire qui monte d'un degré entre deux notes les joue tous, sur plus de deux octaves ; et la gamme de base est le phrygien, dont la seconde mineure sépare les algues des deux gammes d'essai, le mineur et le mineur harmonique",
  },
  "sequenceur-melodique": {
    reglages: { Motif: MOTIF_MELODIQUE },
    raison: "le motif par défaut n'allume que trois pas, tous pairs, que le swing ne décale pas, sur deux rangées où des gammes s'accordent : une ligne qui monte d'une rangée par pas les allume toutes, contretemps compris",
  },
  "sequenceur-accords": {
    reglages: { Motif: MOTIF_ACCORDS },
    raison: "le motif par défaut n'allume que des pas pairs, que le swing ne décale pas, et aucun accord du VIIe degré : sa triade, posée sur le pas 7, impair, que huit pas atteignent aussi, fait voir le swing et ce degré",
  },
  "color-looper": {
    reglages: { Couleurs: "#d95326,#d9ac26,#acd926,#53d926,#26d953,#26d9ac,#26acd9,#2653d9,#5326d9,#ac26d9,#d926ac,#d92653" },
    raison: "la palette par défaut n'a que quatre teintes, qui ne touchent que quatre degrés de chaque gamme, où plusieurs gammes s'accordent ; douze teintes également réparties les touchent tous",
  },
  "recaler-niveau": {
    reglages: { Plafond: -6 },
    raison: "au plafond par défaut, −1 dBFS, la crête du son second recalé reste dessous, et plafonner ou non rendait le même son ; à −6 dBFS, le plafond mord",
  },
  "generateur-frequence": {
    reglages: { Note: "C4" },
    raison: "la note par défaut, A4, est la fréquence par défaut, 440 Hz : saisir l'une ou l'autre rendait le même son ; un do les sépare",
  },
  "formule-sequence": {
    reglages: { Début: "4 - debut" },
    raison: "sans formule, aucune note ne change de place, et la séquence reçue est déjà dans l'ordre des départs : trier n'avait rien à remettre en ordre ; une formule qui renverse les départs le lui donne",
  },
  // LE LOT 3e (2026-11-15) : les bases que les réglages à choix, devenus gouverneurs, ont demandées.
  normaliseur: {
    reglages: { "Sonie cible": -6 },
    raison: "à la sonie par défaut, −14 LUFS, le son d'essai est à peine retouché et son vrai pic reste loin sous chaque plafond essayé ; à −6 LUFS, il doit monter de plusieurs décibels, et le plafond mord",
  },
  "restauration-ecretage": {
    reglages: { "Seuil manuel": 0.2 },
    raison: "le seuil manuel par défaut, 0,5, est au-dessus des plateaux du son d'essai, écrêté à 0,25 : en manuel, rien n'était tenu pour écrêté et le son ressortait tel quel ; à 0,2 les plateaux le dépassent, et 0,25 aurait rendu ce que rend l'automatique",
  },
  "retard-spectral": {
    reglages: { Réaction: 50 },
    raison: "sans réaction, la traîne ne dure que 79 ms, sous la plus petite borne essayée, 0,5 s : la borne n'avait rien à couper ; à 50 %, la traîne se répète quatorze fois, 1,1 s, et la borne de 0,5 s mord",
  },
  "partition-csound": {
    reglages: { Constante: 1 },
    raison: "la constante par défaut, zéro, est ce qu'écrit le champ « Courbe » sans courbe branchée : les deux choix rendaient la même partition dans chacun des quatre champs ; une constante de un les sépare",
  },
  "cercle-melodique": {
    reglages: { Motif: motifNomme("son") },
    raison: "le motif par défaut a douze places, où l'octave divisée par le cercle est le demi-ton : les deux répartitions rendaient les mêmes notes ; le son cubain, seize places, les sépare",
  },
  "spirale-spatiale": {
    reglages: { "Rapport libre": 3 },
    raison: "le rapport libre vaut 2 par défaut, le rapport du double : « Libre » rendait la même spirale ; un rapport de 3 les sépare",
  },
  "vitesse-midi": {
    reglages: { Facteur: 2, Pourcentage: 50 },
    raison: "au facteur 1, à cent pour cent et au tempo du fichier d'essai, les trois modes rendaient la vitesse d'origine : un facteur de 2 et cinquante pour cent les séparent",
  },
  "contrepoint-especes": {
    reglages: { "Voix aiguë": "G4 D4 G4 A4 G4 B4 C5" },
    raison: "l'exercice par défaut n'a aucun unisson intérieur, et la règle n'avait rien à juger : un ré contre ré au deuxième temps lui en donne un",
  },
  "sequenceur-batterie-avance": {
    reglages: { Motif: MOTIF_BATTERIE },
    raison: "le motif par défaut n'allume que des pas pairs, que le swing ne décale pas : le charley fermé sur chaque pas allume les contretemps, à huit, seize et trente-deux pas",
  },
  "voicings-accords": {
    reglages: { "Grave minimum": 24 },
    raison: "entre quarante et soixante, la fenêtre fait vingt demi-tons, plus étroite que les accords d'essai en drop 2 et 4, rendus alors tels quels comme à la base : à vingt-quatre, ils trouvent une octave sous le plafond",
  },
  "automate-cellulaire": {
    reglages: { "Règle personnalisée": 86 },
    raison: "la règle personnalisée vaut 90 par défaut, la règle par défaut : « Personnalisée » et « 90 » rendaient le même automate ; la règle 86, absente du menu, les sépare",
  },
  micromontage: {
    reglages: { "Transposition, fin": 12 },
    raison: "aux bornes par défaut, 0 et 0, la loi de transposition n'avait aucun écart à répartir, et ses trois valeurs rendaient la même transposition nulle ; une seconde borne à 12 lui en donne un",
  },
  "terrain-onde": {
    reglages: { "Centre X": 30 },
    raison: "au centre par défaut, les deux décalages que la passe essaie, ±200 %, sont des multiples de la période du produit de sinus, qui ne voyait rien bouger, et l'orbite centrée sur les ondes concentriques ne rendait que du silence ; un centre à 30 % ôte l'un et l'autre",
  },
};
