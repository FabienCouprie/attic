// audio/temoins-soundhelix.ts — Lire les témoins que le programme SoundHelix 0.9 a rendus, pour y
// comparer ce que font les nœuds qui reprennent ses moteurs.
//
// D'OÙ VIENNENT LES TÉMOINS. `scripts/temoins-soundhelix.mjs` fait rendre à SoundHelix lui-même les
// quatre XML d'essai de `audio/temoins-soundhelix/`, sans rien jouer : pour chaque morceau, le
// fichier MIDI que son lecteur écrit, et un relevé texte. Ce module lit l'un et l'autre ; il ne
// sait rien du programme, et rien de lui n'est recopié ici.
//
// CE QUE LE RELEVÉ PORTE, ligne par ligne, et que le MIDI ne dirait pas :
//   - l'en-tête `cle=valeur` : nom, graine, mesures, temps par mesure, tics par temps, tics,
//     vélocité maximale, tempo en millièmes de BPM, transposition, groove ;
//   - `section k tic=t` : le premier tic de chaque section d'accords ;
//   - `accord tic=t tics=d nom=X hauteurs=a,b,c` : l'harmonie entière, accord par accord, avec les
//     trois hauteurs que SoundHelix a choisies, renversement compris ;
//   - `voix nom segments=…` : la matrice d'activité, voix par voix, en longueurs de tics, positives
//     quand la voix joue, négatives quand elle se tait, décalages d'entrée et de sortie appliqués ;
//   - `sequence instrument=… type=… canal=… programme=… rang=… entrees=…` : chaque ligne de chaque
//     piste telle que son moteur l'a calculée, AVANT le passage en MIDI, sous la grammaire de
//     SoundHelix (`hauteur[~]/tics:vélocité`, `-/tics` pour un silence).
//
// POURQUOI PAS `Note`. Une note d'Attic se date en secondes et porte une hauteur MIDI. Une entrée
// de séquence se compte en TICS et porte une hauteur relative au do central de SoundHelix, avant la
// transposition du lecteur : c'est l'objet même que les moteurs calculent, et le comparer exige de
// ne rien convertir. Les deux types d'ici n'ont donc pas de champ `note`.
//
// LA LECTURE EST STRICTE. Une ligne qu'elle ne reconnaît pas la fait lever, avec son numéro : un
// témoin mal lu qui passerait pour vide ferait passer au vert n'importe quel nœud.

import { parseMidi } from "midi-file";

/** Une entrée de séquence, posée à son tic. `hauteur` vaut `null` pour un silence. */
export interface EntreeTemoin {
  tic: number;
  tics: number;
  hauteur: number | null;
  velocite: number;
  lie: boolean;
}

/** Une ligne de piste, telle que son moteur l'a calculée. */
export interface SequenceTemoin {
  instrument: string;
  type: "MELODIC" | "RHYTHMIC";
  /** De 1 à 16, comme dans le XML. */
  canal: number;
  /** Le programme écrit dans le fichier, de 0 à 127, ou −1 quand le XML n'en donne pas. */
  programme: number;
  /** Le rang de la ligne dans sa piste : une nappe à trois notes en a trois. */
  rang: number;
  entrees: EntreeTemoin[];
}

export interface ReleveSoundHelix {
  nom: string;
  /** Sur 64 bits signés, d'où la chaîne : un `number` en perdrait les bits de poids faible. */
  graine: string;
  mesures: number;
  tempsParMesure: number;
  ticsParTemps: number;
  tics: number;
  velociteMax: number;
  milliBPM: number;
  transposition: number;
  groove: number[];
  /** Le premier tic de chaque section d'accords. */
  sections: number[];
  accords: { tic: number; tics: number; nom: string; hauteurs: [number, number, number] }[];
  /** Par voix, les longueurs de ses segments : positives actives, négatives silencieuses. */
  voix: Map<string, number[]>;
  sequences: SequenceTemoin[];
}

const ENTIER = /^-?\d+$/;

function entier(texte: string, ou: string): number {
  if (!ENTIER.test(texte)) throw new Error(`${ou} : « ${texte} » n'est pas un entier`);
  return Number(texte);
}

function listeEntiers(texte: string, ou: string): number[] {
  return texte === "" ? [] : texte.split(",").map((t) => entier(t, ou));
}

/** Lit `hauteur[~]/tics:vélocité` et `-/tics`, en posant chaque entrée à son tic. */
export function lireEntrees(texte: string, ou = "entrées"): EntreeTemoin[] {
  const out: EntreeTemoin[] = [];
  let tic = 0;
  for (const brut of texte === "" ? [] : texte.split(",")) {
    const silence = /^-\/(\d+)$/.exec(brut);
    const note = /^(-?\d+)(~?)\/(\d+):(\d+)$/.exec(brut);
    if (silence) {
      const tics = Number(silence[1]);
      out.push({ tic, tics, hauteur: null, velocite: 0, lie: false });
      tic += tics;
    } else if (note) {
      const tics = Number(note[3]);
      out.push({ tic, tics, hauteur: Number(note[1]), velocite: Number(note[4]), lie: note[2] === "~" });
      tic += tics;
    } else {
      throw new Error(`${ou} : entrée illisible « ${brut} »`);
    }
  }
  return out;
}

const CLES_EN_TETE = ["nom", "graine", "mesures", "tempsParMesure", "ticsParTemps", "tics", "velociteMax",
  "milliBPM", "transposition", "groove"] as const;

