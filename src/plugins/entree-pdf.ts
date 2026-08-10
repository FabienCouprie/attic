// plugins/entree-pdf.ts — Nœud d'entrée PDF : charge un fichier .pdf depuis
// l'inspecteur et le transmet sur sa sortie 'Fichier' (type générique
// "fichier", déjà enregistré dans le registre de flux mais jusqu'ici inutilisé
// par aucun nœud).
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";

const entreesPdf: FicheAudio[] = [
  {
    id: "entree-pdf",
    nom: "Entrée PDF",
    nomEn: "PDF input",
    univers: "Entrées",
    famille: "Texte",
    resume: "Charge un fichier PDF et le transmet sur sa sortie.",
    resumeEn: "Loads a PDF file and passes it to its output.",
    entrees: [],
    sorties: [{ nom: "Fichier", nomEn: "File", type: "fichier" }],
    parametres: [
      { nom: "Chemin", nomEn: "Path", type: "texte", defaut: "", defautEn: "", hidden: true,
        doc: "Chemin du fichier PDF chargé depuis l'inspecteur.",
        docEn: "Path of the PDF file loaded from the inspector." },
    ],
    async executer(ctx) {
      const fichier = ctx.noeud.data.pdfFichier as File | undefined;
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

export const fiches: FicheAudio[] = entreesPdf.map(avecDoc) as FicheAudio[];
