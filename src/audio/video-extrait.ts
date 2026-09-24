// audio/video-extrait.ts — La portion de film que l'on garde, et ce qu'elle coûte en vérité.
//
// LES BORNES SE COMPTENT EN IMAGES, comme pour le montage : c'est ainsi qu'on désigne un plan. La
// conversion, elle, ne connaît que les secondes, et la traduction passe par la cadence déclarée par
// le fichier. À 29,97 images par seconde, l'image mille tombe à 33,3667 s et non à 33,3333.
//
// UNE FIN QUI NE DÉPASSE PAS LE DÉBUT SIGNIFIE LA FIN DU FILM. C'est ce qui rend le composant
// utilisable dès sa pose, ses deux bornes valant zéro : l'extrait est alors le film entier, et l'on
// resserre ensuite.

/** La portion demandée, traduite pour la conversion. */
export interface PlageExtrait {
  debutSec: number;
  finSec: number;
  /** Le nombre d'images gardées, tel qu'on le lit à l'écran. */
  images: number;
}

/**
 * La portion à garder, bornée au film.
 *
 * L'ordre des deux bornes n'est pas une erreur à signaler : une fin antérieure au début désigne la
 * fin du film, et c'est le cas d'un composant qu'on vient de poser.
 */
export function plageExtrait(
  imageDebut: number,
  imageFin: number,
  cadence: number,
  dureeFilm: number,
): PlageExtrait {
  const duree = Math.max(0, dureeFilm);
  const c = cadence > 0 ? cadence : 25;
  const derniere = Math.max(0, Math.floor(duree * c));
  const d = Math.min(Math.max(Math.round(imageDebut), 0), derniere);
  const f = Math.round(imageFin);
  const fin = f > d ? Math.min(f, derniere) : derniere;
  const debutSec = Math.min(d / c, duree);
  const finSec = Math.min(fin / c, duree);
  return { debutSec, finSec, images: Math.max(0, fin - d) };
}

/** Le temps tel qu'on le lit sur un film : minutes, secondes, centièmes. */
export function formatDuree(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const reste = s - m * 60;
  return `${m}:${reste < 10 ? "0" : ""}${reste.toFixed(2)}`;
}
