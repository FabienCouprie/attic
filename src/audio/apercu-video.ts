// audio/apercu-video.ts — Entendre les sons posés pendant que le film défile.
//
// LE FILM EST L'HORLOGE, et non l'inverse. L'élément vidéo décide de l'instant ; chaque son est
// démarré par rapport à cet instant, avec le retard qui convient, ou entamé en son milieu quand le
// film est déjà passé devant son début. Faire l'inverse, mener le son et suivre avec l'image,
// demanderait de commander la vidéo image par image, ce qu'aucun lecteur ne rend possible.
//
// LES FONDUS SONT CEUX DU RENDU, à la même fonction près : `gainDeFondu`, un quart de sinus à
// puissance constante. Un aperçu qui s'entendrait autrement que le fichier produit serait pire que
// pas d'aperçu du tout, puisqu'on réglerait au son d'un mensonge.

import { gainDeFondu } from "./objets-sonores";

/** Une piste à entendre : son son, son début sur le film, son niveau et ses fondus. */
export interface PisteApercu {
  piste: number;
  son: AudioBuffer;
  debutSec: number;
  gainDb: number;
  fonduEntreeMs: number;
  fonduSortieMs: number;
}

/** Comment démarrer une source pour qu'elle tombe juste, le film étant déjà à `tempsFilm`. */
export interface Calage {
  /** Dans combien de secondes la démarrer (0 si elle est déjà en cours). */
  quand: number;
  /** À quel endroit du son commencer (0 s'il n'a pas encore commencé). */
  decalage: number;
  /** Combien de temps en jouer. */
  duree: number;
}

/**
 * Le calage d'un son sur un film déjà à `tempsFilm`, ou `null` s'il est entièrement passé.
 *
 * TROIS CAS ET PAS UN DE PLUS : le son est à venir, on attend ; le film est entré dedans, on
 * l'entame à l'endroit où l'on en est ; le film l'a dépassé, il n'y a rien à jouer. C'est ce dernier
 * cas qui compte le plus : sans lui, un déplacement de la tête de lecture vers la fin ferait
 * repartir tous les sons du début, tous ensemble.
 */
export function calerSource(debutSec: number, dureeSec: number, tempsFilm: number): Calage | null {
  const debut = Math.max(0, debutSec);
  const duree = Math.max(0, dureeSec);
  if (duree === 0) return null;
  const fin = debut + duree;
  if (tempsFilm >= fin) return null;
  if (tempsFilm <= debut) return { quand: debut - tempsFilm, decalage: 0, duree };
  const decalage = tempsFilm - debut;
  return { quand: 0, decalage, duree: duree - decalage };
}

/** Le gain linéaire d'un niveau en décibels ; à −60 dB et au-dessous, le silence. */
export const gainLineaire = (db: number): number => (db <= -60 ? 0 : Math.pow(10, db / 20));

/**
 * La courbe de gain de la portion jouée : le niveau de la piste, creusé par ses deux fondus.
 *
 * ELLE EST CALCULÉE SUR LA PORTION RÉELLEMENT JOUÉE, décalage compris : reprendre un son en son
 * milieu ne doit pas lui refaire son fondu d'entrée, qui est déjà passé.
 */
export function courbeDeGain(
  p: { gainDb: number; fonduEntreeMs: number; fonduSortieMs: number },
  dureeSonSec: number,
  decalageSec: number,
  points = 128,
): Float32Array {
  const gain = gainLineaire(p.gainDb);
  const fe = Math.max(0, p.fonduEntreeMs / 1000);
  const fs = Math.max(0, p.fonduSortieMs / 1000);
  const dureeJouee = Math.max(1e-6, dureeSonSec - Math.max(0, decalageSec));
  const courbe = new Float32Array(Math.max(2, points));
  for (let i = 0; i < courbe.length; i++) {
    const t = decalageSec + (i / (courbe.length - 1)) * dureeJouee;
    let g = gain;
    if (fe > 0 && t < fe) g *= gainDeFondu(t / fe);
    const restant = dureeSonSec - t;
    if (fs > 0 && restant < fs) g *= gainDeFondu(Math.max(0, restant) / fs);
    courbe[i] = g;
  }
  return courbe;
}
