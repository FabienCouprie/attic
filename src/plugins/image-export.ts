// plugins/image-export.ts — Nœud « Export image » : sauvegarde un fichier image
// reçu sur son entrée dans le répertoire de travail et retourne le chemin.
// Nécessite Electron.
//
// LES OCTETS PARTENT TELS QUELS, ET L'EXTENSION DIT LEUR FORMAT. Le nœud écrivait `.png` tout ce
// qui n'était ni `image/png` ni `image/jpeg` : un WebP, un GIF, un BMP ou un SVG sortait sous une
// extension que ses octets démentaient. Fabien a choisi le 2026-11-16 de garder le format d'origine
// avec sa vraie extension, plutôt que de convertir en PNG par un canevas : rien ne se perd, ni
// l'animation d'un GIF ni le vectoriel d'un SVG, et l'écriture ne demande pas de navigateur.
//
// LE FORMAT SE LIT SUR LES OCTETS, JAMAIS SUR `File.type`. Le type d'un fichier est une étiquette
// posée par qui l'a fabriqué, et une étiquette a déjà menti ici : une image rechargée avec son
// projet s'est longtemps dite JPEG quoi qu'elle fût. `core/type-image.ts` lit la signature.
//
// UN FORMAT SANS SIGNATURE CONNUE GARDE LE NOM SAISI. Lui donner une extension choisie d'avance
// nommerait un format qu'on ne connaît pas ; le nom saisi est au moins celui qu'on a voulu.
import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { cheminDansTravail } from "./pont-electron";
import { typeImageDeLExtension, typeImageDesOctets, type TypeImage } from "../core/type-image";

/** L'extension que reçoit chaque format reconnu sur ses octets. */
const EXTENSION_PAR_TYPE: Readonly<Record<Exclude<TypeImage, "">, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/**
 * Le nom du fichier à écrire : le nom saisi, privé de son extension d'image s'il en porte une,
 * suivi de l'extension du format que disent les octets.
 *
 * L'extension retirée est toute extension d'image connue, et non les seules `.png`, `.jpg` et
 * `.jpeg` : `photo.webp` saisi pour un GIF donne `photo.gif`, et non `photo.webp.gif`.
 */
export function nomAvecExtension(nom: string, octets: Uint8Array): string {
  const type = typeImageDesOctets(octets);
  if (!type) return nom;
  const base = typeImageDeLExtension(nom) ? nom.replace(/\.[^./\\]+$/, "") : nom;
  return `${base}.${EXTENSION_PAR_TYPE[type]}`;
}

export const fiches: FicheAudio[] = ([
  fiche({
    id: "export-image",
    nom: "Export image",
    nomEn: "Image Export",
    univers: "Sorties",
    famille: "Export",
    resume: "Sauvegarde une image sur disque et retourne son chemin.",
    resumeEn: "Saves an image to disk and returns its path.",
    entrees: [{ nom: "Image", type: "image" }],
    sorties: [{ nom: "Chemin", nomEn: "Path", type: "texte" }],
    parametres: [
      {
        nom: "Nom",
        nomEn: "Name",
        type: "texte",
        defaut: "export.png",
        doc: "Nom du fichier écrit dans le répertoire de travail. L'extension d'image qu'il porte est remplacée par celle du format que disent les octets de l'image : .png, .jpg, .webp, .gif, .bmp, .avif ou .svg. Une image dont le format n'est pas reconnu est écrite sous ce nom, inchangé.",
        docEn: "Name of the file written to the working directory. An image extension it carries is replaced by the one of the format the image bytes carry: .png, .jpg, .webp, .gif, .bmp, .avif or .svg. An image whose format is not recognized is written under this name, unchanged.",
      },
    ],
    async executer(ctx) {
      const api = (window as any).api;
      if (!api?.ecrireFichier) {
        return { valeurs: [null], message: traduire("msg.n_cessite_electron") };
      }

      const image = ctx.entree(0);
      if (!(image instanceof File)) {
        return { valeurs: [null], message: traduire("msg.connecter.image") };
      }

      const bytes = new Uint8Array(await image.arrayBuffer());
      const nom = ctx.paramTexte("Nom", "export.png");
      const nomFinal = nomAvecExtension(nom, bytes);
      const cible = cheminDansTravail(ctx.repertoireTravail, nomFinal);
      if (!cible.ok) return { valeurs: [null], erreur: true, message: cible.message };
      const chemin = cible.chemin;

      const ecrit = await api.ecrireFichier(chemin, bytes);
      if (!ecrit) {
        return { valeurs: [null], message: traduire("msg.export_image.ecriture_impossible") };
      }

      return {
        valeurs: [chemin],
        message: traduire("msg.export_image.termine", nomFinal),
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);
