// plugins/color-looper.ts — Nœud « Color Looper ».
// Séquenceur où chaque pas est une couleur. La liste de couleurs détermine le
// motif : teinte → note, saturation → vélocité, luminosité → octave.

import type { FicheAudio } from "../audio/types-domaine";
import { genererColorLooper, parseCouleurs, GAMMES_ACCORDS } from "../audio";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "color-looper",
    nom: "Color Looper",
    nomEn: "Color Looper",
    univers: "Autres",
    famille: "Génération",
    resume: "Séquenceur pas-à-pas dont chaque pas est une couleur.",
    resumeEn: "Step sequencer where each step is a color.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
    ],
    parametres: [
      { nom: "Couleurs", nomEn: "Colors", type: "couleurs", defaut: "#e63946,#2a9d8f,#e9c46a,#8e6fce",
        doc: "Palette de couleurs. Chaque couleur = un pas du séquenceur.",
        docEn: "Color palette. Each color = one step of the sequencer." },
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], defaut: "C",
        optionsEn: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], defautEn: "C",
        doc: "Fondamentale de la gamme.", docEn: "Root note of the scale." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["majeur", "mineur", "dorien", "phrygien", "lydien", "mixolydien", "locrien", "pentatonique majeur", "pentatonique mineur", "blues", "chromatique"], defaut: "majeur",
        optionsEn: ["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "major pentatonic", "minor pentatonic", "blues", "chromatonic"], defautEn: "major",
        optionIds: GAMMES_ACCORDS.map((g) => g.id),
        doc: "Gamme utilisée (7 modes + 2 gammes pentatoniques, en plus de blues et chromatique).",
        docEn: "Scale used (7 modes + 2 pentatonic scales, in addition to blues and chromatic)." },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Mélodie", "Harmonie", "Arpèges"], optionIds: ["melodie","harmonie","arpeges"], optionsEn: ["Melody", "Harmony", "Arpeggios"], defaut: "Mélodie", defautEn: "Melody",
        doc: "Mélodie = une note par pas ; Harmonie = accord triadique par pas ; Arpèges = notes de l'accord en succession rapide.", docEn: "Melody = one note per step; Harmony = triad chord per step; Arpeggios = chord notes played in quick succession." },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [2, 6], pas: 1, defaut: 4,
        doc: "Octave de base.", docEn: "Base octave." },
      { nom: "Portée", nomEn: "Range", type: "nombre", plage: [1, 3], pas: 1, defaut: 2,
        doc: "Octaves de variation permises par la luminosité.", docEn: "Allowed octave variation from lightness." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], defaut: 120, unite: "BPM",
        doc: "Vitesse du séquenceur.", docEn: "Sequencer speed." },
      { nom: "Durée note", nomEn: "Note duration", type: "nombre", plage: [0.05, 2], pas: 0.05, defaut: 0.5,
        doc: "Durée de chaque note en fraction de temps (1 = temps entier, 0.5 = croche, 0.25 = double-croche).", docEn: "Duration of each note as a fraction of a beat (1 = quarter, 0.5 = eighth, 0.25 = sixteenth)." },
      { nom: "Mesures", nomEn: "Bars", type: "nombre", plage: [1, 16], pas: 1, defaut: 2,
        doc: "Nombre de répétitions du motif de couleurs.", docEn: "Number of repetitions of the color pattern." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const modeTexte = ctx.paramTexte("Mode", "Mélodie").toLowerCase();
      const mode = modeTexte.includes("arp") ? "arpeges" : modeTexte.includes("harm") ? "harmonie" : "melodie";
      const modeRenduBrut = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu = modeRenduBrut === "Automatique" ? (sf2Chargee() ? "SoundFont" : "FM/Oscillateurs") : modeRenduBrut;
      const { audio, midi, notes } = await genererColorLooper({
        couleurs: ctx.paramTexte("Couleurs", "#e63946,#2a9d8f,#e9c46a,#8e6fce"),
        cle: ctx.paramTexte("Clé", "C"),
        gamme: ctx.paramTexte("Gamme", "majeur"),
        mode,
        octave: ctx.paramNombre("Octave", 4),
        portee: ctx.paramNombre("Portée", 2),
        tempo: ctx.paramNombre("Tempo", 120),
        dureeNote: ctx.paramNombre("Durée note", 0.5),
        mesures: ctx.paramNombre("Mesures", 2),
        modeRendu,
        instrument: ctx.paramNombre("Instrument", 0),
        volume: ctx.paramNombre("Volume", 80),
      });
      const nbCouleurs = parseCouleurs(ctx.paramTexte("Couleurs", "#e63946,#2a9d8f,#e9c46a,#8e6fce")).length;
      const nbNotes = notes.length;
      return { valeurs: [audio, midi], message: `Color Looper · ${nbCouleurs} couleurs · ${nbNotes} notes · ${audio.duration.toFixed(1)} s` };
    },
  },
] as FicheAudio[]).map(avecDoc);
