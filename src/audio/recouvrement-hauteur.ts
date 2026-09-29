// audio/recouvrement-hauteur.ts — Deux notes de même hauteur qui se recouvrent, et ce qu'on en fait.
//
// POURQUOI CE MODULE EXISTE. Le banc de conformité MIDI a relevé sept composants qui empilent deux
// notes de MÊME HAUTEUR sur un MÊME CANAL, avec recouvrement dans le temps. C'est ambigu au sens de
// la norme : un canal n'a qu'une voix par hauteur, donc un lecteur conforme relance la note au
// second `noteOn` et le PREMIER `noteOff` éteint tout. Le lecteur de l'application, lui, retrouve
// chaque note posée et les tient toutes.
//
// CE QUE CELA COÛTE, MESURÉ. L'export ne sonne pas comme ce qu'on entend : 24,683 s de durée
// sonnante contre 20,569 s pour l'arpège de Koch, 4,200 contre 10,500 pour l'automate cellulaire,
// 2,473 contre 2,267 pour la boîte à groove, et neuf des trente-six notes de l'écho tombent à durée
// nulle chez un lecteur conforme.
//
// LA RÉSOLUTION SE FAIT SUR LES NOTES, AVANT LE FICHIER ET AVANT LE RENDU. C'est le seul endroit où
// elle supprime l'écart au lieu de le déplacer : résoudre dans le seul fichier rendrait celui-ci
// sans ambiguïté, mais l'application continuerait de jouer autre chose, et l'écart demeurerait.
//
// DEUX CAS, ET DEUX SEULEMENT. Deux notes de même hauteur qui commencent au MÊME instant sont une
// seule note écrite deux fois : elles n'en font plus qu'une, qui va jusqu'à la plus lointaine des
// deux fins. Deux notes qui se chevauchent sans commencer ensemble sont deux notes distinctes : la
// première s'arrête là où la seconde commence, ce que fera de toute façon un lecteur conforme.

/** Ce qu'il faut d'une note pour décider : sa hauteur, son canal, son début, sa fin. */
export interface NoteRecouvrable {
  note: number;
  debut: number;
  fin: number;
  canal?: number;
}

/** La clé d'une voix : une hauteur sur un canal. C'est là, et là seulement, que l'ambiguïté naît. */
const voix = (n: NoteRecouvrable) => `${n.canal ?? 0}:${Math.round(n.note)}`;

/**
 * Les mêmes notes, sans deux de même hauteur qui se recouvrent sur un même canal.
 *
 * L'ORDRE D'ENTRÉE EST RENDU, et il le faut : plusieurs composants comptent sur la place d'une note
 * dans la liste pour lui associer autre chose, une voix gravée ou une couleur. Le tri ne sert qu'à
 * décider, il ne sort pas d'ici.
 */
export function sansRecouvrementDeHauteur<T extends NoteRecouvrable>(notes: readonly T[]): T[] {
  return resoudre(notes).notes;
}

/** Ce que la résolution a fait, pour qu'un composant puisse le dire au lieu de raccourcir en silence. */
export interface Resolution<T> {
  notes: T[];
  /** Des notes écrites deux fois au même instant, réunies en une. */
  fondues: number;
  /** Des notes arrêtées là où la suivante de même hauteur commence. */
  tronquees: number;
}

export function resoudre<T extends NoteRecouvrable>(notes: readonly T[]): Resolution<T> {
  const parVoix = new Map<string, number[]>();
  notes.forEach((n, i) => {
    const k = voix(n);
    const l = parVoix.get(k);
    if (l) l.push(i);
    else parVoix.set(k, [i]);
  });

  const fins = notes.map((n) => n.fin);
  const fondues = new Set<number>();

  for (const indices of parVoix.values()) {
    if (indices.length < 2) continue;
    const ordre = [...indices].sort((a, b) => notes[a].debut - notes[b].debut || notes[a].fin - notes[b].fin);
    for (let i = 0; i < ordre.length - 1; i++) {
      const a = ordre[i];
      if (fondues.has(a)) continue;
      const b = ordre[i + 1];
      if (fins[a] <= notes[b].debut) continue;
      if (notes[a].debut === notes[b].debut) {
        // Même hauteur, même instant : une seule note, qui va jusqu'à la plus lointaine des fins.
        fins[b] = Math.max(fins[a], fins[b]);
        fondues.add(a);
      } else {
        fins[a] = notes[b].debut;
      }
    }
  }

  const sortie: T[] = [];
  let tronquees = 0;
  notes.forEach((n, i) => {
    if (fondues.has(i)) return;
    if (fins[i] === n.fin) sortie.push(n);
    else { tronquees++; sortie.push({ ...n, fin: fins[i] }); }
  });
  return { notes: sortie, fondues: fondues.size, tronquees };
}
