// plugins/magenta-helpers.ts — Fonctions de calcul des nœuds Magenta.
// Partagées entre le thread principal (magenta.ts) et le worker Magenta.
// @magenta/music : Apache 2.0 — déjà listé dans THIRD_PARTY.md.

import { withElectronFetch } from "./electronFetch";
import * as sequences from "@magenta/music/esm/core/sequences";
import { NoteSequence } from "@magenta/music/esm/protobuf";
import { parseMidi, writeMidi } from "midi-file";
import * as tf from "@tensorflow/tfjs";

tf.disableDeprecationWarnings();

export const CHECKPOINTS = {
  drums: "https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/drums_2bar_nade_9_q2",
  continuation: "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/melody_rnn",
  melody: "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/melody_rnn",
  interpolation: "https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small",
  drumsSeed: "https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/drums_2bar_nade_9_q2",
  humanize: "https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/groovae_2bar_humanize",
  improvisation: "https://storage.googleapis.com/magentadata/js/checkpoints/piano_genie/model/epiano/stp_iq_auto_contour_dt_166006",
};

export type ModelKind = keyof typeof CHECKPOINTS;

const instances: Partial<Record<ModelKind, any>> = {};

export async function getModel(kind: ModelKind) {
  if (instances[kind]) return instances[kind]!;
  const url = CHECKPOINTS[kind];
  let model: any;
  if (kind === "drums" || kind === "interpolation" || kind === "drumsSeed" || kind === "humanize") {
    const { MusicVAE } = await import("@magenta/music/esm/music_vae/model");
    model = new MusicVAE(url);
  } else if (kind === "continuation" || kind === "melody") {
    const { MusicRNN } = await import("@magenta/music/esm/music_rnn/model");
    model = new MusicRNN(url);
  } else {
    const { PianoGenie } = await import("@magenta/music/esm/piano_genie/model");
    model = new PianoGenie(url);
  }
  await withElectronFetch(() => model.initialize());
  instances[kind] = model;
  return model;
}

export async function fileToNoteSequence(file: File): Promise<any> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const midi = parseMidi(bytes);
  const ticksPerQuarter = midi.header.ticksPerBeat ?? 480;
  const tempos: { time: number; qpm: number }[] = [];
  const timeSignatures: { time: number; numerator: number; denominator: number }[] = [];
  const notes: any[] = [];

  let currentTempo = 500000; // 120 BPM
  let tempoTime = 0;
  let lastTempoTick = 0;
  const tickToSeconds = (tick: number) => tempoTime + ((tick - lastTempoTick) * currentTempo) / (ticksPerQuarter * 1_000_000);

  for (const track of midi.tracks) {
    let tick = 0;
    const active = new Map<string, { pitch: number; velocity: number; startTime: number; channel: number }>();
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === "setTempo") {
        const t = tickToSeconds(tick);
        tempos.push({ time: t, qpm: 60_000_000 / event.microsecondsPerBeat });
        tempoTime = t;
        lastTempoTick = tick;
        currentTempo = event.microsecondsPerBeat;
      }
      if (event.type === "timeSignature") {
        timeSignatures.push({ time: tickToSeconds(tick), numerator: event.numerator, denominator: event.denominator });
      }
      if (event.type === "noteOn" && event.velocity > 0) {
        const t = tickToSeconds(tick);
        const key = `${event.channel}-${event.noteNumber}`;
        active.set(key, { pitch: event.noteNumber, velocity: event.velocity, startTime: t, channel: event.channel });
      }
      if (event.type === "noteOff" || (event.type === "noteOn" && event.velocity === 0)) {
        const t = tickToSeconds(tick);
        const key = `${event.channel}-${event.noteNumber}`;
        const note = active.get(key);
        if (note) {
          active.delete(key);
          notes.push({
            pitch: note.pitch,
            velocity: note.velocity,
            startTime: note.startTime,
            endTime: t,
            isDrum: note.channel === 9,
          });
        }
      }
    }
  }

  const totalTime = notes.length > 0 ? Math.max(...notes.map((n) => n.endTime)) : 0;
  if (tempos.length === 0) tempos.push({ time: 0, qpm: 120 });
  if (timeSignatures.length === 0) timeSignatures.push({ time: 0, numerator: 4, denominator: 4 });

  return { notes, tempos, timeSignatures, ticksPerQuarter, totalTime };
}

