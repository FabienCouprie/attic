// plugins/voix-sur-accord.ts — La fiche de « Voix sur l'accord », le moteur de séquence le plus
// général du chantier SoundHelix : un motif posé sur l'harmonie, sur l'accord ou libre, une ou
// plusieurs lignes, en voix parallèles au besoin.
//
// ELLE REPREND CINQ MOTEURS DE SoundHelix 0.9 : `PatternSequenceEngine` (un motif sur l'accord),
// `MultiPatternSequenceEngine` (plusieurs, une ligne chacun), `ChordSequenceEngine` (les voix
// parallèles, `0,1,2`), `FreePatternSequenceEngine` et `FreeMultiPatternSequenceEngine` (« Hauteurs »
// sur « Libres »). Le calcul est dans `audio/soundhelix-voix.ts`, comparé note pour note aux rendus
// du programme par `audio/soundhelix-voix.test.ts`.
//
// DÉCISIONS DE FABIEN DU 2026-11-28 : l'activité se lit sur une entrée facultative et un réglage
// « Voix » (D5) ; « Instrument » s'écrit dans le fichier (D7) ; tout s'écrit en la mineur, do central à
// 60 (D6). PRISES DANS LE LOT, sur sa consigne d'avancer seul : les vélocités d'un motif se comptent en
// millièmes, comme dans les essais du banc ; « Tics par temps » dit la résolution du motif, que le nœud
// ramène à la grille de l'harmonie ; l'entrée « Motif » porte une ligne par motif, comme le réglage.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante } from "../i18n";
import { appliquerInstrumentMidi } from "../audio";
import { PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { FauteMotif, lireMotif } from "../audio/soundhelix-motifs";
import { FauteAccord } from "../audio/soundhelix-accords";
import { FauteActivite, lireActivite, segmentsDeVoix } from "../audio/soundhelix-activite";
import { VELOCITE_MAX, lireHarmonie, morceauEnMidi } from "../audio/soundhelix-midi";
import { type Reprise, appliquerPiste, rendreLigne } from "../audio/soundhelix-voix";

const TICS_PAR_TEMPS = ["2", "3", "4", "6", "8", "12"];

/** Un motif d'accompagnement écrit pour Attic : basse, milieu, haut, une note de passage. */
export const MOTIF_PAR_DEFAUT = "0/2,-/2,1,2,-/2,(0,1)*2,+/2,-/2";

const NOTICE = "Pose un motif sur l'harmonie reçue, entrée après entrée, depuis le début du morceau et en boucle. Le modèle est celui des moteurs de séquence du générateur SoundHelix de Thomas Schürger (version 0.9, 2016).\n\nUn motif est une suite d'entrées séparées par des virgules. Une entrée s'écrit décalage, puis ~ pour lier la note à la suivante, /durée en tics, :vélocité de 1 à 1000 ; sans durée, elle dure un tic, sans vélocité, elle vaut 1000. - est un silence. Sur l'accord, + est une note de passage. E(impulsions,pas,note,silence) écrit un rythme euclidien ; (x)*n répète un groupe ; (x)+d et (x)-d en décalent les décalages de d.\n\n« Hauteurs » dit ce que vaut un décalage. Sur l'accord, 0, 1 et 2 sont la basse, le milieu et le haut de l'accord du moment, 3 la basse à l'octave au-dessus, -1 le haut à l'octave au-dessous ; chaque entrée prend l'accord de son premier tic. Libres, un décalage est une hauteur en demi-tons depuis le do central, et l'harmonie ne donne plus que la grille, le tempo et la longueur du morceau.\n\nLa note de passage part de la basse de l'accord et va vers la basse de l'accord de la note suivante du motif : à un ton, le demi-ton entre les deux ; à un demi-ton ou à l'unisson, la basse même ; au-delà, la première note de la gamme de do majeur passé la basse, dans le sens du mouvement. Quand la note suivante tombe hors de l'activité, la note de passage est la basse.\n\n« Motif » donne un motif par ligne, chaque ligne jouée en même temps que les autres ; l'entrée « Motif », branchée, remplace le réglage. « Tics par temps » est la résolution dans laquelle le motif est écrit, ramenée à la grille de l'harmonie.\n\n« Voix parallèles » ajoute à chaque décalage du motif chacune des valeurs données, une ligne par valeur : 0,1,2 sur l'accord rend l'accord plaqué.\n\n« Reprise » remet le motif à son début à la fin du morceau seulement, au début de chaque section ou de chaque accord ; l'entrée qui déborde une reprise est raccourcie.\n\n« Position fondamentale » ramène chaque accord à la position fondamentale que sa forme désigne avant d'y lire les décalages ; un accord augmenté n'en a pas et reste tel qu'il est. Sans effet sous « Libres ».\n\nL'entrée « Activité » porte une matrice d'activité : une ligne par voix, son nom, puis un signe par section d'accords, x quand la voix joue, . quand elle se tait ; debut= et fin=, facultatifs, déplacent en tics chaque entrée et chaque sortie de la voix. « Voix » désigne la ligne qui gouverne le motif. Une note ne part qu'à un tic où sa voix joue, et elle n'est pas coupée quand la voix se tait. Sans matrice branchée, la voix joue tout le morceau et « Voix » est sans effet.\n\n« Transposition » décale toutes les notes, en demi-tons. « Vélocité » met à l'échelle la vélocité de chaque note. « Instrument » écrit le programme du canal dans le fichier.\n\nLa sortie « MIDI » porte les notes sur le canal 1, à la grille et au tempo de l'harmonie, le do central à 60.\n\nLe message donne le nombre de notes et de lignes, et la voix suivie.";

const NOTICE_EN = "Lays a pattern over the received harmony, entry after entry, from the start of the piece and in a loop. The model is that of the sequence engines of the SoundHelix generator by Thomas Schürger (version 0.9, 2016).\n\nA pattern is a series of entries separated by commas. An entry is written offset, then ~ to tie the note to the next one, /length in ticks, :velocity from 1 to 1000; without a length it lasts one tick, without a velocity it is 1000. - is a rest. On the chord, + is a passing note. E(pulses,steps,note,rest) writes a Euclidean rhythm; (x)*n repeats a group; (x)+d and (x)-d shift its offsets by d.\n\n« Pitches » says what an offset means. On the chord, 0, 1 and 2 are the bass, middle and top of the current chord, 3 the bass an octave up, -1 the top an octave down; each entry takes the chord of its first tick. Free, an offset is a pitch in semitones from middle C, and the harmony only gives the grid, the tempo and the length of the piece.\n\nThe passing note starts from the bass of the chord and goes toward the bass of the chord of the pattern's next note: a whole tone away, the semitone between them; a semitone away or at the unison, the bass itself; further, the first note of the C major scale past the bass, in the direction of the motion. When the next note falls outside the activity, the passing note is the bass.\n\n« Pattern » gives one pattern per line, each line played at the same time as the others; the « Pattern » input, when connected, replaces the setting. « Ticks per beat » is the resolution the pattern is written in, brought to the grid of the harmony.\n\n« Parallel voices » adds to each offset of the pattern each of the given values, one line per value: 0,1,2 on the chord gives the block chord.\n\n« Restart » sends the pattern back to its start at the end of the piece only, at the start of each section or of each chord; the entry that overruns a restart is shortened.\n\n« Root position » brings each chord to the root position its shape designates before reading the offsets on it; an augmented chord has none and stays as it is. No effect under « Free ».\n\nThe « Activity » input carries an activity matrix: one line per voice, its name, then one sign per chord section, x when the voice plays, . when it is silent; debut= and fin=, optional, move each entry and each exit of the voice, in ticks. « Voice » names the line that governs the pattern. A note only starts on a tick where its voice plays, and it is not cut when the voice falls silent. Without a matrix connected, the voice plays the whole piece and « Voice » has no effect.\n\n« Transpose » shifts all notes, in semitones. « Velocity » scales the velocity of each note. « Instrument » writes the channel's program into the file.\n\nThe « MIDI » output carries the notes on channel 1, at the grid and tempo of the harmony, middle C at 60.\n\nThe message gives the number of notes and lines, and the voice followed.";

export const fiches: FicheAudio[] = ([
  fiche({
    id: "voix-sur-accord", nom: "Voix sur l'accord", nomEn: "Voice on the Chord",
    univers: "Entrées", famille: "Génération",
    resume: "Pose un motif sur l'harmonie, note par note sur l'accord du moment ou en hauteurs libres, une ligne par motif.",
    resumeEn: "Lays a pattern over the harmony, note by note on the current chord or in free pitches, one line per pattern.",
    notice: NOTICE, noticeEn: NOTICE_EN,
    entrees: [
      { nom: "Harmonie", nomEn: "Harmony", type: "midi", sousType: "harmonie" },
      { nom: "Activité", nomEn: "Activity", type: "texte", sousType: "activite", requis: false },
      { nom: "Motif", nomEn: "Pattern", type: "texte", sousType: "motif", requis: false },
    ],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_PAR_DEFAUT, defautEn: MOTIF_PAR_DEFAUT,
        doc: "Un motif par ligne, dans la grammaire de SoundHelix : décalage[~][/durée en tics][:vélocité], - pour un silence, + pour une note de passage sur l'accord, E(), (x)*n, (x)+d. Sans effet quand l'entrée « Motif » est branchée.",
        docEn: "One pattern per line, in the SoundHelix grammar: offset[~][/length in ticks][:velocity], - for a rest, + for a passing note on the chord, E(), (x)*n, (x)+d. No effect when the « Pattern » input is connected." },
      { nom: "Voix", nomEn: "Voice", type: "texte", defaut: "v1", defautEn: "v1",
        doc: "Le nom de la ligne de la matrice d'activité qui gouverne le motif. Sans effet quand l'entrée « Activité » est libre.",
        docEn: "The name of the activity matrix line that governs the pattern. No effect when the « Activity » input is free." },
      { nom: "Voix parallèles", nomEn: "Parallel voices", type: "texte", defaut: "0", defautEn: "0",
        doc: "Des décalages séparés par des virgules, ajoutés chacun à tout le motif, une ligne par valeur. 0 joue le motif seul ; 0,1,2 sur l'accord rend l'accord plaqué.",
        docEn: "Offsets separated by commas, each added to the whole pattern, one line per value. 0 plays the pattern alone; 0,1,2 on the chord gives the block chord." },
      { nom: "Hauteurs", nomEn: "Pitches", type: "choix", options: ["Sur l'accord", "Libres"], optionsEn: ["On the chord", "Free"],
        optionIds: ["accord", "libres"], defaut: "Sur l'accord", defautEn: "On the chord",
        doc: "Sur l'accord : un décalage désigne une note de l'accord du moment, 0 la basse. Libres : un décalage est une hauteur en demi-tons depuis le do central, et + n'est plus permis.",
        docEn: "On the chord: an offset names a note of the current chord, 0 the bass. Free: an offset is a pitch in semitones from middle C, and + is no longer allowed." },
      { nom: "Reprise", nomEn: "Restart", type: "choix", options: ["Morceau", "Section", "Accord"], optionsEn: ["Piece", "Section", "Chord"],
        optionIds: ["morceau", "section", "accord"], defaut: "Morceau", defautEn: "Piece",
        doc: "Quand le motif revient à son début : à la fin du morceau seulement, au début de chaque section d'accords, ou de chaque accord. L'entrée qui déborde une reprise est raccourcie. Sur une harmonie sans marqueur de section, le morceau n'a qu'une section, et « Section » revient à « Morceau ».",
        docEn: "When the pattern goes back to its start: at the end of the piece only, at the start of each chord section, or of each chord. The entry that overruns a restart is shortened. Over a harmony without section markers, the piece has a single section, and « Section » amounts to « Piece »." },
      { nom: "Position fondamentale", nomEn: "Root position", type: "case", defaut: 1,
        doc: "Coché, chaque accord est ramené à sa position fondamentale avant d'y lire les décalages, et 0 est sa fondamentale. Décoché, 0 est la note la plus basse de l'accord reçu. Sans effet sous « Libres », et sur un accord qui n'a pas trois notes.",
        docEn: "Checked, each chord is brought to its root position before reading the offsets on it, and 0 is its root. Unchecked, 0 is the lowest note of the received chord. No effect under « Free », nor on a chord that does not have three notes." },
      { nom: "Transposition", nomEn: "Transpose", plage: [-48, 48], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st",
        doc: "Le décalage de toutes les notes, en demi-tons.",
        docEn: "The shift of all notes, in semitones." },
      { nom: "Vélocité", nomEn: "Velocity", plage: [1, 100], pas: 1, defaut: 100, unite: "%",
        doc: "La vélocité de chaque note, mise à l'échelle : à 50 %, une note écrite à 1000 joue à 500, sur 1000.",
        docEn: "The velocity of each note, scaled: at 50 %, a note written at 1000 plays at 500, out of 1000." },
      { nom: "Tics par temps", nomEn: "Ticks per beat", type: "choix", options: TICS_PAR_TEMPS, optionIds: TICS_PAR_TEMPS,
        optionsEn: TICS_PAR_TEMPS, defaut: "4",
        doc: "La résolution dans laquelle le motif est écrit, en tics par temps. Le motif est ramené à la grille de l'harmonie : écrit à 2 sur une harmonie à 4, chacun de ses tics en vaut deux.",
        docEn: "The resolution the pattern is written in, in ticks per beat. The pattern is brought to the grid of the harmony: written at 2 over a harmony at 4, each of its ticks is worth two." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const harmonieBrute = ctx.entree(0);
      if (!(harmonieBrute instanceof File)) {
        return { valeurs: [null], erreur: true, message: en ? "no harmony on the input" : "aucune harmonie en entrée" };
      }
      const activite = ctx.entree(1);
      const motifEntre = ctx.entree(2);
      try {
        const h = lireHarmonie(new Uint8Array(await harmonieBrute.arrayBuffer()));
        const libres = ctx.paramTexte("Hauteurs", "accord") === "libres";
        const source = typeof motifEntre === "string" ? motifEntre : ctx.paramTexte("Motif", MOTIF_PAR_DEFAUT);
        const textes = source.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
        if (textes.length === 0) {
          return { valeurs: [null], erreur: true, message: en ? "no pattern" : "aucun motif" };
        }
        const options = { jokers: libres ? "" : "+", velociteMax: VELOCITE_MAX, ticsParTemps: h.ticsParTemps,
          ticsParTempsMotif: Number(ctx.paramTexte("Tics par temps", "4")) || 4 };
        const motifs = textes.map((t) => lireMotif(t, options));
        const paralleles = ctx.paramTexte("Voix parallèles", "0").split(",").map((s) => s.trim()).filter((s) => s !== "").map(Number);
        if (paralleles.length === 0 || paralleles.some((p) => !Number.isInteger(p))) {
          return { valeurs: [null], erreur: true, message: en ? "unreadable parallel voices" : "voix parallèles illisibles" };
        }
        const nomVoix = ctx.paramTexte("Voix", "v1").trim();
        let segments: number[] | null = null;
        if (typeof activite === "string") {
          const v = lireActivite(activite).find((x) => x.nom === nomVoix);
          if (!v) {
            return { valeurs: [null], erreur: true,
              message: en ? `the matrix has no voice « ${nomVoix} »` : `la matrice n'a pas de voix « ${nomVoix} »` };
          }
          segments = segmentsDeVoix(v, h.sections, h.tics);
        }
        const reprise = ctx.paramTexte("Reprise", "morceau") as Reprise;
        const normaliser = ctx.paramNombre("Position fondamentale", 1) >= 0.5;
        const transposition = Math.round(ctx.paramNombre("Transposition", 0));
        const velocite = Math.round(ctx.paramNombre("Vélocité", 100) * 10);
        const notes = motifs.flatMap((motif) => paralleles.flatMap((parallele) =>
          appliquerPiste(rendreLigne({ harmonie: h, motif, segments, libres, normaliser, reprise, parallele }),
            transposition, velocite, VELOCITE_MAX)))
          .filter((e) => e.hauteur !== null)
          .map((e) => ({ tic: e.tic, tics: e.tics, hauteur: e.hauteur!, velocite: e.velocite }));
        const octets = morceauEnMidi(notes, { ticsParTemps: h.ticsParTemps, tics: h.tics, tempo: h.tempo, tempsParMesure: h.tempsParMesure });
        const fichier = await appliquerInstrumentMidi(new File([octets], "voix.mid", { type: "audio/midi" }),
          ctx.paramNombre("Instrument", 0));
        const lignes = motifs.length * paralleles.length;
        const message = en
          ? `${notes.length} notes · ${lignes} line${lignes > 1 ? "s" : ""}${segments ? ` · voice « ${nomVoix} »` : ""}`
          : `${notes.length} notes · ${lignes} ligne${lignes > 1 ? "s" : ""}${segments ? ` · voix « ${nomVoix} »` : ""}`;
        return { valeurs: [fichier], message };
      } catch (e) {
        if (e instanceof FauteAccord || e instanceof FauteMotif || e instanceof FauteActivite) {
          return { valeurs: [null], erreur: true, message: en ? e.en : e.message };
        }
        throw e;
      }
    },
  }),
] as FicheAudio[]).map(avecDoc);
