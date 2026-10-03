// ui/notes-boite.ts — Les notes d'une boîte, dessinées dans sa barre.
//
// CE QUE CE MODULE EST À LA MAQUETTE, ET POURQUOI IL DIFFÈRE. Une piste de montage porte un son, et
// l'on en dessine l'onde ; une boîte de maquette porte des notes, et il n'y a pas d'onde à en tirer.
// La barre montrerait donc sa place et sa durée, et rien de sa matière : on poserait une boîte sans
// voir ce qu'elle contient, ce qui est exactement ce qui rendait la ligne de temps décorative.
//
// LES NOTES ARRIVENT EN FRACTIONS DE LA BOÎTE, et c'est ce qui rend le dessin juste sans qu'il ait à
// refaire le calcul de la pose. Une durée imposée étire le contenu dans un rapport unique : les
// places relatives des notes n'en bougent pas, et la barre s'étire d'autant. Une transposition
// déplace toutes les hauteurs du même intervalle : le contour n'en bouge pas non plus. La barre peut
// donc se dessiner depuis la boîte telle qu'elle est entrée, sans rien redire de `poserMaquette`.
//
// LA HAUTEUR EST RAMENÉE À L'ÉTENDUE DE LA BOÎTE, comme l'onde est ramenée à la hauteur de sa barre :
// une barre de vingt-six pixels ne peut pas porter les cent vingt-huit demi-tons du MIDI, et ce qu'on
// veut y lire est le contour de la boîte, pas son registre absolu.

/** Une note ramenée à la durée propre de sa boîte : `debut` et `duree` vont de zéro à un. */
export interface NoteBoite {
  debut: number;
  duree: number;
  /** Le numéro de note MIDI, do central à 60. */
  note: number;
}

/** Un rectangle à poser dans la barre. */
export interface RectNote {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Le nombre de notes réellement tracées.
 *
 * AU-DELÀ, UNE NOTE SUR N EST DESSINÉE. Une barre fait quelques centaines de pixels et la tête de
 * lecture provoque soixante rendus par seconde : tracer les milliers de notes d'une boîte dense
 * coûterait cher pour des rectangles qui tomberaient sur la même colonne. Le tri est régulier, donc
 * la densité et le contour restent lisibles.
 */
const MAX_TRACES = 400;

/** Les rectangles des notes d'une boîte, dans la barre qui va de `x0` à `x0 + largeur`. */
export function rectsNotes(
  notes: readonly NoteBoite[], x0: number, largeur: number, y: number, hauteur: number,
): RectNote[] {
  if (largeur <= 1 || hauteur <= 1 || notes.length === 0) return [];
  const pas = Math.ceil(notes.length / MAX_TRACES);
  const vues = pas > 1 ? notes.filter((_, i) => i % pas === 0) : notes;

  let bas = Infinity, haut = -Infinity;
  for (const n of vues) {
    if (n.note < bas) bas = n.note;
    if (n.note > haut) haut = n.note;
  }
  const etendue = haut - bas;
  // Une boîte d'une seule hauteur n'a pas d'étendue à partager : son trait prend le tiers de la barre
  // et se pose au milieu, plutôt que de remplir toute la hauteur et de passer pour un bloc plein.
  const h = Math.max(1.5, etendue > 0 ? hauteur / (etendue + 1) : hauteur / 3);

  const rects: RectNote[] = [];
  for (const n of vues) {
    // AU MOINS UN PIXEL DE LARGE : une note brève sur une boîte longue vaut moins qu'un pixel, et
    // elle disparaîtrait du dessin alors qu'elle sonne.
    const w = Math.max(1, Math.min(n.duree * largeur, largeur));
    const x = Math.min(x0 + Math.max(0, Math.min(1, n.debut)) * largeur, x0 + largeur - w);
    // La plus haute en haut de la barre, la plus basse en bas.
    const yy = etendue > 0
      ? y + ((haut - n.note) / etendue) * (hauteur - h)
      : y + (hauteur - h) / 2;
    rects.push({ x, y: yy, w, h });
  }
  return rects;
}
