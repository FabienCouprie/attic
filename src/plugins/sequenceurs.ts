// plugins/sequenceurs.ts — Séquenceurs (motifs édités à la grille).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { rendreSequenceurBatterie, decoderMotif, notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi } from "../audio";
import { creerAleatoire } from "../core";
import {
  rendreSequenceurMelodique, decoderMotifMelodique,
  NB_RANGEES_MELO, nomNotePourRangee,
  rendreSequenceurBatterieAvance, decoderMotifVelocite,
  rendreSequenceurAccords, decoderMotifAccords,
  GAMMES_ACCORDS,
} from "../audio";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, decoderInstrumentSF2 } from "./soundfontGlobal";

// Motif par défaut (16 pas) : kick sur les temps, snare sur 2 et 4, charley en croches.
const MOTIF_DEFAUT = [
  "1000000010000000", // Kick
  "0000100000001000", // Snare
  "1010101010101010", // Charley fermé
  "0000000000000000", // Charley ouvert
  "0000000000000000", // Clap
].join("|");

// Motif par défaut du séquenceur avancé (16 pas, 8 pistes) : kick temps, snare 2/4,
// charley fermé en croches, le reste muet.
const MOTIF_AVANCE_DEFAUT = [
  "9000000090000000", // Kick
  "0000900000009000", // Snare
  "9090909090909090", // Closed hi-hat
  "0000000000000000", // Open hi-hat
  "0000000000000000", // Clap
  "0000000000000000", // Crash
  "0000000000000000", // Low tom
  "0000000000000000", // High tom
].join("|");

// Motif mélodique par défaut (16 pas, 13 rangées du grave au aigu) :
// une petite phrase montante C–E–G–A puis redescente, sur la première mesure.
const MOTIF_MELO_DEFAUT = [
  "0000000000000000", // rangée 0 (grave)
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "1000000000000000", // C
  "0000000000000000",
  "0010000000100000", // E
  "0000000000000000", // rangée 12 (aigu)
].join("|");

// Motif d'accords par défaut (16 pas, 21 lignes = 7 degrés × triade/7e/6e) :
// I – V – vi – IV en triades sur la première mesure.
const MOTIF_ACCORDS_DEFAUT = [
  "1000000000000000", "0000000000000000", "0000000000000000", // I, I7, I6
  "0000000000000000", "0000000000000000", "0000000000000000", // II, II7, II6
  "0000000000000000", "0000000000000000", "0000000000000000", // III, III7, III6
  "0000000000001000", "0000000000000000", "0000000000000000", // IV, IV7, IV6
  "0000100000000000", "0000000000000000", "0000000000000000", // V, V7, V6
  "0000000010000000", "0000000000000000", "0000000000000000", // VI, VI7, VI6
  "0000000000000000", "0000000000000000", "0000000000000000", // VII, VII7, VII6
].join("|");

