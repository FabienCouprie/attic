// plugins/arpege-nappe.ts — Les fiches de « Arpège par durée d'accord » et de « Nappe d'accords »,
// deux voix du chantier SoundHelix qui suivent l'harmonie accord par accord.
//
// ELLES REPRENNENT `ArpeggioSequenceEngine` et `PadSequenceEngine` de SoundHelix 0.9. Le calcul est
// dans `audio/soundhelix-accompagnement.ts`, comparé note pour note aux rendus du programme par
// `audio/soundhelix-accompagnement.test.ts`. L'activité, l'instrument et les hauteurs suivent les
// décisions D5, D6 et D7 de Fabien du 2026-11-28, comme « Voix sur l'accord » ; le nom de voix par
// défaut, `v1`, est le même dans les deux langues.

import { fiche, lecteurDe, type ContexteQuiDeclare } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante } from "../i18n";
import { appliquerInstrumentMidi } from "../audio";
import { PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { FauteMotif, lireMotif } from "../audio/soundhelix-motifs";
import { FauteAccord } from "../audio/soundhelix-accords";
import { FauteActivite, lireActivite, segmentsDeVoix } from "../audio/soundhelix-activite";
import { type HarmonieLue, VELOCITE_MAX, lireHarmonie, morceauEnMidi } from "../audio/soundhelix-midi";
import { type EntreeLigne, appliquerPiste } from "../audio/soundhelix-voix";
import { rendreArpege, rendreNappe } from "../audio/soundhelix-accompagnement";

const TICS_PAR_TEMPS = ["2", "3", "4", "6", "8", "12"];

/** Quatre arpèges écrits pour Attic, de 4, 8, 12 et 16 tics. */
export const MOTIFS_ARPEGE = "0,1,2,1\n0,1,2,3,2,1,0,-\n0,1,2,3,4,5,4,3,2,1,0,-\n0/2,1,2,3/2,4,5,6/2,5,4,3/2,2,1";

/** Ce que les deux fiches lisent de la même façon : l'harmonie et l'activité. */
async function lireCommun<N extends string>(ctx: ContexteQuiDeclare<N, "Voix">, en: boolean) {
  const lu = lecteurDe<"Voix">(ctx);
  const brute = ctx.entree(0);
  if (!(brute instanceof File)) return { faute: en ? "no harmony on the input" : "aucune harmonie en entrée" };
  const h = lireHarmonie(new Uint8Array(await brute.arrayBuffer()));
  const activite = ctx.entree(1);
  const nomVoix = lu.paramTexte("Voix", "v1").trim();
  let segments: number[] | null = null;
  if (typeof activite === "string") {
    const v = lireActivite(activite).find((x) => x.nom === nomVoix);
    if (!v) return { faute: en ? `the matrix has no voice « ${nomVoix} »` : `la matrice n'a pas de voix « ${nomVoix} »` };
    segments = segmentsDeVoix(v, h.sections, h.tics);
  }
  return { h, segments, nomVoix };
}

/** Le fichier d'une ou de plusieurs lignes, et le message qui le dit. */
async function rendre<N extends string>(
  ctx: ContexteQuiDeclare<N, "Transposition" | "Instrument">, en: boolean, h: HarmonieLue, lignes: EntreeLigne[][],
  voix: string | null, nom: string,
) {
  const lu = lecteurDe<"Transposition" | "Instrument">(ctx);
  const transposition = Math.round(lu.paramNombre("Transposition", 0));
  const notes = lignes.flatMap((l) => appliquerPiste(l, transposition, VELOCITE_MAX, VELOCITE_MAX))
    .filter((e) => e.hauteur !== null).map((e) => ({ tic: e.tic, tics: e.tics, hauteur: e.hauteur!, velocite: e.velocite }));
  const octets = morceauEnMidi(notes, { ticsParTemps: h.ticsParTemps, tics: h.tics, tempo: h.tempo, tempsParMesure: h.tempsParMesure });
  const fichier = await appliquerInstrumentMidi(new File([octets], nom, { type: "audio/midi" }), lu.paramNombre("Instrument", 0));
  const n = lignes.length;
  const message = en
    ? `${notes.length} notes${n > 1 ? ` · ${n} lines` : ""}${voix ? ` · voice « ${voix} »` : ""}`
    : `${notes.length} notes${n > 1 ? ` · ${n} lignes` : ""}${voix ? ` · voix « ${voix} »` : ""}`;
  return { valeurs: [fichier], message };
}

function enFaute(e: unknown, en: boolean) {
  if (e instanceof FauteAccord || e instanceof FauteMotif || e instanceof FauteActivite) {
    return { valeurs: [null], erreur: true, message: en ? e.en : e.message };
  }
  throw e;
}

const ENTREE_HARMONIE = { nom: "Harmonie", nomEn: "Harmony", type: "midi", sousType: "harmonie" } as const;
const ENTREE_ACTIVITE = { nom: "Activité", nomEn: "Activity", type: "texte", sousType: "activite", requis: false } as const;

const VOIX = { nom: "Voix", nomEn: "Voice", type: "texte", defaut: "v1", defautEn: "v1",
  doc: "Le nom de la ligne de la matrice d'activité qui gouverne la voix. Sans effet quand l'entrée « Activité » est libre.",
  docEn: "The name of the activity matrix line that governs the voice. No effect when the « Activity » input is free." } as const;
const TRANSPOSITION = { nom: "Transposition" as const, nomEn: "Transpose", plage: [-48, 48] as [number, number], pas: 1, defaut: 0,
  unite: " ½-ton", uniteEn: "st", doc: "Le décalage de toutes les notes, en demi-tons.", docEn: "The shift of all notes, in semitones." };
const COUPER = { nom: "Couper à la section", nomEn: "Cut at the section", type: "case", defaut: 0,
  doc: "Coché, un début de section compte comme un changement d'accord, même quand le même accord court par-dessus la frontière. Sans effet sur une harmonie sans marqueur de section.",
  docEn: "Checked, a section start counts as a chord change, even when the same chord runs across the boundary. No effect over a harmony without section markers." } as const;

const ACTIVITE = "L'entrée « Activité » porte une matrice d'activité : une ligne par voix, son nom, puis un signe par section d'accords, x quand la voix joue, . quand elle se tait ; debut= et fin=, facultatifs, déplacent en tics chaque entrée et chaque sortie de la voix. « Voix » désigne la ligne qui gouverne le nœud. Sans matrice branchée, la voix joue tout le morceau et « Voix » est sans effet.";
const ACTIVITE_EN = "The « Activity » input carries an activity matrix: one line per voice, its name, then one sign per chord section, x when the voice plays, . when it is silent; debut= and fin=, optional, move each entry and each exit of the voice, in ticks. « Voice » names the line that governs the node. Without a matrix connected, the voice plays the whole piece and « Voice » has no effect.";

const NOTICE_ARPEGE = `Arpège chaque accord de l'harmonie reçue par le motif dont la longueur couvre la durée de l'accord. Le modèle est celui du moteur d'arpège du générateur SoundHelix de Thomas Schürger (version 0.9, 2016).\n\n« Motif » donne les motifs, un par ligne, chacun d'une longueur en tics différente. À chaque accord, le composant prend le plus court qui dure au moins autant que l'accord, et le plus long quand aucun ne dure assez ; il le pose depuis le début de l'accord, le reprend en boucle au besoin et le coupe à la fin de l'accord. L'entrée « Motif », branchée, remplace le réglage. Une entrée de motif s'écrit décalage, puis ~ pour lier la note à la suivante, /durée en tics, :vélocité de 1 à 1000 ; - est un silence ; E(), (x)*n et (x)+d s'y emploient. 0, 1 et 2 sont la basse, le milieu et le haut de l'accord, 3 la basse à l'octave au-dessus, -1 le haut à l'octave au-dessous. « Tics par temps » est la résolution dans laquelle les motifs sont écrits, ramenée à la grille de l'harmonie.\n\n« Couper à la section » traite un début de section comme un changement d'accord. « Position fondamentale » ramène chaque accord à la position fondamentale que sa forme désigne avant d'y lire les décalages.\n\n${ACTIVITE} Une note ne part qu'à un tic où sa voix joue, et elle n'est pas coupée quand la voix se tait.\n\n« Transposition » décale toutes les notes, en demi-tons. « Vélocité » met à l'échelle la vélocité de chaque note. « Instrument » écrit le programme du canal dans le fichier.\n\nLa sortie « MIDI » porte les notes sur le canal 1, à la grille et au tempo de l'harmonie, le do central à 60.\n\nLe message donne le nombre de notes et la voix suivie.`;

const NOTICE_ARPEGE_EN = `Arpeggiates each chord of the received harmony with the pattern whose length covers the chord's duration. The model is that of the arpeggio engine of the SoundHelix generator by Thomas Schürger (version 0.9, 2016).\n\n« Pattern » gives the patterns, one per line, each of a different length in ticks. At each chord, the node takes the shortest one that lasts at least as long as the chord, and the longest when none lasts long enough; it lays it from the start of the chord, loops it when needed and cuts it at the end of the chord. The « Pattern » input, when connected, replaces the setting. A pattern entry is written offset, then ~ to tie the note to the next one, /length in ticks, :velocity from 1 to 1000; - is a rest; E(), (x)*n and (x)+d may be used. 0, 1 and 2 are the bass, middle and top of the chord, 3 the bass an octave up, -1 the top an octave down. « Ticks per beat » is the resolution the patterns are written in, brought to the grid of the harmony.\n\n« Cut at the section » treats a section start as a chord change. « Root position » brings each chord to the root position its shape designates before reading the offsets on it.\n\n${ACTIVITE_EN} A note only starts on a tick where its voice plays, and it is not cut when the voice falls silent.\n\n« Transpose » shifts all notes, in semitones. « Velocity » scales the velocity of each note. « Instrument » writes the channel's program into the file.\n\nThe « MIDI » output carries the notes on channel 1, at the grid and tempo of the harmony, middle C at 60.\n\nThe message gives the number of notes and the voice followed.`;

const NOTICE_NAPPE = `Tient les notes de chaque accord de l'harmonie reçue pendant tout l'accord, une ligne par note. Le modèle est celui du moteur de nappe du générateur SoundHelix de Thomas Schürger (version 0.9, 2016).\n\n« Notes » donne les décalages tenus, séparés par des virgules : 0, 1 et 2 sont la basse, le milieu et le haut de l'accord, 3 la basse à l'octave au-dessus, -1 le haut à l'octave au-dessous. Chaque décalage est une ligne.\n\n« Rejouer chaque accord » décoché, une hauteur commune à deux accords qui se suivent continue de sonner dans sa ligne, et les hauteurs neuves vont, dans l'ordre des décalages, aux lignes que l'accord neuf libère. Coché, chaque accord rejoue toutes ses notes. « Couper à la section » traite un début de section comme un changement d'accord. « Position fondamentale » ramène chaque accord à la position fondamentale que sa forme désigne avant d'y lire les décalages.\n\n${ACTIVITE} Une note commence à l'entrée de la voix et s'arrête à sa sortie.\n\n« Transposition » décale toutes les notes, en demi-tons. « Vélocité » donne la vélocité de chaque note. « Instrument » écrit le programme du canal dans le fichier.\n\nLa sortie « MIDI » porte les notes sur le canal 1, à la grille et au tempo de l'harmonie, le do central à 60.\n\nLe message donne le nombre de notes, celui des lignes quand il y en a plusieurs, et la voix suivie.`;

const NOTICE_NAPPE_EN = `Holds the notes of each chord of the received harmony for the whole chord, one line per note. The model is that of the pad engine of the SoundHelix generator by Thomas Schürger (version 0.9, 2016).\n\n« Notes » gives the held offsets, separated by commas: 0, 1 and 2 are the bass, middle and top of the chord, 3 the bass an octave up, -1 the top an octave down. Each offset is a line.\n\n« Retrigger each chord » unchecked, a pitch shared by two chords in a row keeps sounding in its line, and the new pitches go, in the order of the offsets, to the lines the new chord frees. Checked, each chord plays all its notes again. « Cut at the section » treats a section start as a chord change. « Root position » brings each chord to the root position its shape designates before reading the offsets on it.\n\n${ACTIVITE_EN} A note starts at the voice's entry and stops at its exit.\n\n« Transpose » shifts all notes, in semitones. « Velocity » gives the velocity of each note. « Instrument » writes the channel's program into the file.\n\nThe « MIDI » output carries the notes on channel 1, at the grid and tempo of the harmony, middle C at 60.\n\nThe message gives the number of notes, that of the lines when there are several, and the voice followed.`;

const DOC_POSITION = "Coché, chaque accord est ramené à sa position fondamentale avant d'y lire les décalages, et 0 est sa fondamentale. Décoché, 0 est la note la plus basse de l'accord reçu. Sans effet sur un accord qui n'a pas trois notes.";
const DOC_POSITION_EN = "Checked, each chord is brought to its root position before reading the offsets on it, and 0 is its root. Unchecked, 0 is the lowest note of the received chord. No effect on a chord that does not have three notes.";

export const fiches: FicheAudio[] = ([
  fiche({
    id: "arpege-duree-accord", nomDicte: "accords en cascade", nom: "Arpège par durée d'accord", nomEn: "Arpeggio by Chord Length",
    univers: "Entrées", famille: "Génération",
    resume: "Arpège chaque accord de l'harmonie par le motif dont la longueur couvre sa durée.",
    resumeEn: "Arpeggiates each chord of the harmony with the pattern whose length covers its duration.",
    notice: NOTICE_ARPEGE, noticeEn: NOTICE_ARPEGE_EN,
    entrees: [ENTREE_HARMONIE, ENTREE_ACTIVITE, { nom: "Motif", nomEn: "Pattern", type: "texte", sousType: "motif", requis: false }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIFS_ARPEGE, defautEn: MOTIFS_ARPEGE,
        doc: "Les motifs d'arpège, un par ligne, chacun d'une longueur en tics différente ; chaque accord prend le plus court qui le couvre, sinon le plus long. Sans effet quand l'entrée « Motif » est branchée.",
        docEn: "The arpeggio patterns, one per line, each of a different length in ticks; each chord takes the shortest one that covers it, otherwise the longest. No effect when the « Pattern » input is connected." },
      VOIX,
      COUPER,
      { nom: "Position fondamentale", nomEn: "Root position", type: "case", defaut: 1, doc: DOC_POSITION, docEn: DOC_POSITION_EN },
      TRANSPOSITION,
      { nom: "Vélocité", nomEn: "Velocity", plage: [1, 100], pas: 1, defaut: 100, unite: "%",
        doc: "La vélocité de chaque note, mise à l'échelle : à 50 %, une note écrite à 1000 joue à 500, sur 1000.",
        docEn: "The velocity of each note, scaled: at 50 %, a note written at 1000 plays at 500, out of 1000." },
      { nom: "Tics par temps", nomEn: "Ticks per beat", type: "choix", options: TICS_PAR_TEMPS, optionIds: TICS_PAR_TEMPS,
        optionsEn: TICS_PAR_TEMPS, defaut: "4",
        doc: "La résolution dans laquelle les motifs sont écrits, en tics par temps, ramenée à la grille de l'harmonie.",
        docEn: "The resolution the patterns are written in, in ticks per beat, brought to the grid of the harmony." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      try {
        const c = await lireCommun(ctx, en);
        if ("faute" in c) return { valeurs: [null], erreur: true, message: c.faute };
        const entree = ctx.entree(2);
        const textes = (typeof entree === "string" ? entree : ctx.paramTexte("Motif", MOTIFS_ARPEGE))
          .split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
        if (textes.length === 0) return { valeurs: [null], erreur: true, message: en ? "no pattern" : "aucun motif" };
        const motifs = textes.map((t) => lireMotif(t, { velociteMax: VELOCITE_MAX, ticsParTemps: c.h.ticsParTemps,
          ticsParTempsMotif: Number(ctx.paramTexte("Tics par temps", "4")) || 4 }));
        const ligne = rendreArpege({ harmonie: c.h, motifs, segments: c.segments,
          normaliser: ctx.paramNombre("Position fondamentale", 1) >= 0.5, couperALaSection: ctx.paramNombre("Couper à la section", 0) >= 0.5 });
        const velocite = Math.round(ctx.paramNombre("Vélocité", 100) * 10);
        return await rendre(ctx, en, c.h, [appliquerPiste(ligne, 0, velocite, VELOCITE_MAX)], c.segments ? c.nomVoix : null, "arpege.mid");
      } catch (e) {
        return enFaute(e, en);
      }
    },
  }),
  fiche({
    id: "nappe-accords", nom: "Nappe d'accords", nomEn: "Chord Pad",
    univers: "Entrées", famille: "Génération",
    resume: "Tient les notes de chaque accord de l'harmonie tout l'accord, une ligne par note.",
    resumeEn: "Holds the notes of each chord of the harmony for the whole chord, one line per note.",
    notice: NOTICE_NAPPE, noticeEn: NOTICE_NAPPE_EN,
    entrees: [ENTREE_HARMONIE, ENTREE_ACTIVITE],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Notes", nomEn: "Notes", type: "texte", defaut: "0,1,2", defautEn: "0,1,2",
        doc: "Les décalages tenus, séparés par des virgules, une ligne chacun : 0,1,2 tient les trois notes de l'accord, -1,0,1,2,3 l'élargit d'une note de chaque côté.",
        docEn: "The held offsets, separated by commas, one line each: 0,1,2 holds the three notes of the chord, -1,0,1,2,3 widens it by one note on each side." },
      VOIX,
      { nom: "Rejouer chaque accord", nomEn: "Retrigger each chord", type: "case", defaut: 0,
        doc: "Coché, chaque accord rejoue toutes ses notes. Décoché, une hauteur commune à deux accords qui se suivent continue de sonner.",
        docEn: "Checked, each chord plays all its notes again. Unchecked, a pitch shared by two chords in a row keeps sounding." },
      COUPER,
      { nom: "Position fondamentale", nomEn: "Root position", type: "case", defaut: 0, doc: DOC_POSITION, docEn: DOC_POSITION_EN },
      TRANSPOSITION,
      { nom: "Vélocité", nomEn: "Velocity", plage: [1, 100], pas: 1, defaut: 70, unite: "%",
        doc: "La vélocité de chaque note, sur 1000 : à 70 %, 700.",
        docEn: "The velocity of each note, out of 1000: at 70 %, 700." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      try {
        const c = await lireCommun(ctx, en);
        if ("faute" in c) return { valeurs: [null], erreur: true, message: c.faute };
        const decalages = ctx.paramTexte("Notes", "0,1,2").split(",").map((s) => s.trim()).filter((s) => s !== "").map(Number);
        if (decalages.length === 0 || decalages.some((d) => !Number.isInteger(d))) {
          return { valeurs: [null], erreur: true, message: en ? "unreadable notes" : "notes illisibles" };
        }
        const lignes = rendreNappe({ harmonie: c.h, decalages, segments: c.segments,
          normaliser: ctx.paramNombre("Position fondamentale", 0) >= 0.5, couperALaSection: ctx.paramNombre("Couper à la section", 0) >= 0.5,
          rejouer: ctx.paramNombre("Rejouer chaque accord", 0) >= 0.5, velocite: Math.round(ctx.paramNombre("Vélocité", 70) * 10) });
        return await rendre(ctx, en, c.h, lignes, c.segments ? c.nomVoix : null, "nappe.mid");
      } catch (e) {
        return enFaute(e, en);
      }
    },
  }),
] as FicheAudio[]).map(avecDoc);
