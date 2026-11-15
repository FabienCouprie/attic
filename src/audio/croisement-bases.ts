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

/** Une grille de motif : `rangees` lignes de seize pas, allumées là où `allume(rangée, pas)`. */
const grille = (rangees: number, allume: (r: number, s: number) => boolean) =>
  Array.from({ length: rangees }, (_, r) => Array.from({ length: 16 }, (_, s) => (allume(r, s) ? "1" : "0")).join("")).join("|");

/** Une ligne qui monte d'une rangée par pas sur les treize rangées, puis redescend : chaque pas sonne. */
const MOTIF_MELODIQUE = grille(13, (r, s) => (s < 13 ? r === s : r === [10, 7, 4][s - 13]));

/** Le motif d'accords par défaut, I, V, VI et IV, et la triade du VIIe degré sur le dernier pas. */
const MOTIF_ACCORDS = grille(21, (r, s) => ({ 0: 0, 12: 4, 15: 8, 9: 12, 18: 15 } as Record<number, number>)[r] === s);

/** Par fiche, les réglages qui remplacent ses défauts dans la passe, et pourquoi. */
export const BASES_PROPRES: Record<string, { reglages: Reglages; raison: string }> = {
  "arbre-rythmique": {
    reglages: { Numéro: 339 },
    raison: "l'arbre n° 0 du catalogue, le défaut, n'a qu'une note : l'écart entre deux notes n'avait rien à borner, et une note seule tombait au même rang dans plusieurs gammes ; le n° 339, quatre triolets, en a douze",
  },
  "l-systeme": {
    reglages: { Exemple: "manuel", Règles: "A=A+A" },
    raison: "les algues de Lindenmayer, l'exemple par défaut, n'ont ni « + » ni « - » et ne jouent que la tonique et le deuxième degré, où la plupart des gammes s'accordent : une grammaire qui monte d'un degré entre deux notes les joue tous, sur plus de deux octaves",
  },
  "sequenceur-melodique": {
    reglages: { Motif: MOTIF_MELODIQUE },
    raison: "le motif par défaut n'allume que trois pas, tous pairs, que le swing ne décale pas, sur deux rangées où des gammes s'accordent : une ligne qui monte d'une rangée par pas les allume toutes, contretemps compris",
  },
  "sequenceur-accords": {
    reglages: { Motif: MOTIF_ACCORDS },
    raison: "le motif par défaut n'allume que des pas pairs, que le swing ne décale pas, et aucun accord du VIIe degré, le seul où le majeur et la bebop dominante diffèrent : sa triade, posée sur le dernier pas, impair, fait voir l'un et l'autre",
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
};
