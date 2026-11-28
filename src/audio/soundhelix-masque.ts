// audio/soundhelix-masque.ts — Gouverner n'importe quel fichier MIDI par une voix de la matrice
// d'activité de SoundHelix.
//
// LA RÈGLE EST CELLE DES VOIX DE SOUNDHELIX : une note est gardée si la voix joue à l'instant où
// elle commence, et elle n'est pas coupée ensuite. « Couper aux bords » ajoute la règle de la nappe :
// une note qui déborde la fin de l'activité s'arrête avec elle.
//
// LE TEMPS SE COMPTE EN SECONDES, et c'est ce qui permet de gouverner un fichier venu d'ailleurs : la
// matrice se pose sur les sections de l'harmonie, à son tempo ; le fichier gouverné garde sa
// résolution, ses pistes, ses canaux, ses programmes et sa carte des tempos, lue par
// `temposDuFichier` (`audio/midi-lecture-sequence.ts`). Seules ses notes changent.

import { parseMidi, writeMidi, type MidiEvent } from "midi-file";
import { comparerEvenementsMidi } from "./midi-ordre";
import type { ChangementDeTempo } from "./midi-lecture-sequence";

/** Les segments d'une voix, en secondes : début, fin, et si elle joue. */
export interface SegmentEnSecondes { debut: number; fin: number; joue: boolean }

/** Les segments en tics d'une voix, ramenés en secondes au tempo et à la grille de l'harmonie. */
export function segmentsEnSecondes(segments: readonly number[], ticsParTemps: number, tempo: number): SegmentEnSecondes[] {
  const seconde = 60 / (tempo * ticsParTemps);
  let tic = 0;
  return segments.map((s) => {
    const debut = tic * seconde;
    tic += Math.abs(s);
    return { debut, fin: tic * seconde, joue: s > 0 };
  });
}

/** Les instants en secondes des tics d'un fichier, d'après sa carte des tempos. */
function horloge(carte: readonly ChangementDeTempo[] | null, tpq: number) {
  const etapes = (carte && carte.length ? carte : [{ debut: 0, bpm: 120, usParNoire: 500_000 }]).map((c) => ({ ...c, tick: 0 }));
  for (let k = 1; k < etapes.length; k++) {
    etapes[k].tick = etapes[k - 1].tick + ((etapes[k].debut - etapes[k - 1].debut) / (etapes[k - 1].usParNoire / 1e6)) * tpq;
  }
  const etapeDe = (lire: (e: (typeof etapes)[number]) => number, x: number) => {
    let k = 0;
    while (k + 1 < etapes.length && lire(etapes[k + 1]) <= x) k++;
    return etapes[k];
  };
  return {
    secondes: (tick: number) => { const e = etapeDe((v) => v.tick, tick); return e.debut + ((tick - e.tick) / tpq) * (e.usParNoire / 1e6); },
    tick: (s: number) => { const e = etapeDe((v) => v.debut, s); return Math.round(e.tick + ((s - e.debut) / (e.usParNoire / 1e6)) * tpq); },
  };
}

/** Le segment qui contient l'instant, avec la tolérance d'un dix-millième de seconde. */
function segmentDe(segments: readonly SegmentEnSecondes[], s: number): SegmentEnSecondes | null {
  return segments.find((g) => s >= g.debut - 1e-4 && s < g.fin - 1e-4) ?? null;
}

export interface Masque {
  octets: Uint8Array<ArrayBuffer>;
  gardees: number;
  retirees: number;
  coupees: number;
}

/** Garde les notes qui partent pendant que la voix joue ; coupe au besoin celles qui en débordent. */
export function masquerMidi(
  octets: Uint8Array, carte: readonly ChangementDeTempo[] | null, segments: readonly SegmentEnSecondes[], couper: boolean,
): Masque {
  const midi = parseMidi(octets);
  const tpq = midi.header.ticksPerBeat ?? 480;
  const temps = horloge(carte, tpq);
  let gardees = 0, retirees = 0, coupees = 0;
  const pistes = midi.tracks.map((piste) => {
    let tick = 0;
    const absolus = piste.map((evt) => ({ tick: (tick += evt.deltaTime), evt }));
    const ouvertes = new Map<string, number[]>();
    const retirer = new Set<number>();
    const arrets = new Map<number, number>();
    absolus.forEach(({ tick: t, evt }, i) => {
      if (evt.type !== "noteOn" && evt.type !== "noteOff") return;
      const cle = `${evt.channel}:${evt.noteNumber}`;
      if (evt.type === "noteOn" && evt.velocity > 0) {
        ouvertes.set(cle, [...(ouvertes.get(cle) ?? []), i]);
        return;
      }
      const depart = ouvertes.get(cle)?.shift();
      if (depart === undefined) return;
      const debut = temps.secondes(absolus[depart].tick);
      const segment = segmentDe(segments, debut);
      if (!segment || !segment.joue) { retirer.add(depart); retirer.add(i); retirees++; return; }
      gardees++;
      if (couper && temps.secondes(t) > segment.fin + 1e-4) { arrets.set(i, temps.tick(segment.fin)); coupees++; }
    });
    // L'ordre d'origine départage deux événements de même tic et de même rang : `i0`.
    const corps: { tick: number; evt: MidiEvent; i0: number }[] = [];
    absolus.forEach((a, i) => {
      if (!retirer.has(i) && a.evt.type !== "endOfTrack") corps.push({ tick: arrets.get(i) ?? a.tick, evt: a.evt, i0: i });
    });
    const fin = absolus.find((a) => a.evt.type === "endOfTrack");
    corps.sort((a, b) => comparerEvenementsMidi(
      { tick: a.tick, type: a.evt.type, velocity: "velocity" in a.evt ? a.evt.velocity : undefined },
      { tick: b.tick, type: b.evt.type, velocity: "velocity" in b.evt ? b.evt.velocity : undefined }) || a.i0 - b.i0);
    let avant = 0;
    const sortie: MidiEvent[] = corps.map(({ tick: t, evt }) => { const d = t - avant; avant = t; return { ...evt, deltaTime: d }; });
    sortie.push({ ...(fin?.evt ?? { meta: true as const, type: "endOfTrack" as const }), deltaTime: Math.max(0, (fin?.tick ?? avant) - avant) } as MidiEvent);
    return sortie;
  });
  return { octets: new Uint8Array(writeMidi({ header: midi.header, tracks: pistes })), gardees, retirees, coupees };
}
