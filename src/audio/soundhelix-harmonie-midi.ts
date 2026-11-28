// audio/soundhelix-harmonie-midi.ts — L'harmonie d'un morceau écrite en MIDI, et en symboles.
//
// CE QUE PORTE LE FICHIER, décision D3 du chantier SoundHelix, 2026-11-28 :
//   - les accords plaqués, leurs trois sons, chacun tenu toute sa durée, sur le canal 1 ;
//   - un marqueur `section` au premier tic de chaque section d'accords : la matrice d'activité et
//     les voix en lisent la forme du morceau, que des notes seules ne diraient pas ;
//   - le tempo et la mesure ;
//   - LA RÉSOLUTION EST LA GRILLE DU MORCEAU : un fichier à 4 tics par temps a une noire de 4 tics.
//     C'est la grille sur laquelle les voix posent leurs motifs, et elle voyage avec l'harmonie.
//
// LES HAUTEURS se comptent depuis le do central, 60 : la tonalité du morceau se choisit plus loin,
// par une transposition, comme SoundHelix le fait (décision D6). La fin de piste tombe à la fin du
// morceau, ce qui en donne la longueur même quand le dernier accord est court.
//
// LES SYMBOLES sont ceux qu'Attic lit partout (`audio/symboles-accords.ts`) : `Am`, `C/E`, `F/A`.
// Un accord de trois hauteurs qu'aucune qualité ne nomme exactement prend le symbole que lui trouve
// la reconnaissance générale.

import { writeMidi, type MidiEvent } from "midi-file";
import { Note } from "tonal";
import { comparerEvenementsMidi } from "./midi-ordre";
import { symboleDesNotes } from "./symboles-accords";
import type { AccordSH } from "./soundhelix-accords";
import type { HarmonieSH } from "./soundhelix-harmonie";

/** La hauteur MIDI du do central de SoundHelix, son 0. */
export const DO_CENTRAL_MIDI = 60;

/** Le texte du marqueur qui ouvre une section d'accords. */
export const MARQUEUR_SECTION = "section";

/** La vélocité des accords de l'harmonie, de 1 à 127. */
export const VELOCITE_HARMONIE = 80;

export interface OptionsMidiHarmonie {
  tempo: number;
  tempsParMesure: number;
  ticsParTemps: number;
}

/** Un événement à son tic absolu, avant le calcul des écarts. */
type Pose = { tick: number; evt: MidiEvent };

const velociteDe = (e: MidiEvent) => (e.type === "noteOn" || e.type === "noteOff" ? e.velocity : undefined);

/** Le fichier MIDI de l'harmonie, à la résolution du morceau. */
export function harmonieEnMidi(h: HarmonieSH, o: OptionsMidiHarmonie): Uint8Array<ArrayBuffer> {
  const poses: Pose[] = [
    { tick: 0, evt: { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60_000_000 / o.tempo) } },
    { tick: 0, evt: { deltaTime: 0, meta: true, type: "timeSignature", numerator: o.tempsParMesure, denominator: 4,
      metronome: 24, thirtyseconds: 8 } },
    ...h.sections.map((tick): Pose => ({ tick, evt: { deltaTime: 0, meta: true, type: "marker", text: MARQUEUR_SECTION } })),
  ];
  for (const a of h.accords) {
    for (const p of a.hauteurs) {
      const noteNumber = DO_CENTRAL_MIDI + p;
      poses.push({ tick: a.tic, evt: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber, velocity: VELOCITE_HARMONIE } });
      poses.push({ tick: a.tic + a.tics, evt: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber, velocity: 0 } });
    }
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
  piste.push({ deltaTime: Math.max(0, h.tics - avant), meta: true, type: "endOfTrack" });
  return new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: o.ticsParTemps }, tracks: [piste] }));
}

/** Le symbole usuel d'un accord de SoundHelix : `Am`, `F/A`, `E7/G#`. */
export function symboleAccordSH(c: AccordSH): string {
  const noms = c.map((p) => Note.fromMidiSharps(DO_CENTRAL_MIDI + p));
  return symboleDesNotes(noms) ?? noms.map((n) => Note.pitchClass(n)).join("-");
}

/** Les symboles de chaque section, un accord par changement, une ligne par section. */
export function symbolesParSection(h: HarmonieSH): string[] {
  return h.sections.map((debut, k) => {
    const fin = h.sections[k + 1] ?? h.tics;
    return h.accords
      .filter((a) => a.tic < fin && a.tic + a.tics > debut)
      .map((a) => symboleAccordSH(a.hauteurs))
      .join(" ");
  });
}