export const fiches: FicheAudio[] = ([
  {
    id: "sequenceur-batterie", nom: "Séquenceur de batterie", nomEn: "Drum Sequencer",
    univers: "Entrées", famille: "Génération",
    resume: "Programme un motif de batterie sur une grille pas-à-pas (synthèse).",
    resumeEn: "Programs a drum pattern on a step grid (synthesized).",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], defaut: 120, unite: "BPM" },
      { nom: "Nombre de pas", nomEn: "Steps", type: "choix", options: ["8", "16", "32"], defaut: "16",
        doc: "Nombre de pas par mesure (résolution rythmique).", docEn: "Steps per bar (rhythmic resolution).", optionsEn: ["8", "16", "32"], defautEn: "16" },
      { nom: "Swing", nomEn: "Swing", plage: [0, 60], defaut: 0, unite: "%",
        doc: "Décale légèrement les contretemps pour un groove ternaire.", docEn: "Slightly delays off-beats for a shuffle groove." },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de répétitions du motif.", docEn: "Number of pattern repetitions." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 90, unite: "%" },
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_DEFAUT,
        doc: "Motif encodé (édité par la grille du nœud) : 5 lignes de pas séparées par « | », chaque pas 1 (actif) ou 0.",
        docEn: "Encoded pattern (edited via the node grid): 5 step rows separated by « | », each step 1 (on) or 0." },
      { nom: "Graine", nomEn: "Seed", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Graine des rafales de bruit (caisse claire, charley). Valeur par défaut FIXE : le même motif doit rendre le même fichier à chaque exécution.",
        docEn: "Seed for the noise bursts (snare, hi-hat). The default is FIXED: the same pattern must render the same file on every run." },
    ],
    async executer(ctx: any) {
      const tempo = ctx.paramNombre("Tempo", 120);
      const nbPas = parseInt(ctx.paramTexte("Nombre de pas", "16"), 10) || 16;
      const swing = ctx.paramNombre("Swing", 0);
      const mesures = ctx.paramNombre("Mesures", 2);
      const volume = ctx.paramNombre("Volume", 90);
      const grille = decoderMotif(ctx.paramTexte("Motif", MOTIF_DEFAUT), 5, nbPas);
      const buf = await rendreSequenceurBatterie(grille, tempo, nbPas, swing, mesures, volume,
        creerAleatoire(ctx.paramNombre("Graine", 42)));
      const frappes = grille.reduce((s: number, row: boolean[]) => s + row.filter(Boolean).length, 0);
      return { valeurs: [buf], message: traduire("msg.var_0_pas_var_1_mesure_s_var_2_bpm_var_3_frappe_s", nbPas, mesures, tempo, frappes) };
    },
  },
  {
    id: "sequenceur-melodique", nom: "Séquenceur mélodique", nomEn: "Melodic Sequencer",
    univers: "Entrées", famille: "Génération",
    resume: "Programme une mélodie sur une grille piano-roll pas-à-pas (synthèse).",
    resumeEn: "Programs a melody on a step-by-step piano-roll grid (synthesized).",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], defaut: 120, unite: "BPM",
        doc: "Vitesse en battements par minute.", docEn: "Speed in beats per minute." },
      { nom: "Nombre de pas", nomEn: "Steps", type: "choix", options: ["8", "16", "32"], defaut: "16",
        doc: "Nombre de pas par mesure (résolution rythmique).", docEn: "Steps per bar (rhythmic resolution).", optionsEn: ["8", "16", "32"], defautEn: "16" },
      { nom: "Swing", nomEn: "Swing", plage: [0, 60], defaut: 0, unite: "%",
        doc: "Décale légèrement les contretemps pour un groove ternaire.", docEn: "Slightly delays off-beats for a shuffle groove." },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de répétitions du motif.", docEn: "Number of pattern repetitions." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 85, unite: "%" },
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"], defaut: "C",
        doc: "Note fondamentale (tonique) de la gamme.", docEn: "Root note (tonic) of the scale.", optionsEn: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["majeur","mineur","pentatonique majeur","pentatonique mineur","blues"], defaut: "majeur",
        optionIds: ["majeur","mineur","pentatonique majeur","pentatonique mineur","blues"],
        doc: "Gamme utilisée pour choisir les notes disponibles dans la grille.", docEn: "Scale used for the available notes in the grid.", optionsEn: ["major", "minor", "major pentatonic", "minor pentatonic", "blues"], defautEn: "major" },
      { nom: "Octave", nomEn: "Octave", plage: [2, 6], pas: 1, defaut: 3,
        doc: "Octave de départ (les rangées montent d'environ 2 octaves au-dessus).", docEn: "Starting octave (rows span about 2 octaves above)." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: ["Triangle","Carré","Scie","Sinus"], optionIds: ["triangle","square","sawtooth","sine"], optionsEn: ["Triangle","Square","Saw","Sine"], defaut: "Triangle",
        doc: "Forme d'onde de la synthèse. Triangle = doux ; Carré = 8-bit/retro ; Scie = riche/harmonique ; Sinus = pur.", docEn: "Synthesis waveform. Triangle = soft ; Square = 8-bit/retro ; Saw = rich/harmonic ; Sine = pure.", defautEn: "Triangle" },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_MELO_DEFAUT,
        doc: "Motif encodé (édité par la grille du nœud) : 13 rangées (du grave au aigu) de pas séparées par « | ».",
        docEn: "Encoded pattern (edited via the node grid): 13 rows (low to high pitch) of steps separated by « | »." },
    ],
    async executer(ctx: any) {
      console.log("[attic] Séquenceur mélodique : exécution démarrée");
      const tempo = ctx.paramNombre("Tempo", 120);
      const nbPas = parseInt(ctx.paramTexte("Nombre de pas", "16"), 10) || 16;
      const swing = ctx.paramNombre("Swing", 0);
      const mesures = ctx.paramNombre("Mesures", 2);
      const volume = ctx.paramNombre("Volume", 85);
      const cle = ctx.paramTexte("Clé", "C");
      const gamme = ctx.paramTexte("Gamme", "majeur");
      const octave = ctx.paramNombre("Octave", 3);
      const timbre = ctx.paramTexte("Timbre", "Triangle");
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const grille = decoderMotifMelodique(ctx.paramTexte("Motif", MOTIF_MELO_DEFAUT), NB_RANGEES_MELO, nbPas);
      const { audio, notes } = await rendreSequenceurMelodique(grille, cle, gamme, octave, timbre, tempo, nbPas, swing, mesures, volume);
      const noteCount = grille.reduce((s: number, row: boolean[]) => s + row.filter(Boolean).length, 0);
      const noteBas = nomNotePourRangee(0, cle, gamme, octave);
      const noteHaut = nomNotePourRangee(NB_RANGEES_MELO - 1, cle, gamme, octave);
      const midiFile = notesVersFichierMidi(notes, tempo);
      const useSf2 = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee());
      console.log(`[attic] Séquenceur mélodique : mode=${mode}, useSf2=${useSf2}, sf2Chargee=${!!sf2Chargee()}, instrument=${instrument}, banque=${banque}, notes=${notes.length}`);
      const audioFinal = useSf2
        ? await rendreSequence(notes, "SoundFont", volume, instrument, banque)
        : audio;
      const midiFinal = await appliquerInstrumentMidi(midiFile, ctx.paramNombre("Instrument", 0));
      console.log(`[attic] Séquenceur mélodique : audioFinal durée=${audioFinal?.duration ?? 0}`);
      return { valeurs: [audioFinal, midiFinal], message: traduire("msg.var_0_pas_var_1_mesure_s_var_2_bpm_var_3_note_s_var_4_var_5", nbPas, mesures, tempo, noteCount, noteBas, noteHaut) };
    },
  },
  {
    id: "sequenceur-accords", nom: "Séquenceur d'accords", nomEn: "Chord Sequencer",
    univers: "Entrées", famille: "Génération",
    resume: "Programme une progression d'accords sur une grille pas-à-pas.",
    resumeEn: "Programs a chord progression on a step grid.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], defaut: 120, unite: "BPM",
        doc: "Vitesse en battements par minute.", docEn: "Speed in beats per minute." },
      { nom: "Nombre de pas", nomEn: "Steps", type: "choix", options: ["8", "16", "32"], defaut: "16",
        doc: "Nombre de pas par mesure (résolution rythmique).", docEn: "Steps per bar (rhythmic resolution).", optionsEn: ["8", "16", "32"], defautEn: "16" },
      { nom: "Swing", nomEn: "Swing", plage: [0, 60], defaut: 0, unite: "%",
        doc: "Décale légèrement les contretemps pour un groove ternaire.", docEn: "Slightly delays off-beats for a shuffle groove." },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de répétitions du motif.", docEn: "Number of pattern repetitions." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 85, unite: "%" },
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"], defaut: "C",
        doc: "Note fondamentale (tonique) de la gamme.", docEn: "Root note (tonic) of the scale.", optionsEn: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_ACCORDS.map((g) => g.fr), defaut: "majeur",
        optionIds: GAMMES_ACCORDS.map((g) => g.id),
        doc: "Gamme diatonique utilisée pour construire les accords sur les 7 degrés.",
        docEn: "Diatonic scale used to build chords on the 7 degrees.",
        optionsEn: GAMMES_ACCORDS.map((g) => g.en), defautEn: "Major" },
      { nom: "Octave", nomEn: "Octave", plage: [2, 6], pas: 1, defaut: 3,
        doc: "Octave de la fondamentale des accords.", docEn: "Octave of the chord roots." },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Harmonie", "Arpège"], defaut: "Harmonie",
        optionIds: ["harmonie", "arpege"],
        doc: "Harmonie = accord joué en bloc ; Arpège = notes décalées rapidement.", docEn: "Harmony = chord played as a block ; Arpeggio = notes quickly staggered.",
        optionsEn: ["Harmony", "Arpeggio"], defautEn: "Harmony" },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_ACCORDS_DEFAUT,
        doc: "Motif encodé (édité par la grille du nœud) : 21 rangées (7 degrés × triade/7e/6e) de pas séparées par « | ». Cliquez une case pour choisir l'accord (ex. C, Cmaj7, C6) à ce pas.",
        docEn: "Encoded pattern (edited via the node grid): 21 rows (7 degrees × triad/7th/6th) of steps separated by « | ». Click a cell to choose the chord (e.g. C, Cmaj7, C6) at that step." },
    ],
    async executer(ctx: any) {
      const tempo = ctx.paramNombre("Tempo", 120);
      const nbPas = parseInt(ctx.paramTexte("Nombre de pas", "16"), 10) || 16;
      const swing = ctx.paramNombre("Swing", 0);
      const mesures = ctx.paramNombre("Mesures", 2);
      const volume = ctx.paramNombre("Volume", 85);
      const cle = ctx.paramTexte("Clé", "C");
      const gamme = ctx.paramTexte("Gamme", "majeur");
      const octave = ctx.paramNombre("Octave", 3);
      const mode = ctx.paramTexte("Mode", "harmonie") as "harmonie" | "arpege";
      const modeSynth = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const grille = decoderMotifAccords(ctx.paramTexte("Motif", MOTIF_ACCORDS_DEFAUT), nbPas);
      const useSf2 = modeSynth === "SoundFont" || (modeSynth === "Automatique" && sf2Chargee());
      const modeAudio = useSf2 ? "SoundFont" : "FM/Oscillateurs";
      console.log(`[attic] Séquenceur d'accords : mode=${modeSynth}, useSf2=${useSf2}, sf2Chargee=${!!sf2Chargee()}, instrument=${instrument}, banque=${banque}, grille=${grille.length}x${grille[0]?.length ?? 0}`);
      const { audio, notes } = await rendreSequenceurAccords(grille, cle, gamme, mode, tempo, nbPas, swing, mesures, volume, octave, modeAudio, instrument, banque);
      const midiFile = notesVersFichierMidi(notes, tempo);
      const midiFinal = await appliquerInstrumentMidi(midiFile, ctx.paramNombre("Instrument", 0));
      const accordCount = grille[0].map((_, c) => grille.some((row) => row[c])).filter(Boolean).length;
      return { valeurs: [audio, midiFinal], message: traduire("msg.var_0_pas_var_1_mesure_s_var_2_bpm_var_3_accord_s", nbPas, mesures, tempo, accordCount) };
    },
  },
  {
    id: "sequenceur-batterie-avance", nom: "Séquenceur de batterie avancé", nomEn: "Advanced Drum Sequencer",
    univers: "Entrées", famille: "Génération",
    resume: "Programme un motif de batterie sur 8 pistes avec velocity par pas (synthèse).",
    resumeEn: "Programs an 8-track drum pattern with per-step velocity (synthesized).",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], defaut: 120, unite: "BPM" },
      { nom: "Nombre de pas", nomEn: "Steps", type: "choix", options: ["16", "32"], defaut: "16",
        doc: "Nombre de pas par mesure.", docEn: "Steps per bar.", optionsEn: ["16", "32"], defautEn: "16" },
      { nom: "Swing", nomEn: "Swing", plage: [0, 60], defaut: 0, unite: "%",
        doc: "Décale les contretemps pour un groove ternaire.", docEn: "Delays off-beats for a shuffle groove." },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de répétitions du motif.", docEn: "Number of pattern repetitions." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 90, unite: "%" },
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_AVANCE_DEFAUT,
        doc: "Motif encodé (édité par la grille) : 8 lignes de pas séparées par « | », chaque pas 0 (off) ou 1–9 (velocity).",
        docEn: "Encoded pattern (edited via the grid): 8 step rows separated by « | », each step 0 (off) or 1–9 (velocity)." },
      { nom: "Graine", nomEn: "Seed", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Graine des rafales de bruit (caisse claire, charley). Valeur par défaut FIXE : le même motif doit rendre le même fichier à chaque exécution.",
        docEn: "Seed for the noise bursts (snare, hi-hat). The default is FIXED: the same pattern must render the same file on every run." },
    ],
    async executer(ctx: any) {
      const tempo = ctx.paramNombre("Tempo", 120);
      const nbPas = parseInt(ctx.paramTexte("Nombre de pas", "16"), 10) || 16;
      const swing = ctx.paramNombre("Swing", 0);
      const mesures = ctx.paramNombre("Mesures", 2);
      const volume = ctx.paramNombre("Volume", 90);
      const grille = decoderMotifVelocite(ctx.paramTexte("Motif", MOTIF_AVANCE_DEFAUT), 8, nbPas);
      const buf = await rendreSequenceurBatterieAvance(grille, tempo, nbPas, swing, mesures, volume,
        creerAleatoire(ctx.paramNombre("Graine", 42)));
      const frappes = grille.reduce((s: number, row: number[]) => s + row.filter((v) => v > 0).length, 0);
      return { valeurs: [buf], message: traduire("msg.var_0_pas_var_1_mesure_s_var_2_bpm_var_3_frappe_s", nbPas, mesures, tempo, frappes) };
    },
  },
] as FicheAudio[]).map(avecDoc);
