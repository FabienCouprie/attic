// audio/repartition-midi.ts — Un fichier MIDI, plusieurs instruments.
//
// LE PROBLÈME. « Sampler multi-zones » joue un MIDI avec UNE banque. Un arrangement, lui, tient
// dans un seul fichier à plusieurs canaux : la mélodie sur l'un, les accords sur un autre, la basse
// sur un troisième, la batterie sur le dixième. Jouer ce fichier tel quel envoyait les quatre
// parties dans la même banque — un piano qui joue aussi la grosse caisse, deux octaves trop haut.
// Les notes portaient bien leur canal depuis toujours (`NoteMidi.canal`), mais rien ne s'en servait.
//
// CE QUE FAIT CE MODULE. Il inventorie ce qu'un fichier contient — quels canaux, quelles pistes,
// combien de notes chacun —, décide de la répartition, et découpe. Le découpage lui-même existait
// déjà (`filtrerCanauxMidi`, testé) ; ce qui manquait était de savoir QUOI découper, et de le dire.
//
// DEUX CONVENTIONS QUI VIENNENT DE LA NORME, pas de nous :
//
//  · LE CANAL 10 EST LA BATTERIE. Le General MIDI le réserve aux percussions, où le numéro de note
//    ne désigne pas une hauteur mais un instrument — 36 grosse caisse, 38 caisse claire, 42 charley.
//    C'est pourquoi la batterie part TOUJOURS sur la dernière partie : elle demande une banque d'un
//    autre genre, un kit, où une touche est un son et non une hauteur.
//  · LES CANAUX SE COMPTENT DE 1 À 16 pour qui les lit, de 0 à 15 dans les octets. Les paramètres du
//    nœud parlent la langue de l'utilisateur, et la conversion se fait ici, une fois.
import { parseMidi, writeMidi } from "midi-file";

/** Le canal de percussion du General MIDI, en numérotation humaine. */
export const CANAL_BATTERIE_HUMAIN = 10;
/** Le même, tel qu'il est écrit dans les octets. */
export const CANAL_BATTERIE = CANAL_BATTERIE_HUMAIN - 1;

export interface InventairePiste {
  /** Index de la piste dans le fichier, à partir de 1 pour qui le lit. */
  numero: number;
  nom: string;
  canaux: number[];
  notes: number;
}

export interface InventaireMidi {
  /** Canal (0–15) → nombre de notes. Les canaux muets n'y figurent pas. */
  parCanal: Map<number, number>;
  pistes: InventairePiste[];
  notesTotal: number;
}

type MidiAnalyse = ReturnType<typeof parseMidi>;

/**
 * Ce qu'un fichier MIDI contient réellement.
 *
 * On compte les `noteOn` de vélocité non nulle : c'est la seule façon fiable de savoir si un canal
 * joue. Un `programChange` sur un canal muet ne prouve rien — les exportateurs en posent sur les
 * seize canaux —, et se fier à lui remplissait les parties avec du silence.
 */
export function inventaireMidi(midi: MidiAnalyse): InventaireMidi {
  const parCanal = new Map<number, number>();
  const pistes: InventairePiste[] = [];
  let notesTotal = 0;
  midi.tracks.forEach((piste, index) => {
    const canauxPiste = new Set<number>();
    let notes = 0;
    let nom = "";
    for (const evt of piste as any[]) {
      if (evt.type === "trackName" && !nom) nom = String(evt.text ?? "").trim();
      if (evt.type === "noteOn" && evt.velocity > 0) {
        notes++;
        notesTotal++;
        canauxPiste.add(evt.channel);
        parCanal.set(evt.channel, (parCanal.get(evt.channel) ?? 0) + 1);
      }
    }
    if (notes > 0) {
      pistes.push({ numero: index + 1, nom, canaux: [...canauxPiste].sort((a, b) => a - b), notes });
    }
  });
  return { parCanal, pistes, notesTotal };
}

