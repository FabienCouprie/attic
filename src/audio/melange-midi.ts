// audio/melange-midi.ts — Plusieurs fichiers MIDI en un seul, une piste par entrée.
//
// L'ASSEMBLAGE EST CELUI DE `fusionnerMidis`, et ce module ne le réécrit pas : il prépare chaque
// entrée en un fichier d'une piste, sur une même base de temps, puis les lui passe. Préparer veut
// dire trois choses, que la fusion seule ne fait pas.
//
// LE TEMPS. `fusionnerMidis` a été écrit pour des parties sorties d'un même nœud, donc d'un même
// tempo : il garde le tempo de chaque fichier au tick zéro, et un lecteur n'en retient qu'un, le
// dernier lu (`analyserMidi`, `sequenceDepuisMidiParPiste`). Deux entrées à 100 et à 120 BPM y
// rejouaient toutes deux à 120. Il refuse aussi deux résolutions différentes, ce qui ferme la porte à
// tout fichier venu d'ailleurs. Ici chaque entrée garde ses instants en SECONDES, tels que son propre
// tempo les donne, et s'écrit au tempo et à la résolution de la première entrée qui a des notes. Une
// entrée de même tempo et de même résolution garde ses ticks à l'identique : aucune conversion, donc
// aucun arrondi.
//
// LE CANAL. Un canal ne porte qu'un instrument pour tout le fichier, le dernier changement de
// programme lu l'emportant, et deux notes de même hauteur sur un même canal se referment l'une
// l'autre. Or la plupart des générateurs écrivent sur le canal 1 : deux d'entre eux fondus en
// gardant leurs canaux sonnaient avec un seul instrument. En « Automatique », une entrée dont les
// notes tiennent sur un canal passe sur le canal de son numéro, celle du canal 10 (les percussions du
// General MIDI) y reste, et celle qui en occupe plusieurs les garde : c'est un arrangement déjà réparti.
// Décision de Fabien du 2026-11-23, avec les réglages par entrée et le plafond de huit entrées.
//
// CE QU'UNE ENTRÉE DÉPLACÉE PERD : les événements des canaux qui ne portent aucune de ses notes. Ils
// ne font rien entendre d'elle, et emmenés dans le mélange, un changement de programme orphelin
// changerait l'instrument d'une autre entrée.

import { parseMidi, writeMidi } from "midi-file";
import { comparerEvenementsMidi } from "./midi-ordre";
import { fusionnerMidis } from "./midi-ecriture";
import { CANAL_BATTERIE } from "./repartition-midi";

/** « auto », « garder », ou un canal de 0 à 15. */
export type CanalDemande = "auto" | "garder" | number;

/**
 * Ce qui empêche le mélange, et l'entrée en cause : le composant le dit dans la langue de
 * l'interface, ce module n'en sachant rien.
 */
export class RefusMelange extends Error {
  readonly raison: "illisible" | "smpte" | "sans-note";
  readonly rang: number | null;
  constructor(raison: RefusMelange["raison"], rang: number | null) {
    super(`melange MIDI refuse : ${raison}${rang === null ? "" : ` (entree ${rang + 1})`}`);
    this.raison = raison;
    this.rang = rang;
  }
}

export interface EntreeMelange {
  /** Le numéro de l'entrée, à partir de 0 : il donne son canal en « Automatique ». */
  rang: number;
  octets: Uint8Array;
  /** Facteur de vélocité, 1 la laisse telle quelle. */
  velocite: number;
  /** En demi-tons entiers. */
  transposition: number;
  canal: CanalDemande;
}

export interface BilanEntree {
  rang: number;
  /** Le rang de sa piste dans le fichier rendu, ou null si elle n'y a rien mis. */
  piste: number | null;
  notes: number;
  /** Les canaux de ses notes dans le fichier rendu, de 0 à 15. */
  canaux: number[];
  /** Les notes que la transposition a sorties du clavier, retirées. */
  horsClavier: number;
  /** Vrai quand ses instants ont été convertis vers le tempo ou la résolution de la référence. */
  convertie: boolean;
}

export interface Melange {
  octets: Uint8Array;
  bilans: BilanEntree[];
  /** Le tempo écrit au début du fichier, en BPM. */
  tempo: number;
}

