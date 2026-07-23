// plugins/pixeltone.ts — Nœud « Pixeltone » : sonification d'image façon
// pixeltone.js. Chaque pixel devient une tranche sonore ; les canaux R, G, B
// pilotent trois fréquences réglables. Nécessite un environnement navigateur.
import type { FicheAudio } from "../audio/types-domaine";
import { sonifierImage } from "../audio";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "pixeltone",
    nom: "Pixeltone",
    nomEn: "Pixeltone",
    univers: "Autres",
    famille: "Génération",
    resume: "Convertit une image en son en mappant R, G, B sur des fréquences.",
    resumeEn: "Converts an image to sound by mapping R, G, B to frequencies.",
    entrees: [{ nom: "Image", type: "image" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Durée pixel",
        nomEn: "Pixel duration",
        type: "nombre",
        plage: [0.001, 0.5],
        pas: 0.001,
        defaut: 0.01,
        unite: "s",
        doc: "Durée en secondes attribuée à chaque pixel de l'image. Plus la valeur est faible, plus le son est court.",
        docEn: "Duration in seconds assigned to each image pixel. Lower values make the sound shorter.",
      },
      {
        nom: "Largeur max",
        nomEn: "Max width",
        type: "nombre",
        plage: [32, 1024],
        pas: 1,
        defaut: 256,
        unite: "px",
        doc: "Largeur maximale de l'image redimensionnée avant sonification. Permet de contrôler la durée totale de l'audio.",
        docEn: "Maximum width of the resized image before sonification. Controls the total audio duration.",
      },
      {
        nom: "Rouge (Hz)",
        nomEn: "Red (Hz)",
        type: "texte",
        defaut: "100,1000",
        doc: "Plage de fréquences du canal rouge, séparée par une virgule.",
        docEn: "Frequency range for the red channel, comma-separated.",
      },
      {
        nom: "Vert (Hz)",
        nomEn: "Green (Hz)",
        type: "texte",
        defaut: "500,3000",
        doc: "Plage de fréquences du canal vert, séparée par une virgule.",
        docEn: "Frequency range for the green channel, comma-separated.",
      },
      {
        nom: "Bleu (Hz)",
        nomEn: "Blue (Hz)",
        type: "texte",
        defaut: "1000,5000",
        doc: "Plage de fréquences du canal bleu, séparée par une virgule.",
        docEn: "Frequency range for the blue channel, comma-separated.",
      },
      {
        nom: "Balayage",
        nomEn: "Scan",
        type: "choix",
        options: ["Horizontal", "Vertical", "Zigzag"],
        optionsEn: ["Horizontal", "Vertical", "Zigzag"],
        defaut: "Horizontal",
        defautEn: "Horizontal",
        doc: "Ordre de lecture des pixels : ligne par ligne, colonne par colonne, ou zigzag horizontal.",
        docEn: "Pixel reading order: row by row, column by column, or horizontal zigzag.",
      },
      {
        nom: "Canaux",
        nomEn: "Channels",
        type: "choix",
        options: ["Mono", "Stéréo"],
        optionsEn: ["Mono", "Stereo"],
        defaut: "Stéréo",
        defautEn: "Stereo",
        doc: "Nombre de canaux de l'audio de sortie.",
        docEn: "Number of output audio channels.",
      },
      {
        nom: "Volume",
        nomEn: "Volume",
        type: "nombre",
        plage: [0, 100],
        defaut: 80,
        unite: "%",
        doc: "Volume de sortie du son.",
        docEn: "Output volume of the sound.",
      },
    ],
    async executer(ctx: any) {
      const image = ctx.entree(0);
      if (!(image instanceof File)) {
        return { valeurs: [null], message: traduire("msg.connecter.image") };
      }

      const parsePlage = (texte: string, defaut: [number, number]): [number, number] => {
        const parts = texte.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
        if (parts.length >= 2) return [Math.max(20, parts[0]), Math.max(20, parts[1])];
        return defaut;
      };

      const rouge = parsePlage(ctx.paramTexte("Rouge (Hz)", "100,1000"), [100, 1000]);
      const vert = parsePlage(ctx.paramTexte("Vert (Hz)", "500,3000"), [500, 3000]);
      const bleu = parsePlage(ctx.paramTexte("Bleu (Hz)", "1000,5000"), [1000, 5000]);

      const balayage = ctx.paramTexte("Balayage", "Horizontal").toLowerCase() as "horizontal" | "vertical" | "zigzag";
      const canaux = ctx.paramTexte("Canaux", "Stéréo") === "Mono" ? 1 : 2;

      try {
        const audio = await sonifierImage(
          image,
          {
            dureePixel: ctx.paramNombre("Durée pixel", 0.01),
            rouge,
            vert,
            bleu,
            balayage,
            sampleRate: 44100,
            volume: ctx.paramNombre("Volume", 80),
            canaux,
          },
          ctx.paramNombre("Largeur max", 256),
        );
        return {
          valeurs: [audio],
          message: `Pixeltone · ${image.name} · ${audio.duration.toFixed(1)} s`,
        };
      } catch (e: any) {
        return { valeurs: [null], message: e?.message || traduire("msg.erreur") };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
