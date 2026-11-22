// audio/corpus.ts — Un corpus : des pièces à voix, chacune avec sa source et sa tonalité lue.
//
// CE QUI MANQUAIT. Aucun flux ne portait plusieurs séquences : une boucle par créneaux les fondait en
// une seule, une boucle de collection n'écrivait que du son. Apprendre une harmonie demande des
// pièces séparées, chacune avec ses voix, et de quoi les ramener à une même tonalité.
//
// UNE PIÈCE GARDE SES VOIX DANS SA SÉQUENCE, voix par voix (`Note.voix` et `Sequence.voix`), comme
// toute séquence du dépôt. Le corpus n'ajoute que ce qui vaut pour la pièce entière : d'où elle vient,
// et dans quelle tonalité elle est, quand on l'a lue.
//
// CE MODULE EST PUR : la tonalité se lit ailleurs (`audio/corpus-tonalite.ts`), parce que son calcul
// passe par `audio/accords.ts`, qui touche à `AudioBuffer`.

import { estSequence, type Sequence } from "./sequence";

/** Le mode d'une tonalité lue. */
export type ModeLu = "majeur" | "mineur";

/** Une tonalité, et d'où on la tient. */
export interface TonaliteLue {
  /** Classe de hauteur de la tonique, 0 = do. */
  tonique: number;
  mode: ModeLu;
  /** `armure` : écrite dans la pièce ; `notes` : estimée sur les durées par classe de hauteur. */
  origine: "armure" | "notes";
}

/** Une pièce du corpus. */
export interface PieceDuCorpus {
  sequence: Sequence;
  /** Le fichier lu, ou le nom donné à la pièce fabriquée. */
  source: string;
  tonalite: TonaliteLue | null;
}

/** Un corpus : des pièces dans un ordre fixe, celui de la lecture ou de la fabrication. */
export interface Corpus {
  pieces: PieceDuCorpus[];
}

export function estCorpus(valeur: unknown): valeur is Corpus {
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return false;
  const pieces = (valeur as Corpus).pieces;
  return Array.isArray(pieces) && pieces.every((p) =>
    !!p && typeof p === "object" && typeof p.source === "string" && estSequence(p.sequence)
    && (p.tonalite === null || (typeof p.tonalite === "object" && Number.isInteger(p.tonalite.tonique))));
}

/** Le nombre de voix d'une pièce, lu sur ses notes. */
export function voixDeLaPiece(p: PieceDuCorpus): number {
  return new Set(p.sequence.notes.map((n) => n.voix ?? 0)).size;
}
