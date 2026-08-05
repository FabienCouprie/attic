// plugins/spectre-visible.ts — Nœud « Spectre visible ».
// Convertit une couleur RGB en longueur d'onde, puis transpose la fréquence
// de la lumière dans le domaine audible pour produire un drone.

import type { FicheAudio } from "../audio/types-domaine";
import { genererSpectreVisibleAudio, hexToRgb, midiDepuisFrequence, frequenceAudibleDepuisCouleur } from "../audio";
import { notesVersFichierMidi } from "../audio";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "spectre-visible",
    nom: "Spectre visible",
    nomEn: "Visible Spectrum",
    univers: "Autres",
    famille: "Génération",
    resume: "Transpose la fréquence d'une couleur visible (longueur d'onde) dans le domaine audible.",
    resumeEn: "Transposes the frequency of a visible color (wavelength) into the audible range.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
    ],
    parametres: [
      { nom: "Rouge", nomEn: "Red", type: "nombre", plage: [0, 255], pas: 1, defaut: 128,
        doc: "Intensité du canal rouge.", docEn: "Red channel intensity." },
      { nom: "Vert", nomEn: "Green", type: "nombre", plage: [0, 255], pas: 1, defaut: 128,
        doc: "Intensité du canal vert.", docEn: "Green channel intensity." },
      { nom: "Bleu", nomEn: "Blue", type: "nombre", plage: [0, 255], pas: 1, defaut: 128,
        doc: "Intensité du canal bleu.", docEn: "Blue channel intensity." },
      { nom: "Couleur", nomEn: "Color", type: "texte", defaut: "", defautEn: "",
        doc: "Hexadécimal optionnel (#RRGGBB). Si renseigné, il remplace les curseurs RGB.", docEn: "Optional hex color (#RRGGBB). If set, it overrides the RGB sliders." },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [0, 8], pas: 1, defaut: 3,
        doc: "Nombre d'octaves de transposition vers le bas depuis la fréquence lumineuse.", docEn: "Number of octaves to transpose down from the light frequency." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.1, 60], pas: 0.1, defaut: 4, unite: "s",
        doc: "Durée du drone.", docEn: "Duration of the drone." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
      { nom: "Canaux", nomEn: "Channels", type: "choix", options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], optionIds: ["mono", "stereo"], defaut: "Stéréo", defautEn: "Stereo",
        doc: "Nombre de canaux de sortie.", docEn: "Number of output channels." },
    ],
    async executer(ctx: any) {
      let r = ctx.paramNombre("Rouge", 128);
      let g = ctx.paramNombre("Vert", 128);
      let b = ctx.paramNombre("Bleu", 128);
      const hex = ctx.paramTexte("Couleur", "");
      const parsed = hexToRgb(hex);
      if (parsed) {
        r = parsed.r;
        g = parsed.g;
        b = parsed.b;
      }
      const canaux = ctx.paramTexte("Canaux", "stereo") === "mono" ? 1 : 2;
      const octave = ctx.paramNombre("Octave", 3);
      const duree = ctx.paramNombre("Durée", 4);
      const volume = ctx.paramNombre("Volume", 80);
      const audio = genererSpectreVisibleAudio({
        r, g, b,
        octave,
        duree,
        volume,
        canaux,
      });
      const { frequence, longueurOnde } = frequenceAudibleDepuisCouleur(r, g, b, octave);
      const midi = Math.round(midiDepuisFrequence(frequence));
      const midiFile = notesVersFichierMidi([{ note: Math.max(0, Math.min(127, midi)), velocite: 100, debut: 0, fin: duree }], 120);
      return {
        valeurs: [audio, midiFile],
        message: `Spectre visible · λ ≈ ${longueurOnde.toFixed(0)} nm · f ≈ ${frequence.toFixed(1)} Hz`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
