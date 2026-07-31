// plugins/couleur-rgb.ts — Nœud « Couleur RGB ».
// Trois oscillateurs sinusoïdaux pilotés par les composantes R, G, B d'une couleur.
// Chaque canal est mappé sur une plage de fréquences réglable.

import type { FicheAudio } from "../audio/types-domaine";
import { genererCouleurRGBAudio, parsePlage } from "../audio";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "couleur-rgb",
    nom: "Couleur RGB",
    nomEn: "RGB Color",
    univers: "Autres",
    famille: "Génération",
    resume: "Synthétise une couleur RGB en trois oscillateurs (R, G, B).",
    resumeEn: "Synthesizes an RGB color into three oscillators (R, G, B).",
    entrees: [],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Rouge", nomEn: "Red", type: "nombre", plage: [0, 255], pas: 1, defaut: 128,
        doc: "Intensité du canal rouge (0-255).", docEn: "Red channel intensity (0-255)." },
      { nom: "Vert", nomEn: "Green", type: "nombre", plage: [0, 255], pas: 1, defaut: 128,
        doc: "Intensité du canal vert (0-255).", docEn: "Green channel intensity (0-255)." },
      { nom: "Bleu", nomEn: "Blue", type: "nombre", plage: [0, 255], pas: 1, defaut: 128,
        doc: "Intensité du canal bleu (0-255).", docEn: "Blue channel intensity (0-255)." },
      { nom: "Rouge (Hz)", nomEn: "Red (Hz)", type: "texte", defaut: "100,1000",
        doc: "Plage de fréquences du canal rouge, séparée par une virgule.", docEn: "Frequency range for the red channel, comma-separated." },
      { nom: "Vert (Hz)", nomEn: "Green (Hz)", type: "texte", defaut: "500,3000",
        doc: "Plage de fréquences du canal vert, séparée par une virgule.", docEn: "Frequency range for the green channel, comma-separated." },
      { nom: "Bleu (Hz)", nomEn: "Blue (Hz)", type: "texte", defaut: "1000,5000",
        doc: "Plage de fréquences du canal bleu, séparée par une virgule.", docEn: "Frequency range for the blue channel, comma-separated." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.1, 60], pas: 0.1, defaut: 4, unite: "s",
        doc: "Durée du son généré.", docEn: "Duration of the generated sound." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
      { nom: "Canaux", nomEn: "Channels", type: "choix", options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], optionIds: ["mono", "stereo"], defaut: "Stéréo", defautEn: "Stereo",
        doc: "Nombre de canaux de l'audio de sortie.", docEn: "Number of output audio channels." },
    ],
    async executer(ctx: any) {
      const rouge = parsePlage(ctx.paramTexte("Rouge (Hz)", "100,1000"), [100, 1000]);
      const vert = parsePlage(ctx.paramTexte("Vert (Hz)", "500,3000"), [500, 3000]);
      const bleu = parsePlage(ctx.paramTexte("Bleu (Hz)", "1000,5000"), [1000, 5000]);
      const canaux = ctx.paramTexte("Canaux", "stereo") === "mono" ? 1 : 2;
      const audio = genererCouleurRGBAudio({
        r: ctx.paramNombre("Rouge", 128),
        g: ctx.paramNombre("Vert", 128),
        b: ctx.paramNombre("Bleu", 128),
        duree: ctx.paramNombre("Durée", 4),
        volume: ctx.paramNombre("Volume", 80),
        canaux,
        rouge,
        vert,
        bleu,
      });
      return { valeurs: [audio], message: `Couleur RGB · ${audio.duration.toFixed(1)} s` };
    },
  },
] as FicheAudio[]).map(avecDoc);
