// audio/maquette.ts — Poser des objets musicaux sur une ligne de temps.
//
// CE QU'EST UNE MAQUETTE, ET CE QU'ELLE N'EST PAS ICI. Dans OpenMusic, une maquette est un plan où
// des boîtes portent chacune un début et une durée, et où chaque boîte CALCULE sa valeur en
// connaissant sa place. Cette seconde moitié est ce que `COMPOSITION-ASSISTEE.md` donne pour le
// point le plus difficile : une boîte qui recalcule dans son contexte n'a pas d'équivalent dans un
// graphe acyclique, où une valeur remonte d'amont en aval sans jamais consulter l'aval.
//
// CE QUI EST FAIT ICI EST LA PREMIÈRE MOITIÉ, ET ELLE SE TIENT SEULE. Un bloc reçoit un début, une
// durée et une transposition ; son contenu s'y plie. La boîte ne se recalcule pas, elle S'ADAPTE :
// sa durée étire ou resserre ce qu'elle porte, ce qui est un rapport de temps et non une nouvelle
// évaluation. La différence compte et se dit : étirer une phrase de deux secondes à trois n'est pas
// la même chose que demander à un générateur d'en produire trois.
//
// L'ÉTIREMENT EST PROPORTIONNEL, DONC IL DÉPLACE TOUT ENSEMBLE. Les débuts et les durées des notes
// sont multipliés par le même facteur : un rythme garde ses rapports, et c'est la pulsation qui
// change. C'est la raison pour laquelle une écriture mesurée ne survit pas à un bloc étiré, ni à un
// bloc posé ailleurs qu'à zéro : l'arbre décrit une pièce qui commence au début, à un tempo donné.
// Rien n'est perdu pour autant, la quantification rendant une écriture au résultat.

import { dureeSequence, type Sequence } from "./sequence";
import type { Note } from "./note";

/** Une boîte de la maquette : ce qu'elle porte, et où elle est posée. */
export interface Bloc {
  sequence: Sequence;
  /** L'instant où le bloc commence, en secondes. */
  debut: number;
  /** La durée imposée, en secondes. À zéro ou absente, le bloc garde la sienne. */
  duree?: number;
  /** Le déplacement des hauteurs, en demi-tons, fractions comprises. */
  transposition?: number;
  /** Le nom de la voix quand le bloc en devient une. */
  nom?: string;
}

/** Ce qu'un bloc est devenu, pour que l'appelant puisse le dire. */
export interface BlocPose {
  rang: number;
  debut: number;
  duree: number;
  /** Le rapport entre la durée imposée et la durée propre. Un quand rien n'est étiré. */
  facteur: number;
  notes: number;
  transposition: number;
}

export interface Maquette {
  sequence: Sequence;
  blocs: BlocPose[];
}

/**
 * Pose les blocs sur la ligne de temps et rend le tout en une séquence.
 *
 * LES BLOCS SE SUPERPOSENT, ILS NE SE CHASSENT PAS. Deux boîtes qui se recouvrent sonnent ensemble,
 * comme sur un plan de montage ; rien n'est tronqué ni décalé pour faire de la place, ce qui serait
 * décider à la place de celui qui les a posées.
 *
 * CHAQUE BLOC PEUT DEVENIR UNE VOIX, et c'est le réglage qui en décide. En voix, le résultat se
 * grave sur autant de portées qu'il y a de boîtes ; sans, tout se fond en une seule ligne, ce qui
 * vaut mieux quand les boîtes se suivent sans se recouvrir.
 */
export function poserMaquette(
  blocs: readonly Bloc[], options: { enVoix?: boolean } = {},
): Maquette {
  const notes: Note[] = [];
  const poses: BlocPose[] = [];
  const infos: { numero: number; nom?: string }[] = [];
  let tempo: number | undefined;
  let fin = 0;

  blocs.forEach((bloc, rang) => {
    const propre = dureeSequence(bloc.sequence);
    // Une durée imposée n'a de sens que si le bloc en a une : un bloc vide ne s'étire pas, et
    // diviser par zéro donnerait des instants infinis plutôt qu'un message.
    const facteur = bloc.duree && bloc.duree > 0 && propre > 0 ? bloc.duree / propre : 1;
    const transposition = bloc.transposition ?? 0;
    if (tempo === undefined && bloc.sequence.tempo !== undefined) tempo = bloc.sequence.tempo;

    for (const n of bloc.sequence.notes) {
      notes.push({
        ...n,
        note: n.note + transposition,
        debut: bloc.debut + n.debut * facteur,
        fin: bloc.debut + n.fin * facteur,
        ...(options.enVoix ? { voix: rang } : {}),
      });
    }
    const duree = propre * facteur;
    fin = Math.max(fin, bloc.debut + duree);
    poses.push({ rang, debut: bloc.debut, duree, facteur, transposition, notes: bloc.sequence.notes.length });
    if (options.enVoix) infos.push({ numero: rang, nom: bloc.nom });
  });

  notes.sort((a, b) => a.debut - b.debut || (a.voix ?? 0) - (b.voix ?? 0) || a.note - b.note);
  return {
    // LA DURÉE VA JUSQU'AU BOUT DU DERNIER BLOC, et non jusqu'à sa dernière note : une boîte qui se
    // termine par un silence occupe sa place entière sur le plan.
    sequence: {
      notes, tempo, duree: Math.max(0, fin),
      ...(options.enVoix && infos.length > 0 ? { voix: infos } : {}),
    },
    blocs: poses,
  };
}
