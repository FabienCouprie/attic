// audio/melange-midi.test.ts — Le mélange de fichiers MIDI : le temps, le canal, la vélocité, la hauteur.
//
// Chaque cas lit le fichier rendu comme le rendu le lira, par `analyserMidi` : un instant en secondes,
// un instrument par canal. C'est ce que l'on entend, et c'est là que les défauts que ce module existe
// pour empêcher se voient : deux tempos dont un seul survit, deux instruments sur un canal.
import { describe, expect, it } from "vitest";
import { parseMidi, writeMidi } from "midi-file";
import { analyserMidi } from "./midi";
import { fusionnerMidis } from "./midi-ecriture";
import { melangerMidis, RefusMelange, type EntreeMelange } from "./melange-midi";

interface Partie {
  tpq?: number;
  bpm?: number;
  canal?: number;
  programme?: number;
  /** Instants et durées en temps (noires). */
  notes: { note: number; temps: number; duree?: number; vel?: number; canal?: number }[];
  /** Un changement de programme sur un canal qui ne porte aucune note. */
  orphelin?: { canal: number; programme: number };
  /** L'instant de la fin de piste, en temps ; par défaut, la dernière fin de note. */
  fin?: number;
}

function midi(p: Partie): Uint8Array {
  const tpq = p.tpq ?? 480;
  const canal = p.canal ?? 0;
  const abs: any[] = [
    { tick: 0, type: "setTempo", meta: true, microsecondsPerBeat: Math.round(60e6 / (p.bpm ?? 120)) },
    { tick: 0, type: "timeSignature", meta: true, numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
  ];
  if (p.programme !== undefined) abs.push({ tick: 0, type: "programChange", channel: canal, programNumber: p.programme });
  if (p.orphelin) abs.push({ tick: 0, type: "programChange", channel: p.orphelin.canal, programNumber: p.orphelin.programme });
  for (const n of p.notes) {
    const c = n.canal ?? canal;
    abs.push({ tick: Math.round(n.temps * tpq), type: "noteOn", channel: c, noteNumber: n.note, velocity: n.vel ?? 100 });
    abs.push({ tick: Math.round((n.temps + (n.duree ?? 1)) * tpq), type: "noteOff", channel: c, noteNumber: n.note, velocity: 0 });
  }
  abs.sort((a, b) => a.tick - b.tick || (a.type === "noteOff" ? -1 : 0) - (b.type === "noteOff" ? -1 : 0));
  let avant = 0;
  const piste = abs.map(({ tick, ...e }) => { const d = tick - avant; avant = tick; return { ...e, deltaTime: d }; });
  piste.push({ deltaTime: Math.max(0, Math.round((p.fin ?? 0) * tpq) - avant), type: "endOfTrack", meta: true });
  return new Uint8Array(writeMidi({ header: { format: 1, numTracks: 1, ticksPerBeat: tpq }, tracks: [piste] } as never));
}

/** L'instant de la fin de chaque piste, en ticks. */
const finsDePiste = (octets: Uint8Array) =>
  parseMidi(octets).tracks.map((p) => p.reduce((t, e) => t + e.deltaTime, 0));

const entree = (rang: number, octets: Uint8Array, e: Partial<EntreeMelange> = {}): EntreeMelange =>
  ({ rang, octets, velocite: 1, transposition: 0, canal: "auto", ...e });

const lire = (octets: Uint8Array) => analyserMidi(parseMidi(octets));

const DO = { notes: [{ note: 60, temps: 0 }, { note: 64, temps: 1 }], programme: 0 };
const SOL = { notes: [{ note: 67, temps: 0 }, { note: 71, temps: 1 }], programme: 40 };

describe("melangerMidis", () => {
  it("rend une piste par entrée, la référence en tête avec le seul tempo du fichier", () => {
    const { octets, bilans } = melangerMidis([entree(0, midi(DO)), entree(1, midi(SOL))]);
    const lu = parseMidi(octets);
    expect(lu.tracks).toHaveLength(2);
    expect(bilans.map((b) => b.piste)).toEqual([0, 1]);
    const tempos = lu.tracks.map((p) => p.filter((e) => e.type === "setTempo").length);
    expect(tempos).toEqual([1, 0]);
  });

  it("en Automatique, deux entrées du canal 1 gardent chacune son instrument", () => {
    const { octets, bilans } = melangerMidis([entree(0, midi(DO)), entree(1, midi(SOL))]);
    const { notes, canauxInstrument } = lire(octets);
    expect(bilans.map((b) => b.canaux)).toEqual([[0], [1]]);
    expect(canauxInstrument.get(0)!.programme).toBe(0);
    expect(canauxInstrument.get(1)!.programme).toBe(40);
    expect(notes.filter((n) => n.canal === 1).map((n) => n.note).sort()).toEqual([67, 71]);
  });

  it("« Garder » laisse les deux entrées sur le canal 1, où un seul instrument survit", () => {
    const { octets } = melangerMidis([entree(0, midi(DO), { canal: "garder" }), entree(1, midi(SOL), { canal: "garder" })]);
    const { notes, canauxInstrument } = lire(octets);
    expect(new Set(notes.map((n) => n.canal))).toEqual(new Set([0]));
    expect(canauxInstrument.get(0)!.programme).toBe(40);
  });

  it("en Automatique, la batterie reste sur le canal 10 et un arrangement garde ses canaux", () => {
    const batterie = midi({ canal: 9, notes: [{ note: 36, temps: 0 }, { note: 38, temps: 1 }] });
    const arrangement = midi({ notes: [{ note: 60, temps: 0, canal: 2 }, { note: 40, temps: 0, canal: 5 }] });
    const { bilans } = melangerMidis([entree(0, midi(DO)), entree(1, batterie), entree(2, arrangement)]);
    expect(bilans.map((b) => b.canaux)).toEqual([[0], [9], [2, 5]]);
  });

  it("un canal écrit reçoit toutes les notes, et les canaux sans note de l'entrée sont retirés", () => {
    const octets = midi({ ...SOL, orphelin: { canal: 7, programme: 99 } });
    const { octets: rendu, bilans } = melangerMidis([entree(0, octets, { canal: 4 })]);
    expect(bilans[0].canaux).toEqual([4]);
    const evts = parseMidi(rendu).tracks.flat();
    expect(evts.some((e) => e.type === "programChange" && e.channel === 7)).toBe(false);
    expect(lire(rendu).canauxInstrument.get(4)!.programme).toBe(40);
  });

  it("aligne en secondes deux entrées de tempo et de résolution différents", () => {
    const lente = midi({ bpm: 100, tpq: 480, notes: [{ note: 60, temps: 2 }] });
    const vive = midi({ bpm: 120, tpq: 96, notes: [{ note: 72, temps: 2 }] });
    const { octets, bilans, tempo } = melangerMidis([entree(0, lente), entree(1, vive)]);
    expect(tempo).toBeCloseTo(100, 6);
    expect(bilans.map((b) => b.convertie)).toEqual([false, true]);
    const { notes } = lire(octets);
    const de = (h: number) => notes.find((n) => n.note === h)!;
    // 2 noires à 100 BPM, 1,2 s ; 2 noires à 120 BPM, 1,0 s. Un tick à 100 BPM sur 480 vaut 1,25 ms.
    expect(de(60).debut).toBeCloseTo(1.2, 6);
    expect(Math.abs(de(72).debut - 1.0)).toBeLessThan(0.00125);
    expect(Math.abs(de(72).fin - 1.5)).toBeLessThan(0.00125);
  });

  it("des entrées de même tempo gardent leurs ticks, et sonnent comme leur simple fusion", () => {
    const a = midi(DO);
    const b = midi({ ...SOL, notes: SOL.notes.map((n) => ({ ...n, temps: n.temps + 0.37 })) });
    const { octets, bilans } = melangerMidis([entree(0, a, { canal: "garder" }), entree(1, b, { canal: "garder" })]);
    expect(bilans.every((x) => !x.convertie)).toBe(true);
    const tri = (o: Uint8Array) => lire(o).notes.sort((x, y) => x.debut - y.debut || x.note - y.note);
    expect(tri(octets)).toEqual(tri(fusionnerMidis([a, b])));
  });

  it("garde le silence de fin de chaque entrée, converti avec elle", () => {
    // Une note d'un temps, et la piste refermée au quatrième : 4 noires à 100 BPM, 2,4 s, puis
    // 4 noires à 120 BPM sur une résolution de 96, 2,0 s, soit 1 600 ticks à 100 BPM sur 480.
    const lente = midi({ bpm: 100, notes: [{ note: 60, temps: 0 }], fin: 4 });
    const vive = midi({ bpm: 120, tpq: 96, notes: [{ note: 72, temps: 0 }], fin: 4 });
    expect(finsDePiste(melangerMidis([entree(0, lente), entree(1, vive)]).octets)).toEqual([1920, 1600]);
  });

  it("multiplie la vélocité, bornée de 1 à 127", () => {
    const v = (vel: number, f: number) =>
      lire(melangerMidis([entree(0, midi({ notes: [{ note: 60, temps: 0, vel }] }), { velocite: f })]).octets).notes[0].velocite;
    expect(v(100, 0.5)).toBe(50);
    expect(v(100, 2)).toBe(127);
    expect(v(30, 0.01)).toBe(1);
  });

  it("transpose hors du canal 10, et retire ce qui sortirait du clavier", () => {
    const melodie = midi({ notes: [{ note: 60, temps: 0 }, { note: 120, temps: 1 }] });
    const batterie = midi({ canal: 9, notes: [{ note: 36, temps: 0 }] });
    const { octets, bilans } = melangerMidis([
      entree(0, melodie, { transposition: 12 }), entree(1, batterie, { transposition: 12 }),
    ]);
    expect(lire(octets).notes.map((n) => n.note).sort((a, b) => a - b)).toEqual([36, 72]);
    expect(bilans.map((b) => [b.notes, b.horsClavier])).toEqual([[1, 1], [1, 0]]);
  });

  it("une entrée sans note n'a pas de piste, et ne donne pas le tempo", () => {
    const vide = midi({ bpm: 60, notes: [] });
    const { octets, bilans, tempo } = melangerMidis([entree(0, vide), entree(1, midi({ ...SOL, bpm: 90 }))]);
    expect(parseMidi(octets).tracks).toHaveLength(1);
    expect(bilans.map((b) => b.piste)).toEqual([null, 0]);
    // 60e6 / 90 n'est pas entier : le fichier écrit 666 667 µs par noire.
    expect(tempo).toBeCloseTo(90, 3);
  });

  it("refuse un fichier illisible en le nommant, et un mélange sans note", () => {
    const essai = (f: () => unknown) => { try { f(); return null; } catch (e) { return e; } };
    const illisible = essai(() => melangerMidis([entree(0, midi(DO)), entree(1, new Uint8Array([1, 2, 3]))]));
    expect(illisible).toBeInstanceOf(RefusMelange);
    expect((illisible as RefusMelange).raison).toBe("illisible");
    expect((illisible as RefusMelange).rang).toBe(1);
    const sansNote = essai(() => melangerMidis([entree(0, midi({ notes: [] }))]));
    expect((sansNote as RefusMelange).raison).toBe("sans-note");
  });
});
