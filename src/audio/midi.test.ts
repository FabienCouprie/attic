import { describe, it, expect } from "vitest";
import { writeMidi, parseMidi } from "midi-file";
import { joindreMidi, analyserMidi } from "./midi";

function createMidiFile(
  notes: { note: number; velocity: number; start: number; end: number }[],
  opts: { tempoBpm?: number; programChange?: number; ticksPerBeat?: number } = {},
): File {
  const tempoBpm = opts.tempoBpm ?? 120;
  const ticksPerBeat = opts.ticksPerBeat ?? 480;
  const microsecPerBeat = Math.round(60_000_000 / tempoBpm);
  function secToTick(sec: number) {
    return Math.round((sec / 60) * tempoBpm * ticksPerBeat);
  }

  const events: any[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: microsecPerBeat },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4 },
  ];
  if (opts.programChange !== undefined) {
    events.push({ deltaTime: 0, type: "programChange", channel: 0, programNumber: opts.programChange });
  }

  const lines: { tick: number; type: string; channel: number; noteNumber: number; velocity: number }[] = [];
  for (const n of notes) {
    const tOn = secToTick(n.start);
    const tOff = Math.max(tOn + 1, secToTick(n.end));
    lines.push({ tick: tOn, type: "noteOn", channel: 0, noteNumber: n.note, velocity: n.velocity });
    lines.push({ tick: tOff, type: "noteOff", channel: 0, noteNumber: n.note, velocity: 0 });
  }
  lines.sort((a, b) => a.tick - b.tick || (a.type === "noteOff" ? 1 : -1));

  let tick = 0;
  for (const l of lines) {
    events.push({ deltaTime: l.tick - tick, ...l });
    tick = l.tick;
  }
  events.push({ deltaTime: 0, type: "endOfTrack" });

  const midi = {
    header: { format: 1 as const, numTracks: 1, ticksPerBeat },
    tracks: [events],
  };
  const bytes = new Uint8Array(writeMidi(midi as any));
  return new File([bytes], "test.mid", { type: "audio/midi" });
}

describe("joindreMidi", () => {
  it("concatenate deux fichiers MIDI sans chevauchement", async () => {
    const f1 = createMidiFile([{ note: 60, velocity: 100, start: 0, end: 1 }]);
    const f2 = createMidiFile([{ note: 64, velocity: 100, start: 0, end: 1 }]);
    const joined = await joindreMidi(f1, f2, 0);
    const { notes, dureeTotale } = analyserMidi(parseMidi(new Uint8Array(await joined.arrayBuffer())));
    expect(notes.length).toBe(2);
    expect(notes[0].note).toBe(60);
    expect(notes[0].debut).toBeCloseTo(0, 3);
    expect(notes[0].fin).toBeCloseTo(1, 3);
    expect(notes[1].note).toBe(64);
    expect(notes[1].debut).toBeCloseTo(1, 3);
    expect(notes[1].fin).toBeCloseTo(2, 3);
    expect(dureeTotale).toBeGreaterThan(1.9);
  });

  it("chevauche les deux fichiers MIDI", async () => {
    const f1 = createMidiFile([{ note: 60, velocity: 100, start: 0, end: 1 }]);
    const f2 = createMidiFile([{ note: 67, velocity: 100, start: 0, end: 1 }]);
    const joined = await joindreMidi(f1, f2, 0.5);
    const { notes } = analyserMidi(parseMidi(new Uint8Array(await joined.arrayBuffer())));
    expect(notes.length).toBe(2);
    const n2 = notes.find((n) => n.note === 67);
    expect(n2).toBeDefined();
    expect(n2!.debut).toBeCloseTo(0.5, 3);
    expect(n2!.fin).toBeCloseTo(1.5, 3);
  });

  it("conserve les changements de programme", async () => {
    const f1 = createMidiFile([{ note: 60, velocity: 100, start: 0, end: 0.5 }], { programChange: 5 });
    const f2 = createMidiFile([{ note: 64, velocity: 100, start: 0, end: 0.5 }], { programChange: 10 });
    const joined = await joindreMidi(f1, f2, 0);
    const parsed = parseMidi(new Uint8Array(await joined.arrayBuffer()));
    const programChanges = parsed.tracks[0].filter((e: any) => e.type === "programChange");
    expect(programChanges.length).toBe(2);
    expect((programChanges[0] as any).programNumber).toBe(5);
    expect((programChanges[1] as any).programNumber).toBe(10);
  });

  it("gère des ticksPerBeat différents", async () => {
    const f1 = createMidiFile([{ note: 60, velocity: 100, start: 0, end: 1 }], { ticksPerBeat: 480 });
    const f2 = createMidiFile([{ note: 64, velocity: 100, start: 0, end: 1 }], { ticksPerBeat: 96 });
    const joined = await joindreMidi(f1, f2, 0);
    const { notes } = analyserMidi(parseMidi(new Uint8Array(await joined.arrayBuffer())));
    expect(notes.length).toBe(2);
    expect(notes[0].debut).toBeCloseTo(0, 3);
    expect(notes[1].debut).toBeCloseTo(1, 3);
  });
});
