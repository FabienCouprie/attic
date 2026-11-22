// plugins/camelot.ts — Nœud « Roue de Camelot ».
// Génère un parcours audio/MIDI sur la roue de Camelot pour illustrer les
// transitions harmoniques compatibles entre tonalités.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { genererCamelot, genererSvgCamelot } from "../audio";
import { parseCamelot } from "../audio/camelot";
import { hasardDuNoeud } from "../core";
import { traduire } from "../i18n";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { avecDoc } from "./notices";
import { choixFaconAccord, faconDe } from "../audio/facons-accord";

export const fiches: FicheAudio[] = ([
  fiche({
    id: "camelot",
    nom: "Roue de Camelot",
    nomEn: "Camelot Wheel",
    // Une source : il ne reçoit rien et rend du son. Sa place est parmi les entrées, et non
    // dans « Autres », qui est la rubrique qu'on ne consulte pas en travaillant.
    univers: "Entrées",
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
        doc: "Code de départ sur la roue (ex : 4B, 7A, 12B). Anneau A = mineur, B = majeur. Un nombre de 1 à 12 suivi de A ou de B, en capitale ou non ; un autre code fait refuser le composant, et le message le nomme.",
        docEn: "Starting code on the wheel (e.g. 4B, 7A, 12B). Ring A = minor, B = major. A number from 1 to 12 followed by A or B, in capitals or not; any other code makes the node refused, and the message names it." },
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
      { nom: "Mode", nomEn: "Mode", type: "choix", ...choixFaconAccord(), defaut: "Plaqué", defautEn: "Block",
        doc: "Plaqué = notes de l'accord simultanées ; Arpégé = notes déclinées ; Roulé = notes déclinées et tenues jusqu'au bout de l'accord.",
        docEn: "Block = chord notes together; Arpeggiated = notes played sequentially; Rolled = notes played sequentially and held to the chord's end." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine du parcours, sans effet quand « Parcours » ne vaut pas « Aléatoire ». 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici ; toute autre valeur rejoue le même parcours.",
        docEn: "Seed for the journey; no effect when « Journey » is not « Random ». 0 = drawn at random on every run, and shown in the message so it can be copied back here; any other value replays the same journey." },
    ],
    async executer(ctx) {
      const parcoursBrut = ctx.paramTexte("Parcours", "Complet");
      const parcours: any = ["voisins", "aleatoire"].includes(parcoursBrut.toLowerCase()) ? parcoursBrut.toLowerCase() : "complet";
      const facon = faconDe(ctx.paramTexte("Mode", "plaque"));
      const mode = facon === "arpege" || facon === "roule" ? facon : "bloc";
      const modeRenduBrut = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu = modeRenduBrut === "Automatique" ? (sf2Chargee() ? "SoundFont" : "FM/Oscillateurs") : modeRenduBrut;
      // UN CODE QUE LA ROUE NE LIT PAS EST REFUSÉ, ET NOMMÉ : il rendait un nœud vert, « 0 accords ». Revue
      // des notations en texte, passe de complétude, 2026-11-22.
      const depart = ctx.paramTexte("Départ", "4B");
      if (!parseCamelot(depart)) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.camelot.code_var_0", depart) };
      }
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const { audio, midi, notes, codes, accords } = await genererCamelot({
        depart,
        parcours,
        pas: ctx.paramNombre("Pas", 12),
        tempo: ctx.paramNombre("Tempo", 120),
        dureeNote: ctx.paramNombre("Durée note", 0.75),
        octave: ctx.paramNombre("Octave", 3),
        mode,
        modeRendu,
        instrument: ctx.paramNombre("Instrument", 0),
        volume: ctx.paramNombre("Volume", 80),
        hasard: aleatoire,
      });
      const image = genererSvgCamelot(codes);
      const chemin = codes.join(" → ");
      return {
        valeurs: [audio, midi, image],
        message: traduire("msg.camelot.resultat", chemin, accords.length, notes.length, audio.duration.toFixed(1), graine),
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);
