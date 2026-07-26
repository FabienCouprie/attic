// plugins/automate-cellulaire.ts — Nœud de génération musicale par automate cellulaire 1D.
import type { FicheAudio } from "../audio/types-domaine";
import { genererAutomateCellulaire, normaliserMode, normaliserCle, normaliserGamme, normaliserTimbre } from "../audio/automate-cellulaire";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

const FICHES: FicheAudio[] = [
  {
    id: "automate-cellulaire",
    nom: "Automate cellulaire",
    nomEn: "Cellular automaton",
    univers: "Entrées",
    famille: "Génération",
    resume: "Génère une séquence musicale à partir d'un automate cellulaire 1D.",
    resumeEn: "Generates a musical sequence from a 1D cellular automaton.",
    entrees: [],
    sorties: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "MIDI", type: "midi" },
    ],
    parametres: [
      { nom: "Règle", nomEn: "Rule", type: "choix", options: ["30", "90", "110", "126", "150"], defaut: "90", optionsEn: ["30", "90", "110", "126", "150"], defautEn: "90" },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Polyphonie", "Mélodie"], defaut: "Polyphonie", optionsEn: ["Polyphony", "Melody"], defautEn: "Polyphony" },
      { nom: "Largeur", nomEn: "Width", type: "nombre", plage: [4, 64], pas: 1, defaut: 16, unite: "cellules", doc: "Nombre de cellules par génération.", docEn: "Number of cells per generation." },
      { nom: "Générations", nomEn: "Generations", type: "nombre", plage: [4, 256], pas: 1, defaut: 32, unite: "pas", doc: "Nombre de pas / générations de l'automate.", docEn: "Number of steps / generations of the automaton." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 9999], pas: 1, defaut: 0, doc: "0 = une seule cellule au centre. Sinon initialisation aléatoire.", docEn: "0 = single centered cell. Otherwise random initialization." },
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["Do", "Do#", "Ré", "Mi♭", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "Si♭", "Si"], defaut: "Do", optionsEn: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"], defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["Majeur", "Mineur naturel", "Pentatonique majeure", "Pentatonique mineure", "Chromatique"], defaut: "Pentatonique majeure", optionsEn: ["Major", "Natural minor", "Major pentatonic", "Minor pentatonic", "Chromatic"], defautEn: "Major pentatonic" },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [1, 6], pas: 1, defaut: 4 },
      { nom: "Durée note", nomEn: "Note duration", type: "nombre", plage: [0.05, 2], pas: 0.05, defaut: 0.2, unite: "s", doc: "Durée de chaque pas en secondes.", docEn: "Duration of each step in seconds." },
      { nom: "Vélocité", nomEn: "Velocity", type: "nombre", plage: [1, 127], pas: 1, defaut: 100 },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%" },
      { nom: "Synthèse", nomEn: "Synthesis", type: "choix", options: ["FM/Oscillateurs", "SoundFont"], defaut: "FM/Oscillateurs", optionsEn: ["FM/Oscillators", "SoundFont"], defautEn: "FM/Oscillators" },
    ],
    async executer(ctx: any) {
      const res = await genererAutomateCellulaire({
        regle: parseInt(ctx.paramTexte("Règle", "90"), 10) || 90,
        mode: normaliserMode(ctx.paramTexte("Mode", "Polyphonie")),
        largeur: ctx.paramNombre("Largeur", 16),
        generations: ctx.paramNombre("Générations", 32),
        graine: ctx.paramNombre("Graine", 0),
        cle: normaliserCle(ctx.paramTexte("Clé", "Do")),
        gamme: normaliserGamme(ctx.paramTexte("Gamme", "Pentatonique majeure")),
        octave: ctx.paramNombre("Octave", 4),
        dureeNote: ctx.paramNombre("Durée note", 0.2),
        velocite: ctx.paramNombre("Vélocité", 100),
        volume: ctx.paramNombre("Volume", 80),
        timbre: normaliserTimbre(ctx.paramTexte("Synthèse", "FM/Oscillateurs")),
      });
      return {
        valeurs: [res.audio, res.midi],
        message: traduire("msg.automate_cellulaire", res.notes.length, res.audio.duration.toFixed(1)),
      };
    },
  },
];

export const fiches: FicheAudio[] = FICHES.map(avecDoc) as FicheAudio[];
