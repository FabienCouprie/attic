// plugins/export-svg.ts — Nœud « Export SVG » : sauvegarde un fichier SVG reçu
// sur son entrée dans le répertoire de travail et retourne le chemin.
// Nécessite Electron.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

function nomAvecExtensionSvg(nom: string) {
  const base = nom.replace(/\.svg$/i, "");
  return `${base}.svg`;
}

export const fiches: FicheAudio[] = ([
  {
    id: "export-svg",
    nom: "Export SVG",
    nomEn: "SVG Export",
    univers: "Sorties",
    famille: "Export",
    resume: "Sauvegarde un fichier SVG sur disque et retourne son chemin.",
    resumeEn: "Saves an SVG file to disk and returns its path.",
    entrees: [{ nom: "SVG", type: "image" }],
    sorties: [{ nom: "Chemin", type: "texte" }],
    parametres: [
      {
        nom: "Nom",
        nomEn: "Name",
        type: "texte",
        defaut: "export.svg",
        defautEn: "export.svg",
        doc: "Nom du fichier SVG de sortie (dans le répertoire de travail). L'extension est forcée à .svg.",
        docEn: "Output SVG filename (in the working directory). The extension is forced to .svg.",
      },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.ecrireFichier) {
        return { valeurs: [null], message: traduire("msg.n_cessite_electron") };
      }

      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) {
        return { valeurs: [null], message: traduire("msg.connecter.svg") };
      }

      const nom = ctx.paramTexte("Nom", "export.svg");
      const nomFinal = nomAvecExtensionSvg(nom);
      const chemin = `${ctx.repertoireTravail}/${nomFinal}`;

      const bytes = new Uint8Array(await fichier.arrayBuffer());
      const ecrit = await api.ecrireFichier(chemin, bytes);
      if (!ecrit) {
        return { valeurs: [null], message: traduire("msg.export_svg.ecriture_impossible") };
      }

      return {
        valeurs: [chemin],
        message: traduire("msg.export_svg.termine", nomFinal),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
