// plugins/camelot.ts — Nœud « Roue de Camelot ».
// Génère un parcours audio/MIDI sur la roue de Camelot pour illustrer les
// transitions harmoniques compatibles entre tonalités.

import type { FicheAudio } from "../audio/types-domaine";
import { genererCamelot, genererSvgCamelot } from "../audio";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "camelot",
    nom: "Roue de Camelot",
    nomEn: "Camelot Wheel",
    univers: "Autres",
    famille: "Génération",
    resume: "Parcours sonore sur la roue de Camelot pour illustrer les transitions harmoniques.",
    resumeEn: "Musical journey on the Camelot wheel to illustrate harmonic transitions.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
      { nom: "Image", nomEn: "Image", type: "image" },
    ],
    parametres: [
      { nom: "Départ", nomEn: "Start", type: "texte", defaut: "4B",
        doc: "Code de départ sur la roue (ex : 4B, 7A, 12B). Anneau A = mineur, B = majeur.",
        docEn: "Starting code on the wheel (e.g. 4B, 7A, 12B). Ring A = minor, B = major." },
      { nom: "Parcours", nomEn: "Journey", type: "choix",
        options: ["Complet", "Voisins", "Aléatoire"],
        optionsEn: ["Full", "Neighbors", "Random"],
        optionIds: ["complet", "voisins", "aleatoire"],
        defaut: "Complet", defautEn: "Full",
        doc: "Complet = tour de la roue ; Voisins = transitions compatibles (+1, -1, même numéro, +7) ; Aléatoire = parcours aléatoire entre voisins.",
        docEn: "Full = around the wheel; Neighbors = compatible moves (+1, -1, same number, +7); Random = random walk between neighbors." },
      { nom: "Pas", nomEn: "Steps", type: "nombre", plage: [1, 24], pas: 1, defaut: 12,
        doc: "Nombre d'accords générés.", docEn: "Number of chords generated." },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [2, 5], pas: 1, defaut: 3,
        doc: "Octave de base des accords.", docEn: "Base octave for chords." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], defaut: 120, unite: "BPM",
        doc: "Vitesse du parcours.", docEn: "Journey speed." },
      { nom: "Durée note", nomEn: "Note duration", type: "nombre", plage: [0.05, 2], pas: 0.05, defaut: 0.75,
        doc: "Durée de chaque accord en fraction de temps (1 = temps entier, 0.5 = croche).",
        docEn: "Duration of each chord as a fraction of a beat (1 = quarter, 0.5 = eighth)." },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Bloc", "Arpège"], optionsEn: ["Block", "Arpeggio"], optionIds: ["bloc", "arpege"], defaut: "Bloc", defautEn: "Block",
        doc: "Bloc = notes de l'accord simultanées ; Arpège = notes déclinées.",
        docEn: "Block = chord notes together; Arpeggio = notes played sequentially." },
      { nom: "Synthèse", nomEn: "Synthesis", type: "choix", options: ["Automatique", "FM/Oscillateurs", "SoundFont"], optionsEn: ["Auto", "FM/Oscillators", "SoundFont"], defaut: "Automatique", defautEn: "Auto",
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const parcoursBrut = ctx.paramTexte("Parcours", "Complet");
      const parcours: any = ["voisins", "aleatoire"].includes(parcoursBrut.toLowerCase()) ? parcoursBrut.toLowerCase() : "complet";
      const modeBrut = ctx.paramTexte("Mode", "Bloc");
      const mode: any = modeBrut.toLowerCase().includes("arp") ? "arpege" : "bloc";
      const modeRenduBrut = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu = modeRenduBrut === "Automatique" ? (sf2Chargee() ? "SoundFont" : "FM/Oscillateurs") : modeRenduBrut;
      const { audio, midi, notes, codes, accords } = await genererCamelot({
        depart: ctx.paramTexte("Départ", "4B"),
        parcours,
        pas: ctx.paramNombre("Pas", 12),
        tempo: ctx.paramNombre("Tempo", 120),
        dureeNote: ctx.paramNombre("Durée note", 0.75),
        octave: ctx.paramNombre("Octave", 3),
        mode,
        modeRendu,
        instrument: ctx.paramNombre("Instrument", 0),
        volume: ctx.paramNombre("Volume", 80),
      });
      const image = genererSvgCamelot(codes);
      const chemin = codes.join(" → ");
      return {
        valeurs: [audio, midi, image],
        message: `Camelot · ${chemin} · ${accords.length} accords · ${notes.length} notes · ${audio.duration.toFixed(1)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