export function lireReleveSoundHelix(texte: string): ReleveSoundHelix {
  const tete = new Map<string, string>();
  const sections: number[] = [];
  const accords: ReleveSoundHelix["accords"] = [];
  const voix = new Map<string, number[]>();
  const sequences: SequenceTemoin[] = [];
  texte.split(/\r?\n/).forEach((ligne, i) => {
    const ou = `ligne ${i + 1}`;
    if (ligne === "") return;
    let m: RegExpExecArray | null;
    if ((m = /^section (\d+) tic=(\d+)$/.exec(ligne))) {
      if (Number(m[1]) !== sections.length) throw new Error(`${ou} : section ${m[1]} hors de son rang`);
      sections.push(Number(m[2]));
    } else if ((m = /^accord tic=(\d+) tics=(\d+) nom=(\S+) hauteurs=(-?\d+),(-?\d+),(-?\d+)$/.exec(ligne))) {
      accords.push({ tic: Number(m[1]), tics: Number(m[2]), nom: m[3],
        hauteurs: [Number(m[4]), Number(m[5]), Number(m[6])] });
    } else if ((m = /^voix (\S+) segments=(\S*)$/.exec(ligne))) {
      voix.set(m[1], listeEntiers(m[2], ou));
    } else if ((m = /^sequence instrument=(\S+) type=(MELODIC|RHYTHMIC) canal=(\d+) programme=(-?\d+) rang=(\d+) entrees=(\S*)$/.exec(ligne))) {
      sequences.push({ instrument: m[1], type: m[2] as SequenceTemoin["type"], canal: Number(m[3]),
        programme: Number(m[4]), rang: Number(m[5]), entrees: lireEntrees(m[6], ou) });
    } else if ((m = /^(\w+)=(.*)$/.exec(ligne)) && (CLES_EN_TETE as readonly string[]).includes(m[1])) {
      tete.set(m[1], m[2]);
    } else {
      throw new Error(`${ou} : ligne illisible « ${ligne.slice(0, 60)} »`);
    }
  });
  for (const cle of CLES_EN_TETE) if (!tete.has(cle)) throw new Error(`en-tête : « ${cle} » manque`);
  const n = (cle: (typeof CLES_EN_TETE)[number]) => entier(tete.get(cle)!, `en-tête ${cle}`);
  return {
    nom: tete.get("nom")!, graine: tete.get("graine")!, mesures: n("mesures"),
    tempsParMesure: n("tempsParMesure"), ticsParTemps: n("ticsParTemps"), tics: n("tics"),
    velociteMax: n("velociteMax"), milliBPM: n("milliBPM"), transposition: n("transposition"),
    groove: listeEntiers(tete.get("groove")!, "en-tête groove"), sections, accords, voix, sequences,
  };
}

/** La voix joue-t-elle au tic donné ? Faux au-delà de la fin, comme dans SoundHelix. */
export function voixActive(segments: readonly number[], tic: number): boolean {
  let debut = 0;
  for (const s of segments) {
    const fin = debut + Math.abs(s);
    if (tic >= debut && tic < fin) return s > 0;
    debut = fin;
  }
  return false;
}

/** Une note lue dans le fichier MIDI, en tics du fichier et en hauteur MIDI. */
export interface NoteFichierTemoin {
  tic: number;
  tics: number;
  hauteur: number;
  velocite: number;
  /**
   * Vrai quand le fichier ne porte pas l'arrêt de la note : elle est alors fermée à la fin de sa
   * piste. Le lecteur de SoundHelix décale tout d'un tic et n'écrit rien au-delà de la longueur du
   * morceau : l'arrêt d'une note qui finit avec le morceau tomberait un tic trop loin, et manque.
   */
  sansArret: boolean;
}

/**
 * Les notes du fichier MIDI, canal par canal (de 1 à 16), dans l'ordre de leurs débuts.
 *
 * Une note se ferme sur le premier arrêt de même canal et de même hauteur qui la suit : c'est ce qui
 * tient la liaison, que le lecteur de SoundHelix écrit en repoussant l'arrêt de la note liée après
 * le départ de la suivante. Un départ de vélocité nulle est un arrêt, et `midi-file` le rend déjà
 * comme tel (`midi-parser.js`) : aucun `noteOn` lu ici n'a une vélocité nulle.
 */
export function notesDuFichierTemoin(octets: Uint8Array): Map<number, NoteFichierTemoin[]> {
  const midi = parseMidi(octets);
  const out = new Map<number, NoteFichierTemoin[]>();
  const poser = (canal: number, note: NoteFichierTemoin) => {
    const notes = out.get(canal) ?? [];
    notes.push(note);
    out.set(canal, notes);
  };
  for (const piste of midi.tracks) {
    const ouvertes = new Map<string, { canal: number; hauteur: number; tic: number; velocite: number }[]>();
    let tic = 0;
    for (const e of piste) {
      tic += e.deltaTime;
      if (e.type !== "noteOn" && e.type !== "noteOff") continue;
      const cle = `${e.channel}:${e.noteNumber}`;
      if (e.type === "noteOn") {
        const file = ouvertes.get(cle) ?? [];
        file.push({ canal: e.channel + 1, hauteur: e.noteNumber, tic, velocite: e.velocity });
        ouvertes.set(cle, file);
        continue;
      }
      const ouverte = ouvertes.get(cle)?.shift();
      if (!ouverte) throw new Error(`arrêt sans départ, canal ${e.channel + 1}, hauteur ${e.noteNumber}, tic ${tic}`);
      poser(ouverte.canal, { tic: ouverte.tic, tics: tic - ouverte.tic, hauteur: ouverte.hauteur,
        velocite: ouverte.velocite, sansArret: false });
    }
    for (const file of ouvertes.values()) {
      for (const o of file) {
        poser(o.canal, { tic: o.tic, tics: tic - o.tic, hauteur: o.hauteur, velocite: o.velocite, sansArret: true });
      }
    }
  }
  for (const notes of out.values()) notes.sort((a, b) => a.tic - b.tic || a.hauteur - b.hauteur);
  return out;
}
