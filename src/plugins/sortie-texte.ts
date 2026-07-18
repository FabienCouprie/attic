// plugins/sortie-texte.ts — Nœud « Sortie texte » : affiche et permet de
// télécharger/coller le texte reçu sur son entrée (port bleu).

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "sortie-texte", nom: "Sortie texte", nomEn: "Text Output",
    univers: "Sorties", famille: "Écoute",
    resume: "Affiche le texte reçu et permet de le copier ou télécharger.",
    resumeEn: "Displays received text and allows copying or downloading.",
    entrees: [{ nom: "Texte", type: "texte" }],
    sorties: [{ nom: "Texte", type: "texte" }],
    parametres: [],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) return { valeurs: [null], message: "Aucun texte en entrée." };
      return { valeurs: [texte], message: texte };
    },
  },
] as FicheAudio[]).map(avecDoc);
