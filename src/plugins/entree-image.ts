// plugins/entree-image.ts — Nœud d'entrée image : charge un fichier PNG/JPEG
// depuis l'inspecteur et le transmet sur sa sortie 'Image'.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

const entreesImage: FicheAudio[] = [
  {
    id: "entree-image",
    nom: "Entrée image",
    nomEn: "Image input",
    univers: "Entrées",
    famille: "Image",
    resume: "Charge un fichier image et le transmet sur sa sortie.",
    resumeEn: "Loads an image file and passes it to its output.",
    entrees: [],
    sorties: [{ nom: "Image", type: "image" }],
    parametres: [],
    async executer(ctx) {
      const fichier = ctx.noeud.data.imageFichier as File | undefined;
      if (!fichier) {
        return { valeurs: [null], erreur: true, message: traduire("msg.aucune_image_chargee") };
      }
      return {
        valeurs: [fichier],
        message: `${fichier.name} · ${fichier.size.toLocaleString()} o`,
      };
    },
  },
];

export const fiches: FicheAudio[] = entreesImage.map(avecDoc) as FicheAudio[];
