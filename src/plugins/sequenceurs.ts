// plugins/sequenceurs.ts — Séquenceurs (motifs édités à la grille).

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi } from "../audio";
import { CANAL_PERCUSSION, frappesDeGrilleVelocite, notesDepuisFrappes } from "../audio/batterie-midi";
import { creerAleatoire } from "../core";
import {
  rendreSequenceurMelodique, decoderMotifMelodique,
  NB_RANGEES_MELO, nomNotePourRangee,
  rendreSequenceurBatterieAvance, decoderMotifVelocite,
  rendreSequenceurAccords, decoderMotifAccords, NB_LIGNES_ACCORDS,
  GAMMES_ACCORDS,
} from "../audio";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, decoderInstrumentSF2 } from "./soundfontGlobal";
import { PARAMETRE_CLE } from "../audio/cles";
import { FORMES_ONDE_CHOIX, LIBELLES_HERITES_FORMES } from "../audio/timbres";
import { LIBELLES_HERITES_GAMMES, completer } from "../audio/gammes";
import { choixFaconAccord, faconDe } from "../audio/facons-accord";

/**
 * LA PREMIÈRE CASE QUE LA GRILLE N'ÉCRIT PAS, comptée depuis 1. La grille écrit une case par pas et
 * sépare ses rangées par « | » : une espace y prenait une case et décalait la suite, et un caractère
 * étranger s'y lisait comme un silence. Décision de Fabien du 2026-11-22, « Refuse it, named », revue
 * des notations en texte. Une rangée plus courte ou plus longue que le nombre de pas se complète ou se
 * coupe toujours, au décodage : « Nombre de pas » passe de 16 à 32 sans réécrire le motif.
 *
 * UNE RANGÉE DE TROP EST REFUSÉE AUSSI : douze rangées sur les huit voix de la batterie en perdaient
 * quatre, sans un mot. Décision de Fabien du 2026-11-22, « Refuse it, named ». Une rangée qui manque
 * reste une rangée vide, ce que la grille écrit d'elle-même.
 */
function refusDeGrille(motif: string, cases: RegExp, cle: string, nbRangees: number) {
  const rangees = motif.split("|");
  if (rangees.length > nbRangees) {
    return { valeurs: [null, null], erreur: true, message: traduire("msg.sequenceur.trop_de_rangees_var_0_var_1", rangees.length, nbRangees) };
  }
  for (let r = 0; r < rangees.length; r++) {
    const pas = [...rangees[r]];
    const c = pas.findIndex((x) => !cases.test(x));
    // Une espace se montre « ␣ » : écrite telle quelle, elle ne se verrait pas entre ses guillemets.
    if (c >= 0) return { valeurs: [null, null], erreur: true, message: traduire(cle, /\s/.test(pas[c]) ? "␣" : pas[c], r + 1, c + 1) };
  }
  return null;
}

// LA LISTE VIENT DE LA TABLE, DANS L'ORDRE QUI ÉTAIT LE SIEN. Ses identifiants étaient
// « pentatonique majeur » et « pentatonique mineur », sans accord et avec une espace : des ALIAS,
// donc les degrés étaient justes, mais un projet enregistrait une orthographe que le reste du parc
// n'écrit pas. L'ordre ne bouge pas, puisqu'un projet ancien se résout par la position.
//
// ELLE EST LA TABLE ENTIÈRE DES GAMMES TEMPÉRÉES depuis le 2026-11-14, décision de Fabien, l'ordre
// d'origine d'abord : chaque rangée de la grille est un degré, et rien ne bornait la grille à cinq.
const GAMMES_SEQUENCEUR = completer([
  "majeur", "mineur", "pentatonique-majeure", "pentatonique-mineure", "blues",
]);

