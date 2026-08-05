// plugins/entree-image.ts — Nœud d'entrée image : charge un fichier PNG/JPEG
// depuis l'inspecteur et le transmet sur sa sortie 'Image'.
import type { FicheAudio } from "../audio/types-domaine";
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
    parametres: [
      { nom: "Chemin", nomEn: "Path", type: "texte", defaut: "", defautEn: "", hidden: true,
        doc: "Chemin du fichier image chargé depuis l'inspecteur.",
        docEn: "Path of the image file loaded from the inspector." },
    ],
    async executer(ctx) {
      const fichier = ctx.noeud.data.imageFichier as File | undefined;
      if (!fichier) {
        return { valeurs: [null], erreur: true };
      }
      return {
        valeurs: [fichier],
        message: `${fichier.name} · ${fichier.size.toLocaleString()} o`,
      };
    },
  },
];

export const fiches: FicheAudio[] = entreesImage.map(avecDoc) as FicheAudio[];
