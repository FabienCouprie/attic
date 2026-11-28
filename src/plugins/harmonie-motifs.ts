// plugins/harmonie-motifs.ts — La fiche de « Harmonie par motifs », le premier nœud du chantier
// qui reprend dans Attic le générateur SoundHelix 0.9 de Thomas Schürger.
//
// LE CALCUL VIT DANS `audio/soundhelix-harmonie.ts` (le tirage et la pose du motif),
// `audio/soundhelix-accords.ts` (la grammaire des accords) et `audio/soundhelix-harmonie-midi.ts`
// (le fichier et les symboles). Il est comparé, accord par accord, aux rendus du programme
// original par `audio/soundhelix-harmonie.test.ts`.
//
// LES DÉCISIONS DE FABIEN DU 2026-11-28 qui le dessinent : le modèle réécrit sans rien traduire du
// source (D1) ; l'harmonie voyage en MIDI, un marqueur par section (D3) ; le réglage lit la
// grammaire de SoundHelix, où `Am6` est un renversement, et la sortie texte parle en symboles
// usuels (D4) ; tout s'écrit en la mineur, do central à 60, la tonalité se choisissant plus loin (D6).

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante } from "../i18n";
import { hasardDuNoeud } from "../core";
import { appliquerInstrumentMidi } from "../audio";
import { PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { FauteAccord } from "../audio/soundhelix-accords";
import { FauteMotif } from "../audio/soundhelix-motifs";
import { calculerHarmonie, tirerMotifAccords } from "../audio/soundhelix-harmonie";
import { harmonieEnMidi, symbolesParSection } from "../audio/soundhelix-harmonie-midi";

/** Trois motifs écrits pour Attic : deux sans table, un qui en tire trois. */
export const MOTIFS_PAR_DEFAUT = "Am/4,F/4,C/4,G/4\nAm/8,Dm/4,E7/4\n0/4,1/4,1!0/4,+2/4,$1/4,1/4,2/8";

/** Trois tables, la première comptée zéro. */
export const TABLES_PAR_DEFAUT = "Am,Am,Dm\nC,F,G,Em,Dm,Am\nE,E7,G,Esus4";

const TICS_PAR_TEMPS = ["2", "3", "4", "6", "8", "12"];

/** Les lignes non vides d'un texte, rognées. */
const lignes = (texte: string) => texte.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");

export const fiches: FicheAudio[] = ([
  fiche({
    id: "harmonie-motifs", nom: "Harmonie par motifs", nomEn: "Harmony from Patterns",
    univers: "Entrées", famille: "Génération",
    resume: "Tire un motif d'accords dans une banque, le répète sur tout le morceau et le découpe en sections.",
    resumeEn: "Draws a chord pattern from a bank, repeats it over the whole piece and cuts it into sections.",
    notice: "Tire un motif d'accords dans une banque, résout ses renvois de table, puis le répète jusqu'à la fin du morceau. Le modèle est celui du générateur SoundHelix de Thomas Schürger (version 0.9, 2016).\n\nUn motif est une suite d'éléments « accord/durée », séparés par des virgules ; la durée se compte en temps et peut être fractionnaire. L'accord a toujours trois sons. Il s'écrit :\n• par son nom : une fondamentale, de C à B, avec # ou b, puis rien pour l'accord majeur, m, 7, m7, aug, dim, sus4 ou sus2. Un chiffre final dit le renversement : 4 le premier, 6 le second. Am6 est donc la mineur avec mi à la basse, et non un accord de sixte ; G7 n'a que sol, si et fa ;\n• par trois hauteurs en demi-tons depuis le do central, séparées par deux points : -7:-3:4 ;\n• par un renvoi de table : 1 tire un accord dans la table 1, 1!3 tire dans la table 1 un accord différent de l'élément 3, $0 reprend l'élément 0. Les éléments se comptent à partir de zéro, renvois compris.\nUn + devant un élément ouvre une section d'accords ; le premier élément en ouvre toujours une. (x)*n répète un groupe d'éléments n fois.\n\n« Motifs d'accords » donne la banque, un motif par ligne ; un seul est tiré pour tout le morceau. « Tables d'accords » donne les tables, une par ligne, la première comptée zéro, les accords séparés par des virgules. Un tirage refuse l'accord égal au précédent à un renversement près, et pour le dernier élément le même nom que le premier ; quand les tables ne permettent aucun tirage, le composant le dit.\n\n« Mesures » et « Temps par mesure » donnent la longueur du morceau ; le motif est coupé à la fin, et sa dernière section est alors plus courte. « Tics par temps » est la grille du morceau : une durée qui ne tombe pas sur elle est arrondie au tic le plus proche, et le fichier rendu prend cette grille pour résolution. « Tempo » s'écrit dans le fichier.\n\n« Registre » place la note la plus basse de chaque accord nommé entre le registre moins douze et le registre moins un, en demi-tons depuis le do central. « Renversement au plus proche » donne à chaque accord le renversement, à l'octave près, dont la note du milieu est la plus proche de celle du premier accord du motif ; à distance égale, le moins déplacé. Deux accords égaux qui se suivent n'en font qu'un, même de part et d'autre d'une frontière de section.\n\n« Graine » fixe le tirage du motif et des tables ; 0 tire une graine à chaque exécution, et le message la donne. « Instrument » écrit le programme du canal dans le fichier.\n\nLa sortie « Harmonie » porte un fichier MIDI : les accords plaqués sur le canal 1, le do central à 60, un marqueur « section » au début de chaque section, le tempo et la mesure. La sortie « Accords » porte les symboles usuels des accords, Am, F/A, E7/G#, une ligne par section.\n\nLe message donne le rang du motif tiré, le nombre de sections et de mesures, les accords de la première section et la graine.",
    noticeEn: "Draws a chord pattern from a bank, resolves its table references, then repeats it until the end of the piece. The model is that of the SoundHelix generator by Thomas Schürger (version 0.9, 2016).\n\nA pattern is a series of « chord/length » elements, separated by commas; the length is counted in beats and may be fractional. The chord always has three notes. It is written:\n• by its name: a root, from C to B, with # or b, then nothing for the major chord, m, 7, m7, aug, dim, sus4 or sus2. A final digit gives the inversion: 4 the first, 6 the second. Am6 is therefore A minor with E in the bass, and not a sixth chord; G7 has only G, B and F;\n• by three pitches in semitones from middle C, separated by colons: -7:-3:4;\n• by a table reference: 1 draws a chord from table 1, 1!3 draws from table 1 a chord different from element 3, $0 repeats element 0. Elements are counted from zero, references included.\nA + before an element opens a chord section; the first element always opens one. (x)*n repeats a group of elements n times.\n\n« Chord patterns » gives the bank, one pattern per line; only one is drawn for the whole piece. « Chord tables » gives the tables, one per line, the first counted as zero, chords separated by commas. A draw refuses the chord equal to the previous one up to an inversion, and for the last element the same name as the first; when the tables allow no draw, the node says so.\n\n« Bars » and « Beats per bar » give the length of the piece; the pattern is cut at the end, and its last section is then shorter. « Ticks per beat » is the grid of the piece: a length that does not fall on it is rounded to the nearest tick, and the rendered file takes this grid as its resolution. « Tempo » is written into the file.\n\n« Register » places the lowest note of each named chord between the register minus twelve and the register minus one, in semitones from middle C. « Closest inversion » gives each chord the inversion, up to an octave, whose middle note is closest to that of the pattern's first chord; at equal distance, the least moved. Two equal chords in a row make only one, even across a section boundary.\n\n« Seed » fixes the draw of the pattern and of the tables; 0 draws a seed at every run, and the message gives it. « Instrument » writes the channel's program into the file.\n\nThe « Harmony » output carries a MIDI file: the block chords on channel 1, middle C at 60, a « section » marker at the start of each section, the tempo and the time signature. The « Chords » output carries the usual symbols of the chords, Am, F/A, E7/G#, one line per section.\n\nThe message gives the rank of the drawn pattern, the number of sections and bars, the chords of the first section and the seed.",
    entrees: [],
    sorties: [{ nom: "Harmonie", nomEn: "Harmony", type: "midi" }, { nom: "Accords", nomEn: "Chords", type: "texte" }],
    parametres: [
      { nom: "Motifs d'accords", nomEn: "Chord patterns", type: "texte", defaut: MOTIFS_PAR_DEFAUT,
        doc: "La banque de motifs, un par ligne, dans la grammaire de SoundHelix : « accord/durée en temps », un + pour ouvrir une section, des renvois de table 1, 1!3 et $0. Un seul motif est tiré pour tout le morceau.",
        docEn: "The bank of patterns, one per line, in the SoundHelix grammar: « chord/length in beats », a + to open a section, table references 1, 1!3 and $0. Only one pattern is drawn for the whole piece." },
      { nom: "Tables d'accords", nomEn: "Chord tables", type: "texte", defaut: TABLES_PAR_DEFAUT,
        doc: "Les tables où les renvois tirent leurs accords, une par ligne, la première comptée zéro, les accords séparés par des virgules. Un accord répété dans une table y pèse plus. Sans effet sur un motif qui n'a aucun renvoi de table.",
        docEn: "The tables that references draw their chords from, one per line, the first counted as zero, chords separated by commas. A chord repeated in a table weighs more there. No effect on a pattern without table references." },
      { nom: "Mesures", nomEn: "Bars", plage: [4, 512], pas: 1, defaut: 64,
        doc: "La longueur du morceau, en mesures. Le motif se répète jusqu'à elle, et le dernier est coupé.",
        docEn: "The length of the piece, in bars. The pattern repeats up to it, and the last one is cut." },
      { nom: "Temps par mesure", nomEn: "Beats per bar", plage: [2, 7], pas: 1, defaut: 4,
        doc: "Le nombre de temps d'une mesure. Il compte dans la longueur du morceau et s'écrit dans le fichier.",
        docEn: "The number of beats in a bar. It counts in the length of the piece and is written into the file." },
      { nom: "Tics par temps", nomEn: "Ticks per beat", type: "choix", options: TICS_PAR_TEMPS, optionIds: TICS_PAR_TEMPS,
        optionsEn: TICS_PAR_TEMPS, defaut: "4",
        doc: "La grille du morceau, en tics par temps. Une durée qui ne tombe pas sur elle est arrondie au tic le plus proche : à 4, une durée de 0,3 temps vaut un tic. Le fichier rendu prend cette grille pour résolution.",
        docEn: "The grid of the piece, in ticks per beat. A length that does not fall on it is rounded to the nearest tick: at 4, a length of 0.3 beats is one tick. The rendered file takes this grid as its resolution." },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Le tempo écrit dans le fichier, en noires par minute.",
        docEn: "The tempo written into the file, in quarter notes per minute." },
      { nom: "Registre", nomEn: "Register", plage: [-6, 11], pas: 1, defaut: 3,
        doc: "La place des accords nommés : la note la plus basse de chacun tombe entre le registre moins douze et le registre moins un, en demi-tons depuis le do central. À 3, entre le mi bémol sous le do central et le ré au-dessus. Sans effet sur un accord écrit par ses trois hauteurs.",
        docEn: "Where named chords sit: the lowest note of each falls between the register minus twelve and the register minus one, in semitones from middle C. At 3, between the E flat below middle C and the D above it. No effect on a chord written by its three pitches." },
      { nom: "Renversement au plus proche", nomEn: "Closest inversion", type: "case", defaut: 1,
        doc: "Coché, chaque accord prend le renversement, à l'octave près, dont la note du milieu est la plus proche de celle du premier accord du motif, ce qui tient les voix sans saut. Décoché, chaque accord garde le renversement que son nom écrit.",
        docEn: "Checked, each chord takes the inversion, up to an octave, whose middle note is closest to that of the pattern's first chord, which keeps the voices from leaping. Unchecked, each chord keeps the inversion its name writes." },
      { nom: "Graine", nomEn: "Seed", graine: true, plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine du tirage du motif et des tables. 0 = tirée à chaque exécution, et donnée dans le message pour être recopiée ici. Sans effet quand la banque n'a qu'un motif sans renvoi de table.",
        docEn: "Seed for the draw of the pattern and the tables. 0 = drawn at every run, and given in the message so it can be copied back here. No effect when the bank has a single pattern without table references." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const motifs = lignes(ctx.paramTexte("Motifs d'accords", MOTIFS_PAR_DEFAUT));
      const tables = lignes(ctx.paramTexte("Tables d'accords", TABLES_PAR_DEFAUT))
        .map((l) => l.split(",").map((a) => a.trim()).filter((a) => a !== ""));
      const mesures = Math.round(ctx.paramNombre("Mesures", 64));
      const tempsParMesure = Math.round(ctx.paramNombre("Temps par mesure", 4));
      const ticsParTemps = Number(ctx.paramTexte("Tics par temps", "4")) || 4;
      const tempo = ctx.paramNombre("Tempo", 120);
      const registre = Math.round(ctx.paramNombre("Registre", 3));
      const rapprocher = ctx.paramNombre("Renversement au plus proche", 1) >= 0.5;
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      try {
        const tire = tirerMotifAccords(motifs, tables, registre, aleatoire);
        const harmonie = calculerHarmonie({
          motif: tire.motif, ticsParTemps, tics: mesures * tempsParMesure * ticsParTemps, registre, rapprocher,
        });
        const octets = harmonieEnMidi(harmonie, { tempo, tempsParMesure, ticsParTemps });
        const fichier = await appliquerInstrumentMidi(
          new File([octets], "harmonie.mid", { type: "audio/midi" }), ctx.paramNombre("Instrument", 0));
        const symboles = symbolesParSection(harmonie);
        const n = harmonie.sections.length;
        const message = en
          ? `pattern ${tire.rang + 1} of ${motifs.length} · ${n} section${n > 1 ? "s" : ""} · ${mesures} bars · ${symboles[0]} · seed ${graine}`
          : `motif ${tire.rang + 1} sur ${motifs.length} · ${n} section${n > 1 ? "s" : ""} · ${mesures} mesures · ${symboles[0]} · graine ${graine}`;
        return { valeurs: [fichier, symboles.join("\n")], message };
      } catch (e) {
        if (e instanceof FauteAccord || e instanceof FauteMotif) {
          return { valeurs: [null, null], erreur: true, message: en ? e.en : e.message };
        }
        throw e;
      }
    },
  }),
] as FicheAudio[]).map(avecDoc);