export function toPlainNoteSequence(ns: any): any {
  const clone = (v: any): any => {
    if (v === undefined || v === null) return v;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(clone);
    if (typeof v === "object") {
      if (typeof v.toNumber === "function") return v.toNumber();
      const out: any = {};
      for (const key of Object.keys(v)) out[key] = clone(v[key]);
      return out;
    }
    return v;
  };
  const plain = clone(ns);
  if (Array.isArray(plain.notes)) {
    for (const n of plain.notes) {
      if (n.velocity === undefined || n.velocity === null || n.velocity === 0) {
        n.velocity = 80;
      }
    }
  }
  return plain;
}

function noteSequenceToMidiEvents(ns: any) {
  const ticksPerBeat = ns.ticksPerQuarter || 480;
  const tempos = ns.tempos && ns.tempos.length > 0 ? ns.tempos : [{ time: 0, qpm: 120 }];
  const qpm = tempos[0].qpm ?? 120;
  const timeToTicks = (t: number) => Math.round(t * ticksPerBeat * qpm / 60);

  const track0: any[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60_000_000 / qpm) },
  ];
  const timeSigs = ns.timeSignatures && ns.timeSignatures.length > 0 ? ns.timeSignatures : [{ time: 0, numerator: 4, denominator: 4 }];
  let lastSigTick = 0;
  for (const ts of timeSigs) {
    const tick = timeToTicks(ts.time);
    track0.push({ deltaTime: tick - lastSigTick, meta: true, type: "timeSignature", numerator: ts.numerator, denominator: ts.denominator, metronome: 24, thirtyseconds: 8 });
    lastSigTick = tick;
  }
  track0.push({ deltaTime: 0, meta: true, type: "endOfTrack" });

  const track1: any[] = [];
  const notes: any[] = (ns.notes || []).map((n: any) => ({
    pitch: n.pitch ?? n.note ?? 60,
    velocity: n.velocity ?? 80,
    startTime: n.startTime ?? 0,
    endTime: n.endTime ?? ((n.startTime ?? 0) + 0.1),
    channel: n.isDrum ? 9 : (n.channel ?? 0),
    program: n.program ?? 0,
  }));
  notes.sort((a, b) => a.startTime - b.startTime);

  const channels = new Set(notes.map((n) => n.channel));
  for (const channel of channels) {
    if (channel !== 9) {
      const program = notes.find((n) => n.channel === channel)?.program ?? 0;
      track1.push({ deltaTime: 0, channel, type: "programChange", programNumber: program });
    }
  }

  const events = notes.flatMap((n) => [
    { tick: timeToTicks(n.startTime), channel: n.channel, type: "noteOn", noteNumber: n.pitch, velocity: n.velocity },
    { tick: Math.max(timeToTicks(n.startTime) + 1, timeToTicks(n.endTime)), channel: n.channel, type: "noteOff", noteNumber: n.pitch, velocity: 0 },
  ]);
  events.sort((a: any, b: any) => a.tick - b.tick || (a.type === "noteOff" ? 1 : -1));

  let lastTick = 0;
  for (const e of events) {
    track1.push({ deltaTime: e.tick - lastTick, channel: e.channel, type: e.type, noteNumber: e.noteNumber, velocity: e.velocity });
    lastTick = e.tick;
  }
  track1.push({ deltaTime: 0, meta: true, type: "endOfTrack" });

  return { header: { format: 1 as const, numTracks: 2, ticksPerBeat }, tracks: [track0, track1] };
}

export async function noteSequenceToMidiFile(ns: any, name: string): Promise<File> {
  const plain = toPlainNoteSequence(ns);
  const toEncode = plain.quantizationInfo ? sequences.unquantizeSequence(plain) : plain;
  const midiData = noteSequenceToMidiEvents(toEncode);
  const bytes = new Uint8Array(writeMidi(midiData as any));
  return new File([bytes as unknown as BlobPart], name, { type: "audio/midi" });
}

// ── Nouveaux nœuds : génération, interpolation, humanisation, synthèse ──

export async function genererMelodie(file: File, steps: number, temperature: number, spq: number): Promise<File> {
  const model = await getModel("melody");
  const ns = await fileToNoteSequence(file);
  const qns = sequences.quantizeNoteSequence(ns, spq);
  const continued = await model.continueSequence(qns, steps, temperature);
  return noteSequenceToMidiFile(continued, "magenta_melodie.mid");
}

