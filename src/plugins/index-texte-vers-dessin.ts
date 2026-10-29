// plugins/index-texte-vers-dessin.ts — Les composants qui tirent une image d'un texte.
//
// POURQUOI CE REGROUPEMENT. `index.ts` est en dette de taille, inscrite dans
// `docs/generer-compte-lignes.test.ts`, et ne peut plus grossir : ce qu'on ajoute à un fichier trop
// gros va ailleurs. « Texte → image (MOSS) » y entre donc par ce module, qui prend la place de la
// ligne de « Texte → image » et garde l'ordre du registre.
import { fiches as texteImage } from "./texte-image";
import { fiches as texteImageMoss } from "./texte-image-moss";

export const fiches = [...texteImage, ...texteImageMoss];
