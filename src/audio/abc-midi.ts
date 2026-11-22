// audio/abc-midi.ts — Un morceau ABC lu, écrit en MIDI multipiste.
//
// Ce module reçoit ce que `abc.ts` a lu et l'écrit : une piste de tempo, une par voix, une pour les
// accords chiffrés. Il vivait dans `abc.ts`, qui le réexporte, et en est sorti tel quel le 2026-11-22
// pour faire la place des fautes que le lecteur refuse : ce fichier-là était à son plafond de taille.

import { writeMidi } from "midi-file";
import type { MorceauAbc } from "./abc";

export type OptionsMidiAbc = {
  tempoParDefaut: number;
  /** banque × 128 + programme, comme ailleurs dans Attic. */
  instrumentVoix: number;
  instrumentAccords: number;
  jouerAccords: boolean;
  /** Instrument de chaque voix, dans l'ordre ; à défaut, `instrumentVoix` pour toutes. */
  instrumentsParVoix?: number[];
};

const TICKS_NOIRE = 480;

/** Écrit un MIDI multipiste : une piste de tempo, une par voix, une pour les accords chiffrés. */
export function morceauVersMidi(m: MorceauAbc, o: OptionsMidiAbc): { octets: Uint8Array; tempo: number; canaux: number } {
  const tempo = m.tempo ?? o.tempoParDefaut;
  const metrique = m.metrique ?? { numerateur: 4, denominateur: 4, texte: "4/4" };
  const pisteTempo: any[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: Math.round(60_000_000 / tempo) },
    { deltaTime: 0, type: "timeSignature", numerator: metrique.numerateur, denominator: metrique.denominateur, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, type: "keySignature", key: Math.max(-7, Math.min(7, m.tonalite.quintes)), scale: m.tonalite.mineur ? 1 : 0 },
    ...(m.titre ? [{ deltaTime: 0, type: "trackName", text: m.titre }] : []),
    { deltaTime: 0, type: "endOfTrack" },
  ];

  // Le canal 9 est réservé à la batterie en General MIDI : on le saute.
  const canal = (k: number) => (k >= 9 ? k + 1 : k);
  const piste = (ch: number, instrument: number, evenements: { midi: number; debut: number; duree: number; velocite: number }[]) => {
    const lignes: { tick: number; ordre: number; e: any }[] = [];
    const banque = Math.floor(instrument / 128), programme = instrument % 128;
    if (banque > 0) {
      lignes.push({ tick: 0, ordre: 0, e: { type: "controller", channel: ch, controllerType: 0, value: Math.floor(banque / 128) } });
      lignes.push({ tick: 0, ordre: 0, e: { type: "controller", channel: ch, controllerType: 32, value: banque % 128 } });
    }
    lignes.push({ tick: 0, ordre: 0, e: { type: "programChange", channel: ch, programNumber: programme } });
    for (const n of evenements) {
      if (n.midi < 0 || n.midi > 127) continue;
      const debut = Math.round(n.debut * TICKS_NOIRE);
      const fin = Math.max(debut + 1, Math.round((n.debut + n.duree) * TICKS_NOIRE));
      // À tick égal, les fins passent avant les débuts : une note répétée n'est
      // pas coupée par sa propre fin.
      lignes.push({ tick: debut, ordre: 2, e: { type: "noteOn", channel: ch, noteNumber: n.midi, velocity: Math.max(1, Math.min(127, n.velocite)) } });
      lignes.push({ tick: fin, ordre: 1, e: { type: "noteOff", channel: ch, noteNumber: n.midi, velocity: 0 } });
    }
    lignes.sort((a, b) => a.tick - b.tick || a.ordre - b.ordre);
    let precedent = 0;
    const evs = lignes.map(({ tick, e }) => { const r = { deltaTime: tick - precedent, ...e }; precedent = tick; return r; });
    evs.push({ deltaTime: 0, type: "endOfTrack" });
    return evs;
  };

  const pistes = [pisteTempo, ...m.voix.map((v, k) => piste(canal(k), o.instrumentsParVoix?.[k] ?? o.instrumentVoix, v.notes))];
  if (o.jouerAccords && m.accords.length > 0) {
    const evenements = m.accords.flatMap((a) => a.hauteurs.map((h) => ({ midi: h, debut: a.debut, duree: a.duree, velocite: 60 })));
    pistes.push(piste(canal(m.voix.length), o.instrumentAccords, evenements));
  }
  const octets = new Uint8Array(writeMidi({ header: { format: 1, numTracks: pistes.length, ticksPerBeat: TICKS_NOIRE }, tracks: pistes } as any));
  return { octets, tempo, canaux: pistes.length - 1 };
}