// Motif par défaut du séquenceur avancé (16 pas, 8 pistes) : kick temps, snare 2/4,
// charley fermé en croches, le reste muet.
/** Les voix de la batterie avancée, une rangée chacune : grosse caisse, caisse claire, charleys, clap, crash, toms. */
const RANGEES_BATTERIE = 8;

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
  fiche({
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
      { ...PARAMETRE_CLE,
        doc: "Note fondamentale (tonique) de la gamme.", docEn: "Root note (tonic) of the scale." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_SEQUENCEUR.map((g) => g.fr), optionIds: GAMMES_SEQUENCEUR.map((g) => g.id),
        optionsEn: GAMMES_SEQUENCEUR.map((g) => g.en), optionsHeritees: LIBELLES_HERITES_GAMMES,
        defaut: "Majeur", defautEn: "Major",
        doc: "Gamme utilisée pour choisir les notes disponibles dans la grille.", docEn: "Scale used for the available notes in the grid." },
      { nom: "Octave", nomEn: "Octave", plage: [2, 6], pas: 1, defaut: 3,
        doc: "Octave de départ (les rangées montent d'environ 2 octaves au-dessus).", docEn: "Starting octave (rows span about 2 octaves above)." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: FORMES_ONDE_CHOIX.fr, optionIds: FORMES_ONDE_CHOIX.ids, optionsEn: FORMES_ONDE_CHOIX.en, optionsHeritees: LIBELLES_HERITES_FORMES, defaut: "Triangle",
        doc: "Forme d'onde de la synthèse. Sinus = pur ; Carré = 8-bit/retro ; Dent de scie = riche en harmoniques ; Triangle = doux.", docEn: "Synthesis waveform. Sine = pure ; Square = 8-bit/retro ; Sawtooth = rich in harmonics ; Triangle = soft.", defautEn: "Triangle" },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_MELO_DEFAUT,
        doc: "Motif encodé (édité par la grille du composant) : 13 rangées (du grave au aigu) de pas séparées par « | », chaque pas 0 ou 1. Un caractère que la grille n'écrit pas, une espace comprise, fait refuser le motif, et le message le nomme. Une rangée plus courte que le nombre de pas se complète de silences, et une plus longue se coupe. Un motif qui porte plus de rangées que le séquenceur n'en joue est refusé, et le message dit combien ; une rangée qui manque est muette.",
        docEn: "Encoded pattern (edited via the node grid): 13 rows (low to high pitch) of steps separated by « | », each step 0 or 1. A character the grid does not write, a space included, makes the pattern refused, and the message names it. A row shorter than the number of steps is filled with rests, and a longer one is cut. A pattern with more rows than the sequencer plays is refused, and the message says how many; a missing row is silent." },
    ],
    async executer(ctx) {
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
      const motif = ctx.paramTexte("Motif", MOTIF_MELO_DEFAUT);
      const refus = refusDeGrille(motif, /^[01]$/, "msg.sequenceur.case_binaire_var_0_var_1_var_2", NB_RANGEES_MELO);
      if (refus) return refus;
      const grille = decoderMotifMelodique(motif, NB_RANGEES_MELO, nbPas);
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
  }),
  fiche({
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
      { ...PARAMETRE_CLE,
        doc: "Note fondamentale (tonique) de la gamme.", docEn: "Root note (tonic) of the scale." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_ACCORDS.map((g) => g.fr), defaut: "majeur",
        optionIds: GAMMES_ACCORDS.map((g) => g.id),
        doc: "Gamme diatonique utilisée pour construire les accords sur les 7 degrés. La bebop dominante y bâtit les accords du mixolydien : sa septième majeure est une note de passage, qu'aucun accord ne prend. Chaque accord se bâtit un degré sur deux dans la gamme : sa fondamentale, le troisième degré au-dessus et le cinquième, et son nom suit ce qu'il joue. Sur une gamme qui n'a pas sept degrés, ce ne sont pas toujours des triades usuelles : do, mi, la sur la pentatonique majeure, do, ré, mi sur la chromatique, et le nom porte alors ses intervalles entre parenthèses.",
        docEn: "Diatonic scale used to build chords on the 7 degrees. The bebop dominant builds the mixolydian's chords here: its major seventh is a passing note, which no chord takes. Each chord is built one degree out of two within the scale: its root, the third degree above and the fifth, and its name follows what it plays. On a scale without seven degrees, these are not always the usual triads: C, E, A on the major pentatonic, C, D, E on the chromatic, and the name then carries its intervals in parentheses.",
        optionsEn: GAMMES_ACCORDS.map((g) => g.en), defautEn: "Major" },
      { nom: "Octave", nomEn: "Octave", plage: [2, 6], pas: 1, defaut: 3,
        doc: "Octave de la fondamentale des accords.", docEn: "Octave of the chord roots." },
      { nom: "Mode", nomEn: "Mode", type: "choix", ...choixFaconAccord(), defaut: "Plaqué",
        doc: "Plaqué = accord joué en bloc ; Arpégé = notes réparties sur le pas, chacune relâchée quand la suivante part ; Roulé = départs décalés rapidement, toutes les notes tenues.",
        docEn: "Block = chord played as a block; Arpeggiated = notes spread over the step, each released when the next starts; Rolled = onsets quickly staggered, all notes held.",
        defautEn: "Block" },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_ACCORDS_DEFAUT,
        doc: "Motif encodé (édité par la grille du composant) : 21 rangées (7 degrés × triade/7e/6e) de pas séparées par « | », chaque pas 0 ou 1. Cliquez une case pour choisir l'accord (ex. C, Cmaj7, C6) à ce pas. Un caractère que la grille n'écrit pas, une espace comprise, fait refuser le motif, et le message le nomme. Une rangée plus courte que le nombre de pas se complète de silences, et une plus longue se coupe. Un motif qui porte plus de rangées que le séquenceur n'en joue est refusé, et le message dit combien ; une rangée qui manque est muette.",
        docEn: "Encoded pattern (edited via the node grid): 21 rows (7 degrees × triad/7th/6th) of steps separated by « | », each step 0 or 1. Click a cell to choose the chord (e.g. C, Cmaj7, C6) at that step. A character the grid does not write, a space included, makes the pattern refused, and the message names it. A row shorter than the number of steps is filled with rests, and a longer one is cut. A pattern with more rows than the sequencer plays is refused, and the message says how many; a missing row is silent." },
    ],
    async executer(ctx) {
      const tempo = ctx.paramNombre("Tempo", 120);
      const nbPas = parseInt(ctx.paramTexte("Nombre de pas", "16"), 10) || 16;
      const swing = ctx.paramNombre("Swing", 0);
      const mesures = ctx.paramNombre("Mesures", 2);
      const volume = ctx.paramNombre("Volume", 85);
      const cle = ctx.paramTexte("Clé", "C");
      const gamme = ctx.paramTexte("Gamme", "majeur");
      const octave = ctx.paramNombre("Octave", 3);
      const facon = faconDe(ctx.paramTexte("Mode", "plaque"));
      const mode: "harmonie" | "arpege" | "roule" = facon === "arpege" || facon === "roule" ? facon : "harmonie";
      const modeSynth = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const motif = ctx.paramTexte("Motif", MOTIF_ACCORDS_DEFAUT);
      const refus = refusDeGrille(motif, /^[01]$/, "msg.sequenceur.case_binaire_var_0_var_1_var_2", NB_LIGNES_ACCORDS);
      if (refus) return refus;
      const grille = decoderMotifAccords(motif, nbPas);
      const useSf2 = modeSynth === "SoundFont" || (modeSynth === "Automatique" && sf2Chargee());
      const modeAudio = useSf2 ? "SoundFont" : "FM/Oscillateurs";
      console.log(`[attic] Séquenceur d'accords : mode=${modeSynth}, useSf2=${useSf2}, sf2Chargee=${!!sf2Chargee()}, instrument=${instrument}, banque=${banque}, grille=${grille.length}x${grille[0]?.length ?? 0}`);
      const { audio, notes } = await rendreSequenceurAccords(grille, cle, gamme, mode, tempo, nbPas, swing, mesures, volume, octave, modeAudio, instrument, banque);
      const midiFile = notesVersFichierMidi(notes, tempo);
      const midiFinal = await appliquerInstrumentMidi(midiFile, ctx.paramNombre("Instrument", 0));
      const accordCount = grille[0].map((_, c) => grille.some((row) => row[c])).filter(Boolean).length;
      return { valeurs: [audio, midiFinal], message: traduire("msg.var_0_pas_var_1_mesure_s_var_2_bpm_var_3_accord_s", nbPas, mesures, tempo, accordCount) };
    },
  }),
  fiche({
    id: "sequenceur-batterie-avance", nom: "Séquenceur de batterie avancé", nomEn: "Advanced Drum Sequencer",
    univers: "Entrées", famille: "Génération",
    resume: "Programme un motif de batterie sur 8 pistes avec velocity par pas, et sort le rythme en MIDI pour pouvoir changer les sons dessous.",
    resumeEn: "Programs an 8-track drum pattern with per-step velocity, and outputs the rhythm as MIDI so the sounds underneath can be changed.",
    entrees: [],
    // La sortie MIDI est AJOUTÉE À LA FIN : les identifiants des prises sont des rangs (« out:0 »),
    // et l'insérer avant aurait déplacé les branchements de tous les graphes déjà enregistrés.
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], defaut: 120, unite: "BPM" },
      // Huit pas viennent de l'ancien séquenceur binaire, supprimé : sa résolution la plus grossière
      // est reprise ici, faute de quoi le retirer aurait retiré une possibilité — et un graphe
      // enregistré réglé sur huit pas aurait affiché « 16 » dans l'inspecteur tout en jouant huit.
      { nom: "Nombre de pas", nomEn: "Steps", type: "choix", options: ["8", "16", "32"], defaut: "16",
        doc: "Nombre de pas par mesure.", docEn: "Steps per bar.", optionsEn: ["8", "16", "32"], defautEn: "16" },
      { nom: "Swing", nomEn: "Swing", plage: [0, 60], defaut: 0, unite: "%",
        doc: "Décale les contretemps pour un groove ternaire.", docEn: "Delays off-beats for a shuffle groove." },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de répétitions du motif.", docEn: "Number of pattern repetitions." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 90, unite: "%" },
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_AVANCE_DEFAUT,
        doc: "Motif encodé (édité par la grille) : 8 lignes de pas séparées par « | », chaque pas 0 (silence) ou de 1 à 9 (vélocité). Un caractère que la grille n'écrit pas, une espace comprise, fait refuser le motif, et le message le nomme. Une rangée plus courte que le nombre de pas se complète de silences, et une plus longue se coupe. Un motif qui porte plus de rangées que le séquenceur n'en joue est refusé, et le message dit combien ; une rangée qui manque est muette.",
        docEn: "Encoded pattern (edited via the grid): 8 step rows separated by « | », each step 0 (off) or 1 to 9 (velocity). A character the grid does not write, a space included, makes the pattern refused, and the message names it. A row shorter than the number of steps is filled with rests, and a longer one is cut. A pattern with more rows than the sequencer plays is refused, and the message says how many; a missing row is silent." },
      { nom: "Graine", graine: true, nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 42,
        doc: "Graine des rafales de bruit (caisse claire, charley). Valeur par défaut fixe : le même motif doit rendre le même fichier à chaque exécution.",
        docEn: "Seed for the noise bursts (snare, hi-hat). The default is fixed: the same pattern must render the same file on every run." },
    ],
    async executer(ctx) {
      const tempo = ctx.paramNombre("Tempo", 120);
      const nbPas = parseInt(ctx.paramTexte("Nombre de pas", "16"), 10) || 16;
      const swing = ctx.paramNombre("Swing", 0);
      const mesures = ctx.paramNombre("Mesures", 2);
      const volume = ctx.paramNombre("Volume", 90);
      const motif = ctx.paramTexte("Motif", MOTIF_AVANCE_DEFAUT);
      const refus = refusDeGrille(motif, /^[0-9]$/, "msg.sequenceur.case_velocite_var_0_var_1_var_2", RANGEES_BATTERIE);
      if (refus) return refus;
      const grille = decoderMotifVelocite(motif, RANGEES_BATTERIE, nbPas);
      const buf = await rendreSequenceurBatterieAvance(grille, tempo, nbPas, swing, mesures, volume,
        creerAleatoire(ctx.paramNombre("Graine", 42)));
      // LE MÊME RYTHME, EN MIDI : c'est ce qui permet de changer les sons dessous — kit SFZ,
      // SoundFont, orchestre Csound, modèle physique. Les instants viennent de la même formule que le
      // rendu, SWING COMPRIS, faute de quoi le groove disparaîtrait au changement de sons : même
      // rythme sur le papier, autre musique à l'oreille, et rien pour le signaler.
      const notesMidi = notesDepuisFrappes(frappesDeGrilleVelocite(grille, nbPas, mesures), {
        tempo, pasParMesure: nbPas, mesures, swing,
      });
      const midi = notesMidi.length > 0 ? notesVersFichierMidi(notesMidi, tempo, CANAL_PERCUSSION) : null;
      const frappes = grille.reduce((s: number, row: number[]) => s + row.filter((v) => v > 0).length, 0);
      return {
        valeurs: [buf, midi],
        message: traduire("msg.var_0_pas_var_1_mesure_s_var_2_bpm_var_3_frappe_s", nbPas, mesures, tempo, frappes)
          + ` · ${traduire("msg.batterie.midi", String(notesMidi.length))}`,
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);
