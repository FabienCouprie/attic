// plugins/sequenceurs.ts — Séquenceurs (motifs édités à la grille).

import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import { rendreSequenceurBatterie, decoderMotif } from "../audio";
import {
  rendreSequenceurMelodique, decoderMotifMelodique,
  NB_RANGEES_MELO, nomNotePourRangee,
} from "../audio";

// Motif par défaut (16 pas) : kick sur les temps, snare sur 2 et 4, charley en croches.
const MOTIF_DEFAUT = [
  "1000000010000000", // Kick
  "0000100000001000", // Snare
  "1010101010101010", // Charley fermé
  "0000000000000000", // Charley ouvert
  "0000000000000000", // Clap
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

export const fiches: PluginDef[] = ([
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
        doc: "Nombre de pas par mesure (résolution rythmique).", docEn: "Steps per bar (rhythmic resolution)." },
      { nom: "Swing", nomEn: "Swing", plage: [0, 60], defaut: 0, unite: "%",
        doc: "Décale légèrement les contretemps pour un groove ternaire.", docEn: "Slightly delays off-beats for a shuffle groove." },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de répétitions du motif.", docEn: "Number of pattern repetitions." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 90, unite: "%" },
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_DEFAUT,
        doc: "Motif encodé (édité par la grille du nœud) : 5 lignes de pas séparées par « | », chaque pas 1 (actif) ou 0.",
        docEn: "Encoded pattern (edited via the node grid): 5 step rows separated by « | », each step 1 (on) or 0." },
    ],
    async executer(ctx: any) {
      const tempo = ctx.paramNombre("Tempo", 120);
      const nbPas = parseInt(ctx.paramTexte("Nombre de pas", "16"), 10) || 16;
      const swing = ctx.paramNombre("Swing", 0);
      const mesures = ctx.paramNombre("Mesures", 2);
      const volume = ctx.paramNombre("Volume", 90);
      const grille = decoderMotif(ctx.paramTexte("Motif", MOTIF_DEFAUT), 5, nbPas);
      const buf = await rendreSequenceurBatterie(grille, tempo, nbPas, swing, mesures, volume);
      const frappes = grille.reduce((s: number, row: boolean[]) => s + row.filter(Boolean).length, 0);
      return { valeurs: [buf], message: `${nbPas} pas · ${mesures} mesure(s) · ${tempo} BPM · ${frappes} frappe(s)` };
    },
  },
  {
    id: "sequenceur-melodique", nom: "Séquenceur mélodique", nomEn: "Melodic Sequencer",
    univers: "Entrées", famille: "Génération",
    resume: "Programme une mélodie sur une grille piano-roll pas-à-pas (synthèse).",
    resumeEn: "Programs a melody on a step-by-step piano-roll grid (synthesized).",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], defaut: 120, unite: "BPM",
        doc: "Vitesse en battements par minute.", docEn: "Speed in beats per minute." },
      { nom: "Nombre de pas", nomEn: "Steps", type: "choix", options: ["8", "16", "32"], defaut: "16",
        doc: "Nombre de pas par mesure (résolution rythmique).", docEn: "Steps per bar (rhythmic resolution)." },
      { nom: "Swing", nomEn: "Swing", plage: [0, 60], defaut: 0, unite: "%",
        doc: "Décale légèrement les contretemps pour un groove ternaire.", docEn: "Slightly delays off-beats for a shuffle groove." },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de répétitions du motif.", docEn: "Number of pattern repetitions." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 85, unite: "%" },
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"], defaut: "C",
        doc: "Note fondamentale (tonique) de la gamme.", docEn: "Root note (tonic) of the scale." },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["majeur","mineur","pentatonique majeur","pentatonique mineur","blues"], defaut: "majeur",
        doc: "Gamme utilisée pour choisir les notes disponibles dans la grille.", docEn: "Scale used for the available notes in the grid." },
      { nom: "Octave", nomEn: "Octave", plage: [2, 6], pas: 1, defaut: 3,
        doc: "Octave de départ (les rangées montent d'environ 2 octaves au-dessus).", docEn: "Starting octave (rows span about 2 octaves above)." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: ["Triangle","Carré","Scie","Sinus"], optionsEn: ["Triangle","Square","Saw","Sine"], defaut: "Triangle",
        doc: "Forme d'onde de la synthèse. Triangle = doux ; Carré = 8-bit/retro ; Scie = riche/harmonique ; Sinus = pur.", docEn: "Synthesis waveform. Triangle = soft ; Square = 8-bit/retro ; Saw = rich/harmonic ; Sine = pure." },
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_MELO_DEFAUT,
        doc: "Motif encodé (édité par la grille du nœud) : 13 rangées (du grave au aigu) de pas séparées par « | ».",
        docEn: "Encoded pattern (edited via the node grid): 13 rows (low to high pitch) of steps separated by « | »." },
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
      const timbre = ctx.paramTexte("Timbre", "Triangle");
      const grille = decoderMotifMelodique(ctx.paramTexte("Motif", MOTIF_MELO_DEFAUT), NB_RANGEES_MELO, nbPas);
      const buf = await rendreSequenceurMelodique(grille, cle, gamme, octave, timbre, tempo, nbPas, swing, mesures, volume);
      const notes = grille.reduce((s: number, row: boolean[]) => s + row.filter(Boolean).length, 0);
      const noteBas = nomNotePourRangee(0, cle, gamme, octave);
      const noteHaut = nomNotePourRangee(NB_RANGEES_MELO - 1, cle, gamme, octave);
      return { valeurs: [buf], message: `${nbPas} pas · ${mesures} mesure(s) · ${tempo} BPM · ${notes} note(s) · ${noteBas}–${noteHaut}` };
    },
  },
] as PluginDef[]).map(avecDoc);
