// audio/midi-lecture-sequence.ts — Lire un fichier MIDI en séquence, une seule fois dans le dépôt.
//
// POURQUOI CETTE FONCTION EXISTE. Deux composants doivent lire un fichier MIDI en notes : celui qui
// ouvre le flux de séquence, et celui qui joue sur une banque, dont l'entrée MIDI a été demandée par
// Fabien pour raccourcir la chaîne la plus fréquente. Deux exécuteurs qui liraient chacun le format
// seraient deux lectures qui peuvent diverger, et c'est la classe de défaut que ce dépôt a passé sa
// journée à retirer : deux mises en œuvre d'une même boucle, deux règles de banque, trois pilotes.
// La lecture est donc ICI, et les deux portes l'appellent.
//
// LE NOM DIT « LECTURE », et il le faut : `midi-sequence.ts` existe déjà et rend l'inverse, une
// séquence en son. Les deux sens ne se rangent pas sous le même nom.
//
// CE QU'ELLE NE PRÉTEND PAS RENDRE. Un fichier MIDI ne porte pas de cents : les hauteurs qui en
// sortent sont entières, et le restent tant qu'un traitement ne les a pas déplacées.

import type { Sequence } from "./sequence";

export interface LectureMidi {
  /** La séquence lue, ou rien quand aucune note ne répond au canal demandé. */
  sequence: Sequence | null;
  /** Le tempo retenu : celui du fichier s'il en porte un, celui qu'on a proposé sinon. */
  tempo: number;
  /** Le nombre de canaux rencontrés parmi les notes gardées. */
  canaux: number;
  /** La fin de la dernière note, en secondes. */
  duree: number;
}

/**
 * Lit un fichier MIDI et rend ses notes.
 *
 * `canal` à moins un prend tous les canaux ensemble ; de zéro à quinze, il ne garde que celui-là.
 * C'est ce qui sépare les voix d'une partition à plusieurs voix, chacune écrite sur son canal.
 */
export async function lireMidiEnSequence(
  fichier: File, canal = -1, tempoParDefaut = 120,
): Promise<LectureMidi> {
  const { analyserMidi } = await import("./index");
  const { parseMidi } = await import("midi-file");
  const lu = parseMidi(new Uint8Array(await fichier.arrayBuffer()));
  const { notes } = analyserMidi(lu);
  const rang = Math.round(canal);
  const gardees = rang < 0 ? notes : notes.filter((n: any) => n.canal === rang);

  // LE TEMPO DU FICHIER L'EMPORTE SUR CELUI QU'ON PROPOSE : il est écrit par celui qui a produit la
  // pièce, alors que le nôtre n'est qu'un défaut pour les fichiers qui n'en portent pas.
  let tempo = tempoParDefaut;
  for (const piste of lu.tracks) {
    let trouve = false;
    for (const evt of piste) {
      if ((evt as any).type === "setTempo" && (evt as any).microsecondsPerBeat) {
        tempo = Math.round(60 / ((evt as any).microsecondsPerBeat / 1_000_000));
        trouve = true;
        break;
      }
    }
    if (trouve) break;
  }

  const duree = gardees.reduce((m: number, n: any) => Math.max(m, n.fin), 0);
  return {
    sequence: gardees.length === 0 ? null : { notes: gardees, tempo, titre: fichier.name },
    tempo,
    canaux: new Set(gardees.map((n: any) => n.canal ?? 0)).size,
    duree,
  };
}