type Evt = { deltaTime: number; type: string; channel?: number; noteNumber?: number; velocity?: number; microsecondsPerBeat?: number; [k: string]: unknown };
type Midi = { header: { ticksPerBeat?: number }; tracks: Evt[][] };

/** Ce qui ne passe que pour la référence : un second tempo, une seconde mesure contrediraient la sienne. */
const META_DE_REFERENCE = new Set(["setTempo", "timeSignature", "keySignature", "smpteOffset"]);
const NOTES = new Set(["noteOn", "noteOff", "noteAftertouch"]);

/** Un segment de tempo : son tick, sa noire en microsecondes, et l'instant où il commence. */
interface Segment { tick: number; uspq: number; sec: number }

/** La carte des tempos, prise dans toutes les pistes ; à tick égal, le dernier lu l'emporte. */
function carteDesTempos(midi: Midi, tpq: number): Segment[] {
  const lus: { tick: number; uspq: number }[] = [];
  for (const piste of midi.tracks) {
    let tick = 0;
    for (const e of piste) {
      tick += e.deltaTime;
      if (e.type === "setTempo" && (e.microsecondsPerBeat ?? 0) > 0) lus.push({ tick, uspq: e.microsecondsPerBeat! });
    }
  }
  lus.sort((a, b) => a.tick - b.tick);
  for (let k = lus.length - 1; k > 0; k--) if (lus[k - 1].tick === lus[k].tick) lus.splice(k - 1, 1);
  if (lus.length === 0 || lus[0].tick > 0) lus.unshift({ tick: 0, uspq: 500_000 });
  const carte: Segment[] = [];
  for (const [i, t] of lus.entries()) {
    const p = carte[i - 1];
    carte.push({ ...t, sec: p ? p.sec + ((t.tick - p.tick) / tpq) * (p.uspq / 1e6) : 0 });
  }
  return carte;
}

function enSecondes(carte: Segment[], tpq: number, tick: number): number {
  let s = carte[0];
  for (const c of carte) if (c.tick <= tick) s = c;
  return s.sec + ((tick - s.tick) / tpq) * (s.uspq / 1e6);
}

function enTicks(carte: Segment[], tpq: number, sec: number): number {
  let s = carte[0];
  for (const c of carte) if (c.sec <= sec) s = c;
  return Math.max(0, Math.round(s.tick + ((sec - s.sec) / (s.uspq / 1e6)) * tpq));
}

const memesTempos = (a: Segment[], b: Segment[]) =>
  a.length === b.length && a.every((s, i) => s.tick === b[i].tick && s.uspq === b[i].uspq);

function resolution(midi: Midi, rang: number): number {
  const tpq = midi.header.ticksPerBeat;
  if (!tpq || tpq <= 0) throw new RefusMelange("smpte", rang);
  return tpq;
}

/** Les canaux qui portent au moins une note. */
function canauxDesNotes(midi: Midi): Set<number> {
  const canaux = new Set<number>();
  for (const piste of midi.tracks) {
    for (const e of piste) if (e.type === "noteOn" && (e.velocity ?? 0) > 0) canaux.add(e.channel!);
  }
  return canaux;
}

/** Où va chaque canal de l'entrée, ou null quand tous restent en place. */
function destinations(demande: CanalDemande, canaux: Set<number>, rang: number): Map<number, number> | null {
  if (demande === "garder") return null;
  if (demande === "auto") {
    if (canaux.size !== 1) return null;
    const [seul] = canaux;
    // HUIT ENTRÉES AU PLUS, donc le canal de l'entrée n'atteint jamais le dixième.
    return new Map([[seul, seul === CANAL_BATTERIE ? CANAL_BATTERIE : rang]]);
  }
  return new Map([...canaux].map((c) => [c, demande]));
}

