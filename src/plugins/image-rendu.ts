// plugins/image-rendu.ts — Nœud « Rendu image » : affiche une image reçue sur
// son entrée et la transmet inchangée sur sa sortie. Permet de visualiser une
// image n'importe où dans le graphe sans interruption de la chaîne.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "rendu-image",
    nom: "Rendu image",
    nomEn: "Image Renderer",
    univers: "Visualisation",
    famille: "Image",
    resume: "Affiche une image et la transmet inchangée.",
    resumeEn: "Displays an image and passes it through unchanged.",
    entrees: [{ nom: "Image", type: "image" }],
    sorties: [{ nom: "Image", type: "image" }],
    parametres: [],
    async executer(ctx: any) {
      const image = ctx.entree(0);
      if (!(image instanceof File)) {
        return { valeurs: [null], message: traduire("msg.connecter.image") };
      }
      return {
        valeurs: [image],
        message: `${image.name} · ${image.size.toLocaleString()} o`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
