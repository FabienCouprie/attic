// audio/corpus-fichier.ts — Un corpus en un fichier JSON : celui qu'Attic livre, et qu'il relit.
//
// UN SEUL FICHIER ET NON TROIS CENT SOIXANTE ET UN, pour la même raison que les modèles : il entre au
// manifeste avec une empreinte, se publie sur la release `assets` et se récupère par le panneau des
// modèles. Une table par choral multiplierait les occasions d'en perdre une.
//
// LES TEMPS SONT EN NOIRES, et la séquence relue est à 60 à la noire : une noire vaut une seconde.
// Une hauteur est un entier MIDI ; une note est `[début, durée, voix, hauteur]`.

import type { Corpus, PieceDuCorpus, TonaliteLue } from "./corpus";
import type { Note } from "./note";

/** Ce que le fichier dit de lui-même, à côté des pièces. */
export interface EnteteCorpus {
  nom: string;
  source: string;
  licence: string;
  /** Les notes changées, une ligne par note : `[pièce, voix, noire, avant, après]`. */
  corrections?: [string, number, number, number, number][];
  /** Les pièces livrées sans vérification, chacune avec sa raison. */
  nonVerifiees?: { source: string; raison: string }[];
}

interface PieceEcrite {
  source: string;
  metrique?: string;
  tonalite: TonaliteLue | null;
  voix: string[];
  notes: [number, number, number, number][];
}

interface FichierCorpus extends EnteteCorpus {
  format: "attic-corpus";
  version: 1;
  pieces: PieceEcrite[];
}

const arrondi = (x: number) => Math.round(x * 1e6) / 1e6;

/** Écrit un corpus. Les temps des séquences sont lus à leur tempo, et ramenés en noires. */
export function corpusVersJson(corpus: Corpus, entete: EnteteCorpus, metriques: Map<string, string> = new Map()): string {
  const fichier: FichierCorpus = {
    format: "attic-corpus", version: 1, ...entete,
    pieces: corpus.pieces.map((p) => {
      const noire = 60 / (p.sequence.tempo && p.sequence.tempo > 0 ? p.sequence.tempo : 60);
      const nVoix = Math.max(0, ...p.sequence.notes.map((n) => (n.voix ?? 0) + 1));
      return {
        source: p.source,
        ...(metriques.has(p.source) ? { metrique: metriques.get(p.source) } : {}),
        tonalite: p.tonalite,
        voix: Array.from({ length: nVoix }, (_, v) => p.sequence.voix?.find((x) => x.numero === v)?.nom ?? ""),
        notes: p.sequence.notes.map((n) => [arrondi(n.debut / noire), arrondi((n.fin - n.debut) / noire), n.voix ?? 0, Math.round(n.note)]),
      };
    }),
  };
  return JSON.stringify(fichier);
}

/** Ce qu'un fichier de corpus relu rend : les pièces, et ce que le fichier dit de lui-même. */
export interface CorpusRelu {
  corpus: Corpus;
  entete: EnteteCorpus;
  metriques: Map<string, string>;
}

/** Relit un corpus écrit par `corpusVersJson`. Lève, en le disant, sur tout autre texte. */
export function corpusDepuisJson(texte: string): CorpusRelu {
  const f = JSON.parse(texte) as Partial<FichierCorpus>;
  if (f.format !== "attic-corpus" || f.version !== 1 || !Array.isArray(f.pieces)) {
    throw new Error("ce fichier n'est pas un corpus d'Attic, version 1");
  }
  const metriques = new Map<string, string>();
  const pieces: PieceDuCorpus[] = f.pieces.map((p) => {
    if (p.metrique) metriques.set(p.source, p.metrique);
    const notes: Note[] = p.notes.map(([debut, duree, voix, note]) => ({ note, velocite: 80, debut, fin: debut + duree, voix }));
    return {
      source: p.source,
      tonalite: p.tonalite ?? null,
      sequence: { notes, tempo: 60, titre: p.source, voix: p.voix.map((nom, numero) => ({ numero, ...(nom ? { nom } : {}) })) },
    };
  });
  const { nom = "", source = "", licence = "", corrections, nonVerifiees } = f;
  return { corpus: { pieces }, entete: { nom, source, licence, ...(corrections ? { corrections } : {}), ...(nonVerifiees ? { nonVerifiees } : {}) }, metriques };
}
