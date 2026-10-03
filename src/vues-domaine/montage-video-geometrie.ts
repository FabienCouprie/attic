// ui/montage-video-geometrie.ts — Où tombe un son sur l'axe d'un film, et l'inverse.
//
// PUR, ET SÉPARÉ DE LA VUE, parce que c'est là qu'une erreur ne se voit pas. Une bande dessinée dix
// pixels trop à droite ressemble à une bande ; un son posé à l'image 1 000 au lieu de 999 ressemble
// à un son posé. Ce qui se vérifie ici, l'œil ne le vérifie pas.
//
// L'AXE EST CELUI DU FILM, du premier au dernier instant, et il ne s'étire pas au contenu : c'est
// le film qui commande la durée de la sortie, et une bande qui dépasse sa fin sera coupée.

/** Une colonne d'enveloppe, comme le visualiseur multipiste les garde. */
export interface ColonneVue { min: number; max: number }

/** Une piste posée sur le film : son rang, son début, sa durée, et de quoi la dessiner. */
export interface BandeVue {
  piste: number;
  debutSec: number;
  dureeSec: number;
  crete?: number;
  colonnes?: ColonneVue[];
}

/** La place d'une bande dans la zone de dessin. */
export interface RectBande {
  x: number;
  largeur: number;
  /** La bande dépasse la fin du film : ce qui dépasse sera coupé au rendu. */
  deborde: boolean;
}

/**
 * Où commence et où finit une bande, en pixels, sur l'axe du film.
 *
 * `largeurMini` EST CE QUI REND UNE BANDE SAISISSABLE. Tant qu'une piste n'a pas été exécutée, sa
 * durée est inconnue : sa bande vaudrait un pixel, qu'aucune souris ne trouve. Elle devient alors un
 * repère de début, assez large pour être pris et déplacé.
 */
export function rectDeBande(
  bande: { debutSec: number; dureeSec: number },
  dureeFilm: number,
  x0: number,
  largeurUtile: number,
  largeurMini = 1,
): RectBande {
  const duree = Math.max(dureeFilm, 1e-9);
  const debut = Math.max(0, bande.debutSec);
  const fin = debut + Math.max(0, bande.dureeSec);
  const x = x0 + (Math.min(debut, duree) / duree) * largeurUtile;
  const xFin = x0 + (Math.min(fin, duree) / duree) * largeurUtile;
  return { x, largeur: Math.max(largeurMini, xFin - x), deborde: fin > duree + 1e-9 };
}

/** L'instant du film que désigne une abscisse, borné au film. */
export function secondesDepuisX(x: number, x0: number, largeurUtile: number, dureeFilm: number): number {
  if (!(largeurUtile > 0)) return 0;
  const t = ((x - x0) / largeurUtile) * dureeFilm;
  return Math.min(Math.max(t, 0), dureeFilm);
}

/**
 * L'image où tombe un instant, bornée au film.
 *
 * L'ARRONDI EST CELUI DE L'IMAGE LA PLUS PROCHE, et non la troncature : un déplacement à la souris
 * tombe entre deux images une fois sur deux, et tronquer reculerait systématiquement d'une image.
 */
export function imageDepuisSecondesCalee(sec: number, cadence: number, dureeFilm: number): number {
  if (!(cadence > 0)) return 0;
  const derniere = Math.max(0, Math.floor(dureeFilm * cadence));
  return Math.min(Math.max(Math.round(sec * cadence), 0), derniere);
}

/** Le temps tel qu'on le lit sur un film : minutes, secondes, centièmes. */
export function formatTemps(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const reste = s - m * 60;
  return `${m}:${reste < 10 ? "0" : ""}${reste.toFixed(2)}`;
}

/**
 * Le déplacement d'une bande, en images, depuis le point pris et le point où l'on relâche.
 *
 * ON DÉPLACE DEPUIS L'ENDROIT OÙ L'ON A PRIS LA BANDE, et non depuis son début : saisir une bande
 * en son milieu et la voir sauter pour aligner son début sous le curseur est la façon la plus sûre
 * de perdre le calage qu'on venait de trouver.
 */
export function imageApresDeplacement(
  debutSecInitial: number,
  xPrise: number,
  xCourant: number,
  x0: number,
  largeurUtile: number,
  dureeFilm: number,
  cadence: number,
): number {
  const ecartSec = secondesDepuisX(xCourant, x0, largeurUtile, dureeFilm)
    - secondesDepuisX(xPrise, x0, largeurUtile, dureeFilm);
  return imageDepuisSecondesCalee(debutSecInitial + ecartSec, cadence, dureeFilm);
}
