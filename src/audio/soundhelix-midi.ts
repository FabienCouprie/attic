// audio/soundhelix-midi.ts — Le MIDI des nœuds de SoundHelix : écrire un morceau à sa grille, et
// relire l'harmonie qu'un autre nœud a écrite.
//
// LA GRILLE VOYAGE AVEC LE FICHIER : sa résolution est le nombre de tics par temps du morceau. Une
// harmonie écrite à 4 tics par temps a une noire de 4 tics, et toute voix qui la lit pose ses motifs
// sur cette grille-là (décision D3 du chantier SoundHelix, 2026-11-28).
//
// LES HAUTEURS se comptent depuis le do central, 60 : le 0 de SoundHelix. La tonalité du morceau se
// choisit plus loin, par une transposition (décision D6).
//
// UNE HARMONIE VENUE D'AILLEURS se lit aussi : ses accords sont les notes qui partent ensemble, triées,
// et chacun dure jusqu'au départ du suivant ; sans marqueur, le morceau n'a qu'une section.

import { parseMidi, writeMidi, type MidiEvent } from "midi-file";
import { comparerEvenementsMidi } from "./midi-ordre";
import { DO_CENTRAL_MIDI, MARQUEUR_SECTION } from "./soundhelix-harmonie-midi";

export { DO_CENTRAL_MIDI, MARQUEUR_SECTION };

/** La vélocité la plus forte d'un motif ; une vélocité de motif se compte en millièmes d'elle. */
export const VELOCITE_MAX = 1000;

/** La vélocité MIDI d'une vélocité de motif : 1 à 1000 ramenés linéairement sur 1 à 127, comme SoundHelix. */
export const velociteMidi = (v: number): number => (v <= 0 ? 0 : 1 + Math.floor(((v - 1) * 126) / (VELOCITE_MAX - 1)));

/** Une note à poser : son tic, sa durée, sa hauteur depuis le do central, sa vélocité de motif. */
export interface NotePosee {
  tic: number;
  tics: number;
  hauteur: number;
  velocite: number;
}

export interface Morceau {
  ticsParTemps: number;
  /** La longueur, en tics : la fin de piste y tombe. */
  tics: number;
  tempo: number;
  tempsParMesure: number;
  /** Le premier tic de chaque section ; ne s'écrivent en marqueurs que si on les donne. */
  sections?: readonly number[];
}

type Pose = { tick: number; evt: MidiEvent };

const velociteDe = (e: MidiEvent) => (e.type === "noteOn" || e.type === "noteOff" ? e.velocity : undefined);

/** Un fichier MIDI d'une piste, à la grille du morceau, les notes sur le canal donné. */
export function morceauEnMidi(notes: readonly NotePosee[], m: Morceau, canal = 0): Uint8Array<ArrayBuffer> {
  const poses: Pose[] = [
    { tick: 0, evt: { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60_000_000 / m.tempo) } },
    { tick: 0, evt: { deltaTime: 0, meta: true, type: "timeSignature", numerator: m.tempsParMesure, denominator: 4,
      metronome: 24, thirtyseconds: 8 } },
    ...(m.sections ?? []).map((tick): Pose => ({ tick, evt: { deltaTime: 0, meta: true, type: "marker", text: MARQUEUR_SECTION } })),
  ];
  for (const n of notes) {
    const velocity = velociteMidi(n.velocite);
    if (velocity === 0 || n.tics <= 0) continue;
    const noteNumber = DO_CENTRAL_MIDI + n.hauteur;
    if (noteNumber < 0 || noteNumber > 127) continue;
    poses.push({ tick: n.tic, evt: { deltaTime: 0, type: "noteOn", channel: canal, noteNumber, velocity } });
    poses.push({ tick: n.tic + n.tics, evt: { deltaTime: 0, type: "noteOff", channel: canal, noteNumber, velocity: 0 } });
  }
  poses.sort((a, b) => comparerEvenementsMidi(
    { tick: a.tick, type: a.evt.type, velocity: velociteDe(a.evt) },
    { tick: b.tick, type: b.evt.type, velocity: velociteDe(b.evt) }));
  let avant = 0;
  const piste: MidiEvent[] = poses.map(({ tick, evt }) => {
    const deltaTime = tick - avant;
    avant = tick;
    return { ...evt, deltaTime };
  });
  piste.push({ deltaTime: Math.max(0, m.tics - avant), meta: true, type: "endOfTrack" });
  return new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: m.ticsParTemps }, tracks: [piste] }));
}

/** Un accord relu : son tic, sa durée, ses hauteurs triées depuis le do central. */
export interface AccordLu {
  tic: number;
  tics: number;
  hauteurs: readonly number[];
}

export interface HarmonieLue extends Required<Morceau> {
  accords: AccordLu[];
  /** L'accord de chaque tic, ou `null` avant le premier. */
  accordAuTic: (tic: number) => readonly number[] | null;
}

/** Relit une harmonie : la grille, la longueur, le tempo, la mesure, les sections, les accords. */
export function lireHarmonie(octets: Uint8Array): HarmonieLue {
  const midi = parseMidi(octets);
  const ticsParTemps = midi.header.ticksPerBeat ?? 480;
  let tempo = 120;
  let tempsParMesure = 4;
  let tics = 0;
  const sections: number[] = [];
  const departs = new Map<number, number[]>();
  for (const piste of midi.tracks) {
    let tick = 0;
    let premierTempo = true;
    for (const e of piste) {
      tick += e.deltaTime;
      if (e.type === "setTempo" && premierTempo) { tempo = 60_000_000 / e.microsecondsPerBeat; premierTempo = false; }
      if (e.type === "timeSignature") tempsParMesure = e.numerator;
      if (e.type === "marker" && e.text === MARQUEUR_SECTION && !sections.includes(tick)) sections.push(tick);
      if (e.type === "noteOn" && e.velocity > 0) departs.set(tick, [...(departs.get(tick) ?? []), e.noteNumber - DO_CENTRAL_MIDI]);
      if (e.type === "noteOff" || e.type === "endOfTrack") tics = Math.max(tics, tick);
    }
  }
  sections.sort((a, b) => a - b);
  if (sections[0] !== 0) sections.unshift(0);
  const ticsDeparts = [...departs.keys()].sort((a, b) => a - b);
  const accords: AccordLu[] = ticsDeparts.map((tic, k) => ({
    tic, tics: (ticsDeparts[k + 1] ?? tics) - tic, hauteurs: [...new Set(departs.get(tic)!)].sort((a, b) => a - b),
  }));
  const accordAuTic = (tic: number) => {
    let bas = 0;
    let haut = accords.length - 1;
    let trouve: AccordLu | null = null;
    while (bas <= haut) {
      const mil = (bas + haut) >> 1;
      if (accords[mil].tic <= tic) { trouve = accords[mil]; bas = mil + 1; } else haut = mil - 1;
    }
    return trouve ? trouve.hauteurs : null;
  };
  return { ticsParTemps, tics, tempo, tempsParMesure, sections, accords, accordAuTic };
}
