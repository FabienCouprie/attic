import { describe, it, expect } from "vitest";
import { writeMidi, parseMidi } from "midi-file";
import { joindreMidi, bouclerMidi, analyserMidi, appliquerInstrumentsParCanal } from "./midi";

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

describe("bouclerMidi", () => {
  it("répète un fichier MIDI sans chevauchement", async () => {
    const f = createMidiFile([{ note: 60, velocity: 100, start: 0, end: 1 }]);
    const looped = await bouclerMidi(f, 3, 0);
    const { notes } = analyserMidi(parseMidi(new Uint8Array(await looped.arrayBuffer())));
    expect(notes.length).toBe(3);
    expect(notes[0].debut).toBeCloseTo(0, 3);
    expect(notes[1].debut).toBeCloseTo(1, 3);
    expect(notes[2].debut).toBeCloseTo(2, 3);
  });

  it("répète un fichier MIDI avec chevauchement", async () => {
    const f = createMidiFile([{ note: 60, velocity: 100, start: 0, end: 1 }]);
    const looped = await bouclerMidi(f, 2, 500);
    const parsed = parseMidi(new Uint8Array(await looped.arrayBuffer()));
    const ons: number[] = [];
    const offs: number[] = [];
    let tick = 0;
    const tpm = parsed.header.ticksPerBeat || 480;
    const tempoEvent = parsed.tracks[0].find((e: any) => e.type === "setTempo");
    const tempo = 60_000_000 / ((tempoEvent as any)?.microsecondsPerBeat ?? 500000);
    for (const e of parsed.tracks[0]) {
      tick += e.deltaTime;
      const t = tick / ((tpm * tempo) / 60);
      if (e.type === "noteOn" && e.velocity > 0) ons.push(t);
      if (e.type === "noteOff" || (e.type === "noteOn" && e.velocity === 0)) offs.push(t);
    }
    expect(ons.length).toBe(2);
    expect(ons[0]).toBeCloseTo(0, 3);
    expect(ons[1]).toBeCloseTo(0.5, 3);
    expect(offs.length).toBe(2);
    expect(offs[0]).toBeCloseTo(1, 3);
    expect(offs[1]).toBeCloseTo(1.5, 3);
  });

  it("ne modifie pas le fichier pour une seule répétition", async () => {
    const f = createMidiFile([{ note: 60, velocity: 100, start: 0, end: 1 }]);
    const looped = await bouclerMidi(f, 1, 0);
    const { notes } = analyserMidi(parseMidi(new Uint8Array(await looped.arrayBuffer())));
    expect(notes.length).toBe(1);
    expect(notes[0].debut).toBeCloseTo(0, 3);
    expect(notes[0].fin).toBeCloseTo(1, 3);
  });
});

