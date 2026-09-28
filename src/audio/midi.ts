// audio/midi.ts — Ce qu'un fichier MIDI contient, et comment on le lit.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { parseMidi } from "midi-file";
import { comparerEvenementsMidi } from "./midi-ordre";

export interface NoteMidi {
  note: number;
  velocite: number;
  debut: number;
  fin: number;
  canal: number;
}


export interface InstrumentCanal {
  programme: number;
  banque: number;
}

// L'ordre des événements dans un tick vit dans `midi-ordre.ts`, un module SANS aucun import :
// le worker Magenta s'en sert, et il ne doit pas tirer `i18n.tsx` derrière lui. Réexporté ici pour
// que les sept écrivains MIDI qui l'employaient ne changent pas d'adresse.
export { comparerEvenementsMidi } from "./midi-ordre";

export function analyserMidi(midi: ReturnType<typeof parseMidi>): {
  notes: NoteMidi[];
  dureeTotale: number;
  canauxInstrument: Map<number, InstrumentCanal>;
} {
  const tpm = midi.header.ticksPerBeat ?? 480;
  const changementsTempo: { tick: number; tempo: number }[] = [{ tick: 0, tempo: 500000 }];
  const canauxInstrument = new Map<number, InstrumentCanal>();
  const bankMsb = new Map<number, number>();
  const bankLsb = new Map<number, number>();
  for (let c = 0; c < 16; c++) {
    canauxInstrument.set(c, { programme: 0, banque: 0 });
    bankMsb.set(c, 0);
    bankLsb.set(c, 0);
  }

  for (const piste of midi.tracks) {
    let tick = 0;
    for (const evt of piste) {
      tick += evt.deltaTime;
      if (evt.type === "setTempo") changementsTempo.push({ tick, tempo: evt.microsecondsPerBeat });
      if (evt.type === "programChange") {
        const inst = canauxInstrument.get(evt.channel) ?? { programme: 0, banque: 0 };
        canauxInstrument.set(evt.channel, { ...inst, programme: evt.programNumber });
      }
      if (evt.type === "controller") {
        const canal = evt.channel;
        if (evt.controllerType === 0) {
          bankMsb.set(canal, evt.value);
          const inst = canauxInstrument.get(canal) ?? { programme: 0, banque: 0 };
          canauxInstrument.set(canal, { ...inst, banque: (bankMsb.get(canal) ?? 0) * 128 + (bankLsb.get(canal) ?? 0) });
        } else if (evt.controllerType === 32) {
          bankLsb.set(canal, evt.value);
          const inst = canauxInstrument.get(canal) ?? { programme: 0, banque: 0 };
          canauxInstrument.set(canal, { ...inst, banque: (bankMsb.get(canal) ?? 0) * 128 + (bankLsb.get(canal) ?? 0) });
        }
      }
    }
  }
  changementsTempo.sort((a, b) => a.tick - b.tick);

  function tickEnSecondes(tick: number): number {
    let sec = 0;
    for (let i = 0; i < changementsTempo.length - 1; i++) {
      const c = changementsTempo[i];
      const p = changementsTempo[i + 1];
      if (tick <= p.tick) return sec + ((tick - c.tick) / tpm) * (c.tempo / 1_000_000);
      sec += ((p.tick - c.tick) / tpm) * (c.tempo / 1_000_000);
    }
    const dernier = changementsTempo[changementsTempo.length - 1];
    return sec + ((tick - dernier.tick) / tpm) * (dernier.tempo / 1_000_000);
  }

  const notes: NoteMidi[] = [];
  let dureeMax = 0;

  for (const piste of midi.tracks) {
    let tick = 0;
    const actifs = new Map<string, { note: number; debut: number; velocite: number; canal: number }>();

    for (const evt of piste) {
      tick += evt.deltaTime;
      if (evt.type === "noteOn" && evt.velocity > 0) {
        const t = tickEnSecondes(tick);
        const cle = `${evt.channel}-${evt.noteNumber}`;
        const existant = actifs.get(cle);
        if (existant) {
          notes.push({ ...existant, fin: t });
          if (t > dureeMax) dureeMax = t;
        }
        actifs.set(cle, { note: evt.noteNumber, debut: t, velocite: evt.velocity, canal: evt.channel });
      }
      if (evt.type === "noteOff" || (evt.type === "noteOn" && evt.velocity === 0)) {
        const t = tickEnSecondes(tick);
        const cle = `${evt.channel}-${evt.noteNumber}`;
        const actif = actifs.get(cle);
        if (actif) {
          actifs.delete(cle);
          notes.push({ ...actif, fin: t });
          if (t > dureeMax) dureeMax = t;
        }
      }
      if (evt.type === "endOfTrack") {
        for (const [, actif] of actifs) {
          const t = tickEnSecondes(tick);
          notes.push({ ...actif, fin: t });
          if (t > dureeMax) dureeMax = t;
        }
        actifs.clear();
      }
    }
  }

  return { notes, dureeTotale: dureeMax, canauxInstrument };
}


