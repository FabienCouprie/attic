// plugins/lecteur-svg.ts — Nœud « Lecteur SVG » : charge un fichier SVG depuis
// l'inspecteur, le rasterise à la taille demandée et le transmet sur sa sortie
// 'Image' (File PNG) pour la chaîne image (Rendu image, Pixeltone, Export image…).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

async function svgToPngFile(fichier: File, largeur: number, hauteur: number): Promise<File> {
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    throw new Error(traduire("msg.erreur_canvas"));
  }
  const texte = await fichier.text();
  const doc = new DOMParser().parseFromString(texte, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== "svg") {
    throw new Error(traduire("msg.erreur_chargement_svg"));
  }
  svg.setAttribute("width", String(Math.max(1, Math.round(largeur))));
  svg.setAttribute("height", String(Math.max(1, Math.round(hauteur))));
  if (!svg.getAttribute("viewBox")) {
    svg.setAttribute("viewBox", `0 0 ${Math.max(1, Math.round(largeur))} ${Math.max(1, Math.round(hauteur))}`);
  }
  const texteModifie = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([texteModifie], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error(traduire("msg.erreur_chargement_svg")));
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(largeur));
    canvas.height = Math.max(1, Math.round(hauteur));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(traduire("msg.erreur_canvas"));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const png = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!png) throw new Error(traduire("msg.erreur_conversion_png"));
    return new File([png], fichier.name.replace(/\.svg$/i, ".png"), { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const lecteursSvg: FicheAudio[] = [
  {
    id: "lecteur-svg",
    nom: "Lecteur SVG",
    nomEn: "SVG Reader",
    univers: "Entrées",
    famille: "Image",
    resume: "Charge un fichier SVG et le rasterise en image PNG.",
    resumeEn: "Loads an SVG file and rasterizes it to a PNG image.",
    entrees: [],
    sorties: [{ nom: "Image", type: "image" }],
    parametres: [
      {
        nom: "Chemin",
        nomEn: "Path",
        type: "texte",
        defaut: "",
        defautEn: "",
        hidden: true,
        doc: "Chemin du fichier SVG (mis à jour automatiquement par le sélecteur de fichier).",
        docEn: "Path to the SVG file (updated automatically by the file selector).",
      },
      {
        nom: "Largeur",
        nomEn: "Width",
        type: "nombre",
        plage: [1, 4096],
        pas: 1,
        defaut: 512,
        unite: "px",
        doc: "Largeur de l'image PNG de sortie.",
        docEn: "Width of the output PNG image.",
      },
      {
        nom: "Hauteur",
        nomEn: "Height",
        type: "nombre",
        plage: [1, 4096],
        pas: 1,
        defaut: 512,
        unite: "px",
        doc: "Hauteur de l'image PNG de sortie.",
        docEn: "Height of the output PNG image.",
      },
    ],
    async executer(ctx) {
      const fichier = ctx.noeud.data.svgFichier as File | undefined;
      if (!fichier) {
        return { valeurs: [null], erreur: true };
      }
      try {
        const largeur = ctx.paramNombre("Largeur", 512);
        const hauteur = ctx.paramNombre("Hauteur", 512);
        const image = await svgToPngFile(fichier, largeur, hauteur);
        return {
          valeurs: [image],
          message: `${image.name} · ${image.size.toLocaleString()} o`,
        };
      } catch (e: any) {
        return { valeurs: [null], erreur: true, message: e?.message || traduire("msg.erreur") };
      }
    },
  },
];

export const fiches: FicheAudio[] = lecteursSvg.map(avecDoc) as FicheAudio[];