// ── Un instrument par canal, pour un seul rendu ──
//
// Le Groove Box expose quatre sorties MIDI — batterie, accords, basse, mélodie —
// et ne déclarait qu'une case « Instrument ». La laisser sur « Suivre le MIDI »
// donnait le bon arrangement, mais y choisir quoi que ce soit l'aplatissait :
// mesuré dans l'app, un réglage sur « Church Organ » mettait les TROIS parties à
// l'orgue, la basse perdant son patch de basse. La cause était que l'instrument
// était passé globalement au moteur de rendu, qui l'applique à tous les canaux.
//
// Écrire l'instrument DANS le MIDI, canal par canal, permet de garder un rendu
// unique — donc un seul tampon audio — pour autant de timbres qu'il y a de
// canaux.
describe("appliquerInstrumentsParCanal", () => {
  /** Un MIDI à trois canaux, chacun avec son propre programme d'origine. */
  function midiTroisCanaux(): Uint8Array {
    const evts: any[] = [
      { deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 },
      { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
      { deltaTime: 0, type: "programChange", channel: 1, programNumber: 33 },
      { deltaTime: 0, type: "programChange", channel: 2, programNumber: 80 },
    ];
    for (const canal of [0, 1, 2]) {
      evts.push({ deltaTime: canal === 0 ? 0 : 240, type: "noteOn", channel: canal, noteNumber: 60 + canal, velocity: 100 });
      evts.push({ deltaTime: 240, type: "noteOff", channel: canal, noteNumber: 60 + canal, velocity: 0 });
    }
    evts.push({ deltaTime: 0, type: "endOfTrack" });
    return new Uint8Array(writeMidi({ header: { format: 1, numTracks: 1, ticksPerBeat: 480 }, tracks: [evts] } as any));
  }

  /** Programme effectif de chaque canal : le PREMIER programChange rencontré. */
  function programmes(bytes: Uint8Array): Record<number, number> {
    const out: Record<number, number> = {};
    for (const piste of parseMidi(bytes).tracks) {
      for (const evt of piste as any[]) {
        if (evt.type === "programChange" && out[evt.channel] === undefined) {
          out[evt.channel] = evt.programNumber;
        }
      }
    }
    return out;
  }

  it("donne à chaque canal l'instrument demandé", () => {
    const out = appliquerInstrumentsParCanal(midiTroisCanaux(), new Map([[0, 19], [1, 35], [2, 73]]));
    expect(programmes(out)).toEqual({ 0: 19, 1: 35, 2: 73 });
  });

  it("laisse intact un canal dont la valeur est négative", () => {
    // « Suivre le MIDI » : la basse doit garder son programme 33.
    const out = appliquerInstrumentsParCanal(midiTroisCanaux(), new Map([[0, 19], [1, -1], [2, -1]]));
    expect(programmes(out)).toEqual({ 0: 19, 1: 33, 2: 80 });
  });

  it("rend les octets inchangés quand rien n'est imposé", () => {
    // Le cas par défaut du nœud : aucune réécriture, donc aucun risque.
    const avant = midiTroisCanaux();
    const apres = appliquerInstrumentsParCanal(avant, new Map([[0, -1], [1, -1], [2, -1]]));
    expect(apres).toBe(avant);
  });

  it("retire l'ancien programme du canal visé, sinon le réglage resterait sans effet", () => {
    // Le piège : les événements insérés sont en tête, mais un programChange
    // ultérieur sur le même canal l'emporterait. Il doit donc disparaître.
    const out = appliquerInstrumentsParCanal(midiTroisCanaux(), new Map([[1, 35]]));
    const tous = parseMidi(out).tracks.flat().filter((e: any) => e.type === "programChange" && e.channel === 1);
    expect(tous).toHaveLength(1);
    expect((tous[0] as any).programNumber).toBe(35);
  });

  it("ne décale pas les notes en retirant des événements", () => {
    // Le deltaTime d'un événement supprimé doit être reporté sur le suivant,
    // sans quoi toute la piste glisse dans le temps.
    const avant = analyserMidi(parseMidi(midiTroisCanaux()));
    const apres = analyserMidi(parseMidi(appliquerInstrumentsParCanal(midiTroisCanaux(), new Map([[0, 19], [1, 35], [2, 73]]))));
    expect(apres.notes.map((n) => +n.debut.toFixed(4))).toEqual(avant.notes.map((n) => +n.debut.toFixed(4)));
    expect(apres.dureeTotale).toBeCloseTo(avant.dureeTotale, 6);
  });

  it("écrit la banque quand le preset n'est pas dans la banque 0", () => {
    // Les kits de percussion vivent en banque 128 : sans les deux contrôleurs de
    // sélection de banque, on obtiendrait le preset de même numéro en banque 0.
    const out = appliquerInstrumentsParCanal(midiTroisCanaux(), new Map([[0, 128 * 128 + 5]]));
    const evts = parseMidi(out).tracks.flat().filter((e: any) => e.channel === 0 && (e.type === "controller" || e.type === "programChange"));
    expect(evts.some((e: any) => e.type === "controller" && e.controllerType === 0)).toBe(true);
    expect(evts.some((e: any) => e.type === "controller" && e.controllerType === 32)).toBe(true);
    expect(programmes(out)[0]).toBe(5);
  });
});
