// plugins/svg-vers-pdf.ts — Nœud « SVG vers PDF » : imprime un SVG et son titre dans un fichier PDF
// du répertoire de travail, et rend son chemin. Nécessite Electron.
//
// FAIT POUR « PARTITION GRAVÉE », dont la sortie « Fichier SVG » est une page de partition. Son
// graveur n'écrit pas de titre : celui-ci arrive par la seconde entrée, ou par le réglage du même nom.
//
// LA FORME EST CELLE D'« EXPORT IMAGE » : le chemin dans le répertoire de travail par
// `cheminDansTravail`, l'écriture par le pont, le chemin rendu sur la sortie « Chemin ». Seule la
// conversion est neuve, et elle vit dans le processus principal (`electron/ipc-pdf.cjs`), parce que
// c'est Chromium qui imprime : ce fichier ne fait que la demander.
//
// LE FORMAT SE LIT SUR LES OCTETS, JAMAIS SUR `File.type`, comme pour l'export d'image : une
// étiquette posée par qui a fabriqué le fichier a déjà menti ici. Une image qui n'est pas un SVG est
// refusée en nommant ce qu'elle est.
import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { cheminDansTravail, messageEchecPont } from "./pont-electron";
import { typeImageDesOctets } from "../core/type-image";

/** Le nom du fichier à écrire : le nom saisi, privé de son extension `.pdf` s'il en porte une, puis `.pdf`. */
export function nomAvecExtensionPdf(nom: string): string {
  const base = nom.trim().replace(/\.pdf$/i, "") || "partition";
  return `${base}.pdf`;
}

/** Ce que rend le canal `pdf:depuis-svg`. */
type ReponseImpression = { pdf: Uint8Array } | { refus: string } | { echec: string };

export const fiches: FicheAudio[] = ([
  fiche({
    id: "svg-vers-pdf",
    nom: "SVG vers PDF",
    nomEn: "SVG to PDF",
    univers: "Sorties",
    famille: "Export",
    resume: "Imprime un SVG dans un fichier PDF, sous un titre, et retourne son chemin.",
    resumeEn: "Prints an SVG into a PDF file, under a title, and returns its path.",
    entrees: [
      { nom: "SVG", type: "image" },
      { nom: "Titre", nomEn: "Title", type: "texte", requis: false },
    ],
    sorties: [{ nom: "Chemin", nomEn: "Path", type: "texte" }],
    parametres: [
      {
        nom: "Titre", nomEn: "Title", type: "texte", defaut: "", defautEn: "",
        doc: "Titre écrit en tête de la page, si aucun texte n'est branché sur l'entrée « Titre ». Vide, la page n'a pas de titre.",
        docEn: "Title written at the top of the page, when no text is connected to the « Title » input. Empty, the page has no title.",
      },
      {
        nom: "Nom", nomEn: "Name", type: "texte", defaut: "partition.pdf", defautEn: "score.pdf",
        doc: "Nom du fichier écrit dans le répertoire de travail. L'extension est forcée à .pdf.",
        docEn: "Name of the file written to the working directory. The extension is forced to .pdf.",
      },
      {
        nom: "Format", nomEn: "Format", type: "choix",
        options: ["A4", "Lettre US"], optionsEn: ["A4", "US Letter"], optionIds: ["a4", "lettre"],
        defaut: "A4", defautEn: "A4",
        doc: "Format de la page : A4, 210 × 297 mm, ou Lettre US, 215,9 × 279,4 mm.",
        docEn: "Page format: A4, 210 × 297 mm, or US Letter, 215.9 × 279.4 mm.",
      },
      {
        nom: "Orientation", nomEn: "Orientation", type: "choix",
        options: ["Portrait", "Paysage"], optionsEn: ["Portrait", "Landscape"], optionIds: ["portrait", "paysage"],
        defaut: "Portrait", defautEn: "Portrait",
        doc: "Sens de la page : en hauteur, ou en largeur.",
        docEn: "Page direction: upright, or sideways.",
      },
    ],
    async executer(ctx) {
      const api = (window as any).api;
      if (!api?.ecrireFichier || !api?.svgVersPdf) {
        return { valeurs: [null], message: traduire("msg.n_cessite_electron") };
      }

      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) {
        return { valeurs: [null], message: traduire("msg.connecter.svg") };
      }
      const octets = new Uint8Array(await fichier.arrayBuffer());
      const type = typeImageDesOctets(octets);
      if (type !== "image/svg+xml") {
        return { valeurs: [null], erreur: true, message: traduire("msg.svg_vers_pdf.pas_svg_var_0", type ?? traduire("msg.svg_vers_pdf.format_inconnu")) };
      }

      const branche = ctx.entree(1);
      const titre = (typeof branche === "string" && branche.trim()) || ctx.paramTexte("Titre", "").trim();
      const nomFinal = nomAvecExtensionPdf(ctx.paramTexte("Nom", "partition.pdf"));
      const cible = cheminDansTravail(ctx.repertoireTravail, nomFinal);
      if (!cible.ok) return { valeurs: [null], erreur: true, message: cible.message };

      let reponse: ReponseImpression;
      try {
        reponse = await api.svgVersPdf({
          svg: new TextDecoder().decode(octets),
          titre,
          nom: nomFinal.replace(/\.pdf$/, ""),
          format: ctx.paramTexte("Format", "a4"),
          orientation: ctx.paramTexte("Orientation", "portrait"),
        });
      } catch (e) {
        return { valeurs: [null], erreur: true, message: messageEchecPont(e, "pdf:depuis-svg") };
      }
      if ("refus" in reponse) return { valeurs: [null], erreur: true, message: traduire("msg.svg_vers_pdf.refus_var_0", reponse.refus) };
      if ("echec" in reponse) return { valeurs: [null], erreur: true, message: traduire("msg.svg_vers_pdf.echec_var_0", reponse.echec) };

      const ecrit = await api.ecrireFichier(cible.chemin, reponse.pdf);
      if (!ecrit) {
        return { valeurs: [null], erreur: true, message: traduire("msg.svg_vers_pdf.ecriture_impossible") };
      }
      return {
        valeurs: [cible.chemin],
        message: traduire("msg.svg_vers_pdf.termine_var_0_var_1", nomFinal, reponse.pdf.length),
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);