export async function interpolerMidi(file1: File, file2: File, numInterps: number, temperature: number, position: number): Promise<File> {
  const model = await getModel("interpolation");
  const ns1 = await fileToNoteSequence(file1);
  const ns2 = await fileToNoteSequence(file2);
  const qns1 = sequences.quantizeNoteSequence(ns1, 4);
  const qns2 = sequences.quantizeNoteSequence(ns2, 4);
  const interps = await model.interpolate([qns1, qns2], numInterps, temperature);
  const idx = Math.min(numInterps - 1, Math.floor(position * numInterps));
  return noteSequenceToMidiFile(interps[idx], "magenta_interpolation.mid");
}

export async function genererBatterie(file: File | null, temperature: number, bars: number, tempo: number, similarity: number): Promise<File> {
  const model = await getModel("drumsSeed");
  let seqs: any[];
  if (file) {
    const ns = await fileToNoteSequence(file);
    const qns = sequences.quantizeNoteSequence(ns, 4);
    const out = await model.similar(qns, 1, similarity, temperature);
    seqs = [out[0]];
  } else {
    const numSamples = Math.max(1, Math.ceil(bars / 2));
    seqs = await model.sample(numSamples, temperature);
  }
  const durations = seqs.map((s) => s.totalQuantizedSteps ?? s.totalTime);
  const combined = sequences.concatenate(seqs, durations);
  combined.tempos = [NoteSequence.Tempo.create({ time: 0, qpm: tempo })];
  const outFile = await noteSequenceToMidiFile(combined, "magenta_batterie.mid");
  return outFile;
}

export async function humaniserGroove(file: File, temperature: number, spq: number): Promise<File> {
  const model = await getModel("humanize");
  const ns = await fileToNoteSequence(file);
  const qns = sequences.quantizeNoteSequence(ns, spq);
  const z = await model.encode([qns]);
  const decoded = await model.decode(z, temperature, undefined, spq, 120);
  z.dispose();
  return noteSequenceToMidiFile(decoded[0], "magenta_groove.mid");
}

// ── Continuation ────────────────────────────────────────────────────────

export async function continuerMidi(file: File, steps: number, temperature: number, spq: number): Promise<File> {
  const model = await getModel("continuation");
  const ns = await fileToNoteSequence(file);
  const qns = sequences.quantizeNoteSequence(ns, spq);
  const continued = await model.continueSequence(qns, steps, temperature);
  return noteSequenceToMidiFile(continued, "magenta_continuation.mid");
}

// ── Improvisation ───────────────────────────────────────────────────────

export const MODES = ["Aléatoire", "Marche", "Montant", "Descendant", "Arpège"];
export const MODES_EN = ["Random", "Walk", "Up", "Down", "Arpeggio"];
export const MODES_IDS = ["random", "walk", "up", "down", "arpeggio"];
export const ARP = [0, 2, 4, 6, 7, 5, 3, 1];

export function choisirBouton(step: number, mode: string, prev: number): number {
  switch (mode) {
    case "up": return step % 8;
    case "down": return 7 - (step % 8);
    case "arpeggio": return ARP[step % 8];
    case "walk": {
      const dir = Math.random() < 0.5 ? -1 : 1;
      return Math.max(0, Math.min(7, prev + dir));
    }
    default: return Math.floor(Math.random() * 8);
  }
}

export async function improviser(duree: number, tempo: number, temperature: number, mode: string, seed: number): Promise<File> {
  const model = await getModel("improvisation");
  const stepDuration = 60 / tempo / 4; // double-croches
  const steps = Math.max(1, Math.ceil(duree / stepDuration));
  const notes: any[] = [];
  let t = 0;
  let prevButton = 0;
  const seedVal = seed > 0 ? seed : undefined;
  model.resetState();
  for (let i = 0; i < steps; i++) {
    const button = choisirBouton(i, mode, prevButton);
    (model as any).overrideDeltaTime(stepDuration);
    const pitch = model.next(button, temperature, seedVal);
    const note = Math.max(0, Math.min(127, pitch + 21));
    const noteDuration = stepDuration * 0.9;
    notes.push({ pitch: note, velocity: 100, startTime: t, endTime: t + noteDuration, isDrum: false });
    t += stepDuration;
    prevButton = button;
  }
  const ns = {
    notes,
    tempos: [{ time: 0, qpm: tempo }],
    timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
    totalTime: t,
  };
  return noteSequenceToMidiFile(ns, "magenta_improvisation.mid");
}
