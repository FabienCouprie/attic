// plugins/image-export.ts — Nœud « Export image » : sauvegarde un fichier image
// reçu sur son entrée dans le répertoire de travail et retourne le chemin.
// Nécessite Electron.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

function extensionParMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  return "png";
}

function nomAvecExtension(nom: string, mime: string) {
  const ext = extensionParMime(mime);
  const base = nom.replace(/\.(png|jpg|jpeg)$/i, "");
  return `${base}.${ext}`;
}

export const fiches: FicheAudio[] = ([
  {
    id: "export-image",
    nom: "Export image",
    nomEn: "Image Export",
    univers: "Sorties",
    famille: "Export",
    resume: "Sauvegarde une image sur disque et retourne son chemin.",
    resumeEn: "Saves an image to disk and returns its path.",
    entrees: [{ nom: "Image", type: "image" }],
    sorties: [{ nom: "Chemin", type: "texte" }],
    parametres: [
      {
        nom: "Nom",
        nomEn: "Name",
        type: "texte",
        defaut: "export.png",
        doc: "Nom du fichier image de sortie (dans le répertoire de travail). L'extension est adaptée au format réel de l'image.",
        docEn: "Output image filename (in the working directory). The extension is adapted to the actual image format.",
      },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.ecrireFichier) {
        return { valeurs: [null], message: traduire("msg.n_cessite_electron") };
      }

      const image = ctx.entree(0);
      if (!(image instanceof File)) {
        return { valeurs: [null], message: traduire("msg.connecter.image") };
      }

      const nom = ctx.paramTexte("Nom", "export.png");
      const nomFinal = nomAvecExtension(nom, image.type);
      const chemin = `${ctx.repertoireTravail}/${nomFinal}`;

      const bytes = new Uint8Array(await image.arrayBuffer());
      const ecrit = await api.ecrireFichier(chemin, bytes);
      if (!ecrit) {
        return { valeurs: [null], message: traduire("msg.export_image.ecriture_impossible") };
      }

      return {
        valeurs: [chemin],
        message: traduire("msg.export_image.termine", nomFinal),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