/** Une entrée préparée : une piste sur la base de temps de la référence. */
function preparer(e: EntreeMelange, midi: Midi, versReference: (tick: number) => number, gardeMeta: boolean) {
  const vers = destinations(e.canal, canauxDesNotes(midi), e.rang);
  const bilan = { notes: 0, canaux: new Set<number>(), horsClavier: 0 };
  const absolus: (Evt & { tick: number })[] = [];
  // LA FIN DE PISTE GARDE SON INSTANT, la plus tardive des pistes de l'entrée : c'est elle qui porte
  // un silence de fin, qu'une piste refermée sur son dernier événement perdrait.
  let fin = 0;
  for (const piste of midi.tracks) {
    let tick = 0;
    for (const lu of piste) {
      tick += lu.deltaTime;
      if (lu.type === "endOfTrack") { fin = Math.max(fin, versReference(tick)); continue; }
      if (!gardeMeta && META_DE_REFERENCE.has(lu.type)) continue;
      const evt: Evt = { ...lu };
      if (typeof evt.channel === "number" && vers) {
        const c = vers.get(evt.channel);
        if (c === undefined) continue;
        evt.channel = c;
      }
      if (NOTES.has(evt.type)) {
        if (evt.channel !== CANAL_BATTERIE && e.transposition !== 0) {
          const n = evt.noteNumber! + e.transposition;
          if (n < 0 || n > 127) {
            if (evt.type === "noteOn" && (evt.velocity ?? 0) > 0) bilan.horsClavier++;
            continue;
          }
          evt.noteNumber = n;
        }
        if (evt.type === "noteOn" && (evt.velocity ?? 0) > 0) {
          evt.velocity = Math.max(1, Math.min(127, Math.round(evt.velocity! * e.velocite)));
          bilan.notes++;
          bilan.canaux.add(evt.channel!);
        }
      }
      absolus.push({ ...evt, tick: versReference(tick) });
    }
  }
  absolus.sort(comparerEvenementsMidi);
  let avant = 0;
  const piste: Evt[] = absolus.map(({ tick, ...evt }) => {
    const delta = tick - avant;
    avant = tick;
    return { ...evt, deltaTime: delta };
  });
  piste.push({ deltaTime: Math.max(0, fin - avant), type: "endOfTrack", meta: true });
  return { piste, bilan };
}

/**
 * Réunit des fichiers MIDI en un seul, une piste par entrée qui y met des notes, dans l'ordre reçu.
 * La première entrée qui a des notes donne le tempo, la résolution, la mesure et la tonalité.
 */
export function melangerMidis(entrees: readonly EntreeMelange[]): Melange {
  const lus = entrees.map((e) => {
    try {
      return parseMidi(e.octets) as unknown as Midi;
    } catch {
      throw new RefusMelange("illisible", e.rang);
    }
  });
  const iRef = lus.findIndex((m) => canauxDesNotes(m).size > 0);
  if (iRef < 0) throw new RefusMelange("sans-note", null);
  const tpqRef = resolution(lus[iRef], entrees[iRef].rang);
  const carteRef = carteDesTempos(lus[iRef], tpqRef);

  const fichiers: Uint8Array[] = [];
  const bilans: BilanEntree[] = entrees.map((e, i) => {
    const midi = lus[i];
    const tpq = resolution(midi, e.rang);
    const carte = carteDesTempos(midi, tpq);
    const convertie = tpq !== tpqRef || !memesTempos(carte, carteRef);
    const versReference = convertie ? (t: number) => enTicks(carteRef, tpqRef, enSecondes(carte, tpq, t)) : (t: number) => t;
    const { piste, bilan } = preparer(e, midi, versReference, i === iRef);
    // UNE ENTRÉE SANS NOTE N'A PAS DE PISTE, et la référence non plus si la transposition les a
    // toutes retirées : son tempo est alors porté par une piste qui ne joue rien, en tête.
    let rangPiste: number | null = null;
    if (bilan.notes > 0 || i === iRef) {
      if (bilan.notes > 0) rangPiste = fichiers.length;
      fichiers.push(new Uint8Array(writeMidi({
        header: { format: 1, numTracks: 1, ticksPerBeat: tpqRef }, tracks: [piste],
      } as never)));
    }
    return {
      rang: e.rang, piste: rangPiste, notes: bilan.notes,
      canaux: [...bilan.canaux].sort((a, b) => a - b), horsClavier: bilan.horsClavier, convertie,
    };
  });
  if (bilans.every((b) => b.notes === 0)) throw new RefusMelange("sans-note", null);
  return { octets: fusionnerMidis(fichiers), bilans, tempo: 60_000_000 / carteRef[0].uspq };
}
