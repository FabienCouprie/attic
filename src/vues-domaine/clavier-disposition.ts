// ui/clavier-disposition.ts — La géométrie d'un clavier de piano, et où l'on clique.
//
// Le clavier du nœud « Clavier mélodie » dessinait bien des touches noires, mais ne les
// jouait pas : le test de position ne parcourait que les blanches — `Math.floor(x /
// largeur)` sur la seule liste des blanches — et les touches noires n'avaient aucun
// gestionnaire. Cliquer un dièse jouait la blanche en dessous, et aucune altération
// n'était atteignable à la souris.
//
// La géométrie vit donc ici, hors du composant : c'est elle qui décide quelle touche est
// sous le curseur, et c'est testable.

/** Un clavier de piano complet, comme sur un 88 touches : de La0 à Do8. */
export const NOTE_MIN = 21;
export const NOTE_MAX = 108;

/** Les cinq degrés altérés d'une octave. */
const NOIRES = new Set([1, 3, 6, 8, 10]);

export function estNoire(note: number): boolean {
  return NOIRES.has(((note % 12) + 12) % 12);
}

/**
 * Le nom d'usage d'une note MIDI — 60 → « C4 » —, et son écart au tempérament s'il y en a un.
 *
 * Le calcul vit dans `audio/nom-note.ts`, où il est écrit une seule fois : il était recopié ici, et
 * dans deux modules audio qui n'ont rien à voir avec un clavier. Réexporté pour que les appels
 * d'ici gardent leur adresse.
 */
export { nomNote } from "../audio/nom-note";

export interface Touche {
  note: number;
  /** Bord gauche, en pixels depuis le début du clavier. */
  x: number;
  largeur: number;
  noire: boolean;
}

export interface DispositionClavier {
  blanches: Touche[];
  noires: Touche[];
  largeurTotale: number;
  largeurBlanche: number;
}

/** Le nombre de blanches d'un clavier de quatre-vingt-huit touches, du la0 au do8. */
export const BLANCHES_88 = 52;

/** En deçà, une blanche n'est plus une touche mais un trait : la noire y ferait 6 px. */
export const LARGEUR_BLANCHE_MIN = 8;

/**
 * La largeur de blanche qui fait tenir tout le clavier dans la place offerte.
 *
 * LES QUATRE-VINGT-HUIT TOUCHES SE VOIENT D'UN COUP, ET C'EST TOUT L'OBJET. À vingt-quatre pixels
 * la blanche, le clavier en fait mille deux cent quarante-huit, quand les nœuds qui le portent en
 * font cinq cents : on n'en voyait que le tiers, et il fallait le faire défiler pour trouver une
 * note. Demandé par Fabien, pour l'œil.
 *
 * En deçà de la largeur minimale, le clavier déborde encore et le défilement reprend son rôle :
 * mieux vaut un clavier qui dépasse qu'un clavier dont les touches ne se distinguent plus.
 */
export function largeurBlanchePour(largeurDisponible: number, blanches = BLANCHES_88): number {
  if (!Number.isFinite(largeurDisponible) || largeurDisponible <= 0 || blanches <= 0) {
    return LARGEUR_BLANCHE_MIN;
  }
  return Math.max(LARGEUR_BLANCHE_MIN, Math.floor(largeurDisponible / blanches));
}

/**
 * Place les touches d'un intervalle de notes.
 *
 * Les blanches se suivent à touche-touche ; chaque noire est centrée sur la frontière
 * entre les deux blanches qui l'encadrent — c'est ce que fait un vrai clavier, et c'est
 * ce qui rend le test de position juste.
 */
export function disposition(
  noteMin = NOTE_MIN,
  noteMax = NOTE_MAX,
  largeurBlanche = 24,
): DispositionClavier {
  const blanches: Touche[] = [];
  const noires: Touche[] = [];
  const largeurNoire = Math.max(6, Math.round(largeurBlanche * 0.6));

  for (let note = noteMin; note <= noteMax; note++) {
    if (estNoire(note)) continue;
    blanches.push({ note, x: blanches.length * largeurBlanche, largeur: largeurBlanche, noire: false });
  }
  for (let note = noteMin; note <= noteMax; note++) {
    if (!estNoire(note)) continue;
    // La blanche immédiatement à gauche : la noire chevauche sa frontière droite.
    const gauche = blanches.find((b) => b.note === note - 1);
    if (!gauche) continue; // un intervalle qui commence sur une noire n'en affiche pas
    noires.push({
      note,
      x: gauche.x + largeurBlanche - largeurNoire / 2,
      largeur: largeurNoire,
      noire: true,
    });
  }
  return {
    blanches,
    noires,
    largeurBlanche,
    largeurTotale: blanches.length * largeurBlanche,
  };
}

/**
 * La touche sous un point — les noires d'abord, et seulement dans leur hauteur.
 *
 * C'est tout l'objet de ce module : une noire est physiquement au-dessus de deux
 * blanches, donc elle l'emporte tant que le doigt est dans sa partie haute ; plus bas,
 * c'est la blanche qui répond, comme sur un vrai clavier où l'on joue les blanches entre
 * les dièses.
 */
export function noteALaPosition(
  x: number,
  y: number,
  hauteur: number,
  d: DispositionClavier,
  proportionNoire = 0.62,
): number | null {
  if (x < 0 || x > d.largeurTotale || y < 0 || y > hauteur) return null;
  if (y <= hauteur * proportionNoire) {
    for (const n of d.noires) {
      if (x >= n.x && x < n.x + n.largeur) return n.note;
    }
  }
  const idx = Math.floor(x / d.largeurBlanche);
  const blanche = d.blanches[idx];
  return blanche ? blanche.note : null;
}
