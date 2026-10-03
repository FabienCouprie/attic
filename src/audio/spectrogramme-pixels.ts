// audio/spectrogramme-pixels.ts — La convention d'image de Riffusion, dans les deux sens.
//
// CE QUE CE FICHIER TIENT, ET RIEN D'AUTRE : la correspondance entre un spectrogramme en mels et
// les octets d'une image. Elle compte au bit près, parce qu'une image écrite autrement ne se relit
// pas, et parce que c'est elle qui décide de ce qu'on voit. Référence :
// `riffusion/util/image_util.py` de riffusion/riffusion-hobby, sous licence MIT.
//
// QUATRE CHOSES S'Y DÉCIDENT, et chacune a sa raison dans la référence.
//
//   LA COURBE DE PUISSANCE. Le module élevé à 0,25 avant d'être écrit sur 256 niveaux. Un
//   spectrogramme a une dynamique telle qu'écrit linéairement il est noir partout sauf quelques
//   points ; la racine quatrième rend visibles les quatre-vingt-dix pour cent du bas.
//
//   LE SENS DES NIVEAUX EST INVERSÉ : le fort est sombre, le faible est blanc. C'est ce qui donne
//   des images sur fond clair, et c'est la convention que le modèle a vue à l'entraînement.
//
//   LE GRAVE EST EN BAS. L'image est retournée après écriture, de sorte que la première ligne
//   porte la bande la plus aiguë.
//
//   LA STÉRÉO EST DANS LE VERT ET LE BLEU, le rouge restant à zéro. Deux canaux dans une image, et
//   un marqueur qui se voit.
//
// CE QU'UNE IMAGE NE PORTE PAS : le niveau absolu. La référence le range dans une étiquette du
// fichier ; ici le son rendu est normalisé, ce qui revient au même puisque ce niveau ne sert qu'à
// retrouver une échelle que la normalisation refixe.

import type { PixelBuffer } from "./pixeltone";

/** L'échelle que la référence emploie faute de mieux. Le son rendu étant normalisé, elle ne décide que de l'unité. */
export const ECHELLE_RIFFUSION = 30e6;

/** Une image en mémoire, prête pour `ImageData`. */
export interface ImagePixels {
  largeur: number;
  hauteur: number;
  /** Quatre octets par point, rouge, vert, bleu, opacité. */
  rgba: Uint8ClampedArray;
}

/** Le plus grand module de tous les canaux, qui fixe le blanc de l'image. */
export function moduleMaximal(canaux: readonly (readonly Float32Array[])[]): number {
  let max = 0;
  for (const trames of canaux) {
    for (const t of trames) {
      for (let i = 0; i < t.length; i++) if (t[i] > max) max = t[i];
    }
  }
  return max;
}

/**
 * L'image d'un ou deux spectrogrammes en mels.
 *
 * Les trames sont indexées par le temps puis par la bande ; l'image par la ligne puis la colonne,
 * la ligne zéro portant la bande la plus aiguë.
 */
export function imageDepuisMel(
  canaux: readonly (readonly Float32Array[])[], puissance: number,
): ImagePixels {
  const largeur = canaux[0]?.length ?? 0;
  const hauteur = canaux[0]?.[0]?.length ?? 0;
  const rgba = new Uint8ClampedArray(largeur * hauteur * 4);
  const max = moduleMaximal(canaux) || 1;
  const stereo = canaux.length > 1;
  for (let y = 0; y < hauteur; y++) {
    const bande = hauteur - 1 - y; // le grave en bas
    for (let x = 0; x < largeur; x++) {
      const niveau = (c: number) => {
        const v = canaux[c][x]?.[bande] ?? 0;
        return 255 - (v / max) ** puissance * 255;
      };
      const i = (y * largeur + x) * 4;
      const gauche = niveau(0);
      rgba[i] = stereo ? 0 : gauche;
      rgba[i + 1] = gauche;
      rgba[i + 2] = stereo ? niveau(1) : gauche;
      rgba[i + 3] = 255;
    }
  }
  return { largeur, hauteur, rgba };
}

/**
 * Les spectrogrammes en mels que porte une image, l'inverse exact du précédent à la
 * quantification près.
 *
 * `stereo` lit le vert et le bleu plutôt que le rouge, et c'est un réglage déclaré plutôt qu'une
 * devinette : une image dont le rouge est nul SE LIRAIT comme stéréo, mais une image peinte à la
 * main peut l'être sans l'être, et une image stéréo dont le canal gauche est silencieux ne le
 * serait pas.
 */
export function melDepuisImage(
  pixels: PixelBuffer, puissance: number, stereo: boolean, echelle = ECHELLE_RIFFUSION,
): Float32Array[][] {
  const { width: largeur, height: hauteur, data } = pixels;
  const nCanaux = stereo ? 2 : 1;
  const canaux: Float32Array[][] = [];
  for (let c = 0; c < nCanaux; c++) {
    const trames: Float32Array[] = [];
    for (let x = 0; x < largeur; x++) trames.push(new Float32Array(hauteur));
    canaux.push(trames);
  }
  // Rouge pour le mono, vert puis bleu pour la stéréo : les mêmes canaux qu'à l'écriture.
  const decalages = stereo ? [1, 2] : [0];
  for (let y = 0; y < hauteur; y++) {
    const bande = hauteur - 1 - y;
    for (let x = 0; x < largeur; x++) {
      const i = (y * largeur + x) * 4;
      for (let c = 0; c < nCanaux; c++) {
        const brut = (255 - data[i + decalages[c]]) / 255;
        canaux[c][x][bande] = brut ** (1 / puissance) * echelle;
      }
    }
  }
  return canaux;
}
