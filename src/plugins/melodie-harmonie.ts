// plugins/melodie-harmonie.ts — La fiche de « Mélodie sur l'harmonie » : une marche au hasard sur la
// gamme et sur l'accord, une mélodie par sorte de section, reprise à chaque retour de la section.
//
// ELLE REPREND `MelodySequenceEngine` de SoundHelix 0.9 (décision D1 : le modèle réécrit, non le
// tirage du programme). Le calcul est dans `audio/soundhelix-melodie.ts`, éprouvé par la loi.
// L'activité, l'instrument et les hauteurs suivent les décisions D5, D6 et D7 de Fabien du
// 2026-11-28, comme les autres voix du chantier.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante } from "../i18n";
import { hasardDuNoeud } from "../core";
import { appliquerInstrumentMidi } from "../audio";
import { PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { FauteMotif, lireMotif } from "../audio/soundhelix-motifs";
import { FauteActivite, lireActivite, segmentsDeVoix } from "../audio/soundhelix-activite";
import { VELOCITE_MAX, lireHarmonie, morceauEnMidi } from "../audio/soundhelix-midi";
import { appliquerPiste } from "../audio/soundhelix-voix";
import { rendreMelodie } from "../audio/soundhelix-melodie";

const TICS_PAR_TEMPS = ["2", "3", "4", "6", "8", "12"];

/** Un rythme de mélodie écrit pour Attic : une note de l'accord, des pas, une répétition, un silence. */
export const MOTIF_MELODIE = "#/2,+/2,+/2,+/2,#/4,*/2,-/2";

const liste = (t: string) => t.split(",").map((s) => s.trim()).filter((s) => s !== "").map(Number);

const NOTICE = "Tire une mélodie pour chaque sorte de section de l'harmonie reçue, une marche au hasard sur la gamme et sur l'accord, et la reprend à chaque retour de la section. Le modèle est celui du moteur de mélodie du générateur SoundHelix de Thomas Schürger (version 0.9, 2016).\n\nDeux sections qui portent les mêmes accords aux mêmes durées sont de la même sorte. « Mélodies par section » donne, séparés par des virgules, le nombre de mélodies de chaque sorte, dans l'ordre où les sortes apparaissent, la liste reprise en boucle : à 1,2,2,3, la première sorte n'a qu'une mélodie, la deuxième deux. Les retours d'une sorte jouent ses mélodies à tour de rôle.\n\n« Motif » donne le rythme, repris au début de chaque section ; l'entrée « Motif », branchée, le remplace. Une entrée s'écrit joker ou décalage, puis ~ pour lier la note à la suivante, /durée en tics, :vélocité sur 1000 ; - est un silence. + avance d'un pas tiré dans « Pas », en degrés de la gamme de do majeur ; # et un décalage écrit avancent d'un pas parmi les notes de l'accord du moment ; * répète la note d'avant. La première note de chaque mélodie est une note de l'accord. « Tics par temps » est la résolution dans laquelle le motif est écrit, ramenée à la grille de l'harmonie.\n\n« Pas » donne les pas possibles, séparés par des virgules ; un pas écrit deux fois est tiré deux fois plus souvent. La marche reste entre « Hauteur min » et « Hauteur max », en demi-tons depuis le do central : un pas qui en sortirait est tiré à nouveau, et après vingt essais il se fait vers l'intérieur.\n\nL'entrée « Activité » porte une matrice d'activité : une ligne par voix, son nom, puis un signe par section d'accords, x quand la voix joue, . quand elle se tait ; debut= et fin=, facultatifs, déplacent en tics chaque entrée et chaque sortie de la voix. « Voix » désigne la ligne qui gouverne la mélodie. Une note ne part qu'à un tic où sa voix joue, et elle n'est pas coupée quand la voix se tait. Sans matrice branchée, la voix joue tout le morceau et « Voix » est sans effet.\n\n« Transposition » décale toutes les notes, en demi-tons. « Vélocité » met à l'échelle la vélocité de chaque note. « Graine » fixe le tirage ; 0 tire une graine à chaque exécution, et le message la donne. « Instrument » écrit le programme du canal dans le fichier.\n\nLa sortie « MIDI » porte les notes sur le canal 1, à la grille et au tempo de l'harmonie, le do central à 60.\n\nLe message donne le nombre de notes, la voix suivie et la graine.";
const NOTICE_EN = "Draws one melody for each kind of section of the received harmony, a random walk on the scale and on the chord, and plays it again each time the section comes back. The model is that of the melody engine of the SoundHelix generator by Thomas Schürger (version 0.9, 2016).\n\nTwo sections carrying the same chords for the same lengths are of the same kind. « Melodies per section » gives, separated by commas, the number of melodies of each kind, in the order the kinds appear, the list looped: at 1,2,2,3, the first kind has a single melody, the second two. The returns of a kind play its melodies in turn.\n\n« Pattern » gives the rhythm, restarted at the start of each section; the « Pattern » input, when connected, replaces it. An entry is written joker or offset, then ~ to tie the note to the next one, /length in ticks, :velocity out of 1000; - is a rest. + moves by a step drawn from « Steps », in degrees of the C major scale; # and a written offset move by a step among the notes of the current chord; * repeats the note before. The first note of each melody is a note of the chord. « Ticks per beat » is the resolution the pattern is written in, brought to the grid of the harmony.\n\n« Steps » gives the possible steps, separated by commas; a step written twice is drawn twice as often. The walk stays between « Pitch min » and « Pitch max », in semitones from middle C: a step that would leave it is drawn again, and after twenty tries it goes inward.\n\nThe « Activity » input carries an activity matrix: one line per voice, its name, then one sign per chord section, x when the voice plays, . when it is silent; debut= and fin=, optional, move each entry and each exit of the voice, in ticks. « Voice » names the line that governs the melody. A note only starts on a tick where its voice plays, and it is not cut when the voice falls silent. Without a matrix connected, the voice plays the whole piece and « Voice » has no effect.\n\n« Transpose » shifts all notes, in semitones. « Velocity » scales the velocity of each note. « Seed » fixes the draw; 0 draws a seed at every run, and the message gives it. « Instrument » writes the channel's program into the file.\n\nThe « MIDI » output carries the notes on channel 1, at the grid and tempo of the harmony, middle C at 60.\n\nThe message gives the number of notes, the voice followed and the seed.";

export const fiches: FicheAudio[] = ([
  fiche({
    id: "melodie-harmonie", nom: "Mélodie sur l'harmonie", nomEn: "Melody over the Harmony",
    univers: "Entrées", famille: "Génération",
    resume: "Tire une mélodie par sorte de section, une marche sur la gamme et sur l'accord, reprise au retour de la section.",
    resumeEn: "Draws one melody per kind of section, a walk on the scale and the chord, repeated when the section comes back.",
    notice: NOTICE, noticeEn: NOTICE_EN,
    entrees: [
      { nom: "Harmonie", nomEn: "Harmony", type: "midi", sousType: "harmonie" },
      { nom: "Activité", nomEn: "Activity", type: "texte", sousType: "activite", requis: false },
      { nom: "Motif", nomEn: "Pattern", type: "texte", sousType: "motif", requis: false },
    ],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_MELODIE, defautEn: MOTIF_MELODIE,
        doc: "Le rythme de la mélodie : + un pas sur la gamme, # un pas sur l'accord, * la note d'avant, - un silence, /durée en tics, :vélocité. Sans effet quand l'entrée « Motif » est branchée.",
        docEn: "The rhythm of the melody: + a step on the scale, # a step on the chord, * the note before, - a rest, /length in ticks, :velocity. No effect when the « Pattern » input is connected." },
      { nom: "Mélodies par section", nomEn: "Melodies per section", type: "texte", defaut: "1,2,2,3", defautEn: "1,2,2,3",
        doc: "Le nombre de mélodies de chaque sorte de section, dans l'ordre où les sortes apparaissent, séparés par des virgules, la liste reprise en boucle.",
        docEn: "The number of melodies of each kind of section, in the order the kinds appear, separated by commas, the list looped." },
      { nom: "Hauteur min", nomEn: "Pitch min", plage: [-24, 36], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st",
        doc: "La note la plus grave de la marche, en demi-tons depuis le do central.", docEn: "The lowest note of the walk, in semitones from middle C." },
      { nom: "Hauteur max", nomEn: "Pitch max", plage: [-24, 36], pas: 1, defaut: 12, unite: " ½-ton", uniteEn: "st",
        doc: "La note la plus aiguë de la marche, en demi-tons depuis le do central.", docEn: "The highest note of the walk, in semitones from middle C." },
      { nom: "Pas", nomEn: "Steps", type: "texte", defaut: "-2,-1,-1,1,1,2", defautEn: "-2,-1,-1,1,1,2",
        doc: "Les pas de la marche, séparés par des virgules, en degrés de la gamme pour + et en notes de l'accord pour # ; un pas écrit deux fois est tiré deux fois plus souvent.",
        docEn: "The steps of the walk, separated by commas, in degrees of the scale for + and in notes of the chord for #; a step written twice is drawn twice as often." },
      { nom: "Voix", nomEn: "Voice", type: "texte", defaut: "v1", defautEn: "v1",
        doc: "Le nom de la ligne de la matrice d'activité qui gouverne la mélodie. Sans effet quand l'entrée « Activité » est libre.",
        docEn: "The name of the activity matrix line that governs the melody. No effect when the « Activity » input is free." },
      { nom: "Transposition", nomEn: "Transpose", plage: [-48, 48], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st",
        doc: "Le décalage de toutes les notes, en demi-tons.", docEn: "The shift of all notes, in semitones." },
      { nom: "Vélocité", nomEn: "Velocity", plage: [1, 100], pas: 1, defaut: 100, unite: "%",
        doc: "La vélocité de chaque note, mise à l'échelle : à 50 %, une note écrite à 1000 joue à 500, sur 1000.",
        docEn: "The velocity of each note, scaled: at 50 %, a note written at 1000 plays at 500, out of 1000." },
      { nom: "Tics par temps", nomEn: "Ticks per beat", type: "choix", options: TICS_PAR_TEMPS, optionIds: TICS_PAR_TEMPS,
        optionsEn: TICS_PAR_TEMPS, defaut: "4",
        doc: "La résolution dans laquelle le motif est écrit, en tics par temps, ramenée à la grille de l'harmonie.",
        docEn: "The resolution the pattern is written in, in ticks per beat, brought to the grid of the harmony." },
      { nom: "Graine", nomEn: "Seed", graine: true, plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine du tirage des mélodies. 0 = tirée à chaque exécution, et donnée dans le message pour être recopiée ici.",
        docEn: "Seed for the draw of the melodies. 0 = drawn at every run, and given in the message so it can be copied back here." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const brute = ctx.entree(0);
      if (!(brute instanceof File)) return { valeurs: [null], erreur: true, message: en ? "no harmony on the input" : "aucune harmonie en entrée" };
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      try {
        const h = lireHarmonie(new Uint8Array(await brute.arrayBuffer()));
        const activite = ctx.entree(1);
        const nomVoix = ctx.paramTexte("Voix", "v1").trim();
        let segments: number[] | null = null;
        if (typeof activite === "string") {
          const v = lireActivite(activite).find((x) => x.nom === nomVoix);
          if (!v) return { valeurs: [null], erreur: true, message: en ? `the matrix has no voice « ${nomVoix} »` : `la matrice n'a pas de voix « ${nomVoix} »` };
          segments = segmentsDeVoix(v, h.sections, h.tics);
        }
        const entree = ctx.entree(2);
        const motif = lireMotif(typeof entree === "string" ? entree : ctx.paramTexte("Motif", MOTIF_MELODIE), {
          jokers: "+#*", velociteMax: VELOCITE_MAX, ticsParTemps: h.ticsParTemps, ticsParTempsMotif: Number(ctx.paramTexte("Tics par temps", "4")) || 4 });
        const melodies = liste(ctx.paramTexte("Mélodies par section", "1,2,2,3"));
        const pas = liste(ctx.paramTexte("Pas", "-2,-1,-1,1,1,2"));
        if (melodies.length === 0 || melodies.some((m) => !Number.isInteger(m) || m < 1) || pas.length === 0 || pas.some((p) => !Number.isInteger(p))) {
          return { valeurs: [null], erreur: true, message: en ? "unreadable melodies per section or steps" : "mélodies par section ou pas illisibles" };
        }
        const bas = Math.round(ctx.paramNombre("Hauteur min", 0));
        const haut = Math.round(ctx.paramNombre("Hauteur max", 12));
        const ligne = rendreMelodie({ harmonie: h, motif, segments, melodiesParSection: melodies, min: Math.min(bas, haut), max: Math.max(bas, haut), pas, aleatoire });
        const notes = appliquerPiste(ligne, Math.round(ctx.paramNombre("Transposition", 0)), Math.round(ctx.paramNombre("Vélocité", 100) * 10), VELOCITE_MAX)
          .filter((e) => e.hauteur !== null).map((e) => ({ tic: e.tic, tics: e.tics, hauteur: e.hauteur!, velocite: e.velocite }));
        const octets = morceauEnMidi(notes, { ticsParTemps: h.ticsParTemps, tics: h.tics, tempo: h.tempo, tempsParMesure: h.tempsParMesure });
        const fichier = await appliquerInstrumentMidi(new File([octets], "melodie.mid", { type: "audio/midi" }), ctx.paramNombre("Instrument", 0));
        const message = en
          ? `${notes.length} notes${segments ? ` · voice « ${nomVoix} »` : ""} · seed ${graine}`
          : `${notes.length} notes${segments ? ` · voix « ${nomVoix} »` : ""} · graine ${graine}`;
        return { valeurs: [fichier], message };
      } catch (e) {
        if (e instanceof FauteMotif || e instanceof FauteActivite) return { valeurs: [null], erreur: true, message: en ? e.en : e.message };
        throw e;
      }
    },
  }),
] as FicheAudio[]).map(avecDoc);