/**
 * Répartit les canaux qui jouent sur `nbParties` sorties.
 *
 * LA RÈGLE, ÉCRITE ICI PARCE QU'ELLE DOIT ÊTRE PRÉVISIBLE : la batterie — canal 10 — prend la
 * DERNIÈRE partie, parce qu'elle seule demande une banque de type kit. Les autres canaux remplissent
 * les parties restantes dans l'ordre de leur numéro, un canal par partie. Ce qui ne tient pas va
 * dans le reste, qui est une sortie comme les autres : rien n'est perdu en silence.
 *
 * On ne trie pas par hauteur moyenne pour deviner une basse d'un chant : cela marche une fois sur
 * deux et surprend l'autre fois, alors que l'ordre des canaux est celui que l'auteur du fichier a
 * choisi.
 */
export function repartirCanaux(
  inventaire: InventaireMidi, nbParties: number,
): { parties: number[][]; reste: number[] } {
  const qui = [...inventaire.parCanal.keys()].sort((a, b) => a - b);
  const parties: number[][] = Array.from({ length: Math.max(1, nbParties) }, () => []);
  const batterie = qui.includes(CANAL_BATTERIE);
  const melodiques = qui.filter((c) => c !== CANAL_BATTERIE);
  if (batterie) parties[parties.length - 1].push(CANAL_BATTERIE);
  // Les parties libres : toutes, sauf la dernière quand la batterie l'occupe.
  const libres = batterie ? parties.slice(0, -1) : parties;
  const reste: number[] = [];
  melodiques.forEach((canal, i) => {
    if (i < libres.length) libres[i].push(canal);
    else reste.push(canal);
  });
  return { parties, reste };
}

/**
 * Une liste de canaux écrite à la main : « 1,2 », « 1-3 », « 1, 3-5 », vide.
 *
 * En numérotation HUMAINE en entrée (1–16), rendue en numérotation d'octets (0–15). Les numéros hors
 * bornes sont écartés en silence : il vaut mieux une partie muette qu'un canal 17 qui filtre tout.
 */
export function analyserListeCanaux(texte: string): number[] {
  const vus = new Set<number>();
  for (const morceau of String(texte ?? "").split(/[,;\s]+/)) {
    if (!morceau) continue;
    const plage = /^(\d+)\s*[-–]\s*(\d+)$/.exec(morceau);
    if (plage) {
      const a = Number(plage[1]), b = Number(plage[2]);
      for (let c = Math.min(a, b); c <= Math.max(a, b); c++) {
        if (c >= 1 && c <= 16) vus.add(c - 1);
      }
      continue;
    }
    const n = Number(morceau);
    if (Number.isInteger(n) && n >= 1 && n <= 16) vus.add(n - 1);
  }
  return [...vus].sort((a, b) => a - b);
}

/** La même liste, écrite pour être lue — numérotation humaine. */
export const listeCanauxHumaine = (canaux: readonly number[]): string =>
  canaux.map((c) => c + 1).join(", ");

/**
 * Ne garde que certaines PISTES d'un fichier MIDI.
 *
 * Le pendant de `filtrerCanauxMidi`, pour les fichiers dont les parties sont séparées par pistes et
 * non par canaux — c'est le cas de tout ce qui sort d'un logiciel de notation, où les quatre voix
 * d'un chœur peuvent partager le canal 1. La PREMIÈRE piste d'un fichier de format 1 ne porte que le
 * tempo et la mesure : elle est donc toujours conservée, faute de quoi la partie découpée jouerait à
 * 120 BPM par défaut au lieu du tempo du morceau.
 */
export function filtrerPistesMidi(bytes: Uint8Array, pistes: readonly number[]): Uint8Array {
  const midi = parseMidi(bytes);
  const gardees = new Set(pistes);
  const tracks = midi.tracks.map((piste, index) => {
    const numero = index + 1;
    if (gardees.has(numero)) return piste;
    // Une piste écartée garde ce qui vaut pour tout le fichier — tempo, mesure, fin de piste — et
    // perd ses notes. Supprimer la piste entière décalerait la numérotation des autres.
    return (piste as any[]).filter((evt) =>
      evt.type === "setTempo" || evt.type === "timeSignature" || evt.type === "keySignature"
      || evt.type === "endOfTrack" || evt.type === "smpteOffset") as typeof piste;
  });
  return new Uint8Array(writeMidi({ header: midi.header, tracks } as any));
}

/** Combien de notes jouent dans ces octets ? De quoi dire ce qu'une partie a reçu. */
export function compterNotes(bytes: Uint8Array): number {
  return inventaireMidi(parseMidi(bytes)).notesTotal;
}
