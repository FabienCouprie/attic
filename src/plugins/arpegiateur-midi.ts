// plugins/arpegiateur-midi.ts — La fiche de « Arpégiateur MIDI ».
//
// ELLE A QUITTÉ `effets-midi.ts`, qui reste son registre : ce fichier était à 394 lignes de code
// pour une norme de quatre cents, et la revue du 2026-11-14 enrichit ses trois listes. Elle y est
// reprise à sa place, de sorte que l'ordre du catalogue ne bouge pas. Le calcul vit dans
// `audio/midi-arpege.ts`.
//
// LES TROIS LISTES SUIVENT LES NOMENCLATURES DU DÉPÔT, décisions de Fabien du même jour :
//  - la direction prend le vocabulaire du sens d'un arpège (`montant`, `descendant`,
//    `aller-retour`), plus trois modes : l'ordre de jeu, convergent et divergent. Ses identifiants
//    étaient ses libellés français, dont deux mots anglais, « UpDown » et « DownUp » ;
//  - la vitesse offre la table entière des valeurs de note, pointées et triolets compris ;
//  - le motif glisse sur l'arpège, ce qui est l'affaire du calcul.

import { fiche } from "./fiche";
import { langueCourante, traduire } from "../i18n";
import { hasardDuNoeud } from "../core";
import { appliquerInstrumentMidi } from "../audio";
import { PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { DIRECTIONS } from "../audio/midi-arpege";
import { LIBELLES_HERITES_VALEURS, VALEURS_NOTE, choixValeurs, valeurNote } from "../audio/valeurs-note";

/** Les libellés des directions, dans l'ordre de `DIRECTIONS`. */
export const DIRECTIONS_ARPEGE = {
  ids: [...DIRECTIONS],
  fr: ["Montant", "Descendant", "Aller-retour", "Retour-aller", "Aléatoire", "Ordre de jeu", "Convergent", "Divergent"],
  en: ["Ascending", "Descending", "Round trip", "Reverse round trip", "Random", "As played", "Converging", "Diverging"],
};

/**
 * Les directions d'avant que ne relisent ni l'identifiant ni le libellé d'aujourd'hui.
 *
 * « Montant », « Descendant » et « Aléatoire » étaient à la fois identifiants et libellés français,
 * et le restent comme libellés : ils se relisent seuls. Restent les deux mots anglais de la liste
 * française et les deux libellés anglais d'alors.
 */
export const DIRECTIONS_HERITEES: Record<string, string> = {
  "UpDown": "aller-retour", "DownUp": "retour-aller", "Up": "montant", "Down": "descendant",
};

/** La vitesse : la table entière des valeurs de note. */
export const VITESSES_ARPEGE = choixValeurs(VALEURS_NOTE.map((v) => v.id));

export const ARPEGIATEUR_MIDI = fiche({
  id: "arpegiateur-midi", nomDicte: "notes en cascade", nom: "Arpégiateur MIDI", nomEn: "MIDI Arpeggiator",
  univers: "Traitement", famille: "Effets",
  resume: "Arpège les accords d'un fichier MIDI selon un motif et une direction.",
  resumeEn: "Arpeggiates chords from a MIDI file according to a pattern and direction.",
  entrees: [{ nom: "MIDI", type: "midi" }],
  sorties: [{ nom: "MIDI", type: "midi" }],
  parametres: [
    { nom: "Direction", nomEn: "Direction", type: "choix",
      options: DIRECTIONS_ARPEGE.fr, optionsEn: DIRECTIONS_ARPEGE.en, optionIds: DIRECTIONS_ARPEGE.ids,
      optionsHeritees: DIRECTIONS_HERITEES, defaut: "Montant", defautEn: "Ascending",
      doc: "L'ordre des notes de l'arpège, déroulé sur toutes les octaves. Montant : du grave à l'aigu. Descendant : de l'aigu au grave. Aller-retour : montant puis descendant, sans rejouer les extrêmes. Retour-aller : descendant puis montant. Aléatoire : un ordre tiré au sort, que la graine fixe. Ordre de jeu : l'ordre où les notes de l'accord sont arrivées. Convergent : des bords vers le milieu, la plus grave, la plus aiguë, puis la deuxième plus grave. Divergent : l'ordre convergent à rebours, du milieu vers les bords.",
      docEn: "The order of the arpeggio's notes, laid out over all the octaves. Ascending: low to high. Descending: high to low. Round trip: ascending then descending, without replaying the extremes. Reverse round trip: descending then ascending. Random: an order drawn at random, fixed by the seed. As played: the order in which the chord's notes arrived. Converging: from the edges to the middle, the lowest, the highest, then the second lowest. Diverging: the converging order reversed, from the middle to the edges." },
    { nom: "Motif", nomEn: "Pattern", type: "choix",
      options: ["Droit", "1232", "12321", "1321", "1213"], optionIds: ["Droit", "1232", "12321", "1321", "1213"],
      optionsEn: ["Straight", "1232", "12321", "1321", "1213"],
      defaut: "Droit", defautEn: "Straight",
      doc: "Le motif posé sur l'arpège. Chaque chiffre désigne une note de l'arpège, 1 la première dans l'ordre de la direction ; le motif se rejoue décalé d'une note à chaque fois, jusqu'au bout de l'arpège, octaves comprises : 1232 sur do, mi, sol, do aigu rend do mi sol mi, puis mi sol do aigu sol. Droit : l'arpège tel que la direction le déroule.",
      docEn: "The pattern laid over the arpeggio. Each digit names a note of the arpeggio, 1 being the first in the direction's order; the pattern is replayed shifted by one note each time, up to the end of the arpeggio, octaves included: 1232 over C, E, G, high C gives C E G E, then E G high C G. Straight: the arpeggio as the direction lays it out." },
    // SES IDENTIFIANTS ÉTAIENT SES LIBELLÉS, dont « 1/8 triplet », un mot anglais dans une liste
    // française. Les anciennes valeurs se relisent par `LIBELLES_HERITES_VALEURS`.
    { nom: "Vitesse", nomEn: "Speed", type: "choix", ...VITESSES_ARPEGE,
      optionsHeritees: LIBELLES_HERITES_VALEURS, defaut: "1/16",
      doc: "La valeur de note d'un pas, comptée sur le tempo du fichier : 1/16 fait quatre pas par noire. Une pointée dure une fois et demie la valeur simple, un triolet deux tiers. Le fichier rendu garde les tempos et la métrique de l'entrée.",
      docEn: "The note value of one step, counted on the file's tempo: 1/16 makes four steps per quarter note. A dotted value lasts one and a half times the plain one, a triplet two thirds. The output file keeps the input's tempos and time signature.", defautEn: "1/16" },
    { nom: "Octaves", nomEn: "Octaves", plage: [1, 4], pas: 1, defaut: 1,
      doc: "Le nombre d'octaves sur lesquelles l'arpège se déploie : chaque octave rejoue l'accord douze demi-tons plus haut, à la suite de la précédente.",
      docEn: "The number of octaves the arpeggio spans: each octave replays the chord twelve semitones higher, after the previous one." },
    { nom: "Graine", graine: true, nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 0,
      doc: "Graine de l'ordre des notes, sans effet hors du mode « Aléatoire ». 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici.",
      docEn: "Seed for the note order; no effect outside the « Random » mode. 0 = drawn at random on every run, and shown in the message so it can be copied back here." },
    { nom: "Durée note", nomEn: "Note length", plage: [10, 100], pas: 5, defaut: 50, unite: "%",
      doc: "Durée de chaque note arpégée en pourcentage du pas de temps. 100% = legato, 50% = staccato.",
      docEn: "Length of each arpeggiated note as a percentage of the step time. 100% = legato, 50% = staccato." },
    PARAMETRE_INSTRUMENT_SF2,
  ],
  async executer(ctx) {
    const { arpegerMidi } = await import("../audio");
    const fichier = ctx.entree(0);
    if (!(fichier instanceof File)) return { valeurs: [null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
    const direction = ctx.paramTexte("Direction", "montant");
    const motif = ctx.paramTexte("Motif", "Droit");
    const vitesse = ctx.paramTexte("Vitesse", "1/16");
    const octaves = Math.round(ctx.paramNombre("Octaves", 1));
    const dureeNote = ctx.paramNombre("Durée note", 50);
    const { graine, aleatoire: aleatoireArpege } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
    const nouvFichier = await appliquerInstrumentMidi(
      await arpegerMidi(fichier, motif, direction, vitesse, octaves, dureeNote, aleatoireArpege),
      ctx.paramNombre("Instrument", 0),
    );
    // LA DIRECTION ET LA VITESSE SE DISENT PAR LEUR LIBELLÉ, dans la langue de l'interface.
    const en = langueCourante() === "en";
    const rang = DIRECTIONS_ARPEGE.ids.indexOf(direction as (typeof DIRECTIONS)[number]);
    const directionDite = rang < 0 ? direction : (en ? DIRECTIONS_ARPEGE.en : DIRECTIONS_ARPEGE.fr)[rang];
    const valeur = valeurNote(vitesse);
    const vitesseDite = valeur ? (en ? valeur.en : valeur.fr) : vitesse;
    return { valeurs: [nouvFichier], message: traduire("msg.var_0_graine_var_1", traduire("msg.arp_ge_var_0_var_1_var_2_oct", directionDite, vitesseDite, octaves), graine) };
  },
});
