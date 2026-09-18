// audio/multi-reservoir.test.ts — Vérification du générateur multi-réservoir.
import { describe, it, expect, beforeAll } from "vitest";
import { parseMidi } from "midi-file";
import { genererMultiReservoir } from "./multi-reservoir";

class AudioBufferPolyfill {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private canaux: Float32Array[];
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.duration = opts.length / opts.sampleRate;
    this.canaux = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(c: number): Float32Array { return this.canaux[c]; }
  copyToChannel(src: Float32Array, c: number): void { this.canaux[c].set(src.subarray(0, this.length)); }
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

function config() {
  return {
    cle: "C",
    gamme: "majeur",
    tempo: 120,
    pasParBeat: 2,
    mesures: 2,
    volume: 80,
    timbre: "Triangle",
    graine: 123,
    melodieNeurones: 10,
    melodieConnectivite: 30,
    melodieMemoire: 30,
    basseNeurones: 8,
    basseConnectivite: 25,
    basseOctave: 2,
    harmonieNeurones: 6,
    harmonieConnectivite: 20,
    rythmeNeurones: 8,
    rythmeDensite: 50,
    rythmeInstrument: 16384,
    rythmeTranspose: 0,
    influence: 0.5,
  };
}

describe("genererMultiReservoir", () => {
  it("renvoie un mix audio + 4 fichiers MIDI", () => {
    const res = genererMultiReservoir(config() as any);
    expect(res.buffer).toBeInstanceOf(AudioBufferPolyfill);
    expect(res.buffer.numberOfChannels).toBe(2);
    expect(res.buffer.length).toBeGreaterThan(0);
    expect(res.midis).toBeDefined();
    expect(res.midis.melody).toBeInstanceOf(File);
    expect(res.midis.bass).toBeInstanceOf(File);
    expect(res.midis.harmony).toBeInstanceOf(File);
    expect(res.midis.rhythm).toBeInstanceOf(File);
    expect(res.midis.melody.name).toBe("multi-melody.mid");
    expect(res.midis.bass.name).toBe("multi-bass.mid");
    expect(res.midis.harmony.name).toBe("multi-harmony.mid");
    expect(res.midis.rhythm.name).toBe("multi-rhythm.mid");
    expect(res.midis.melody.size).toBeGreaterThan(0);
    expect(res.midis.bass.size).toBeGreaterThan(0);
    expect(res.midis.harmony.size).toBeGreaterThan(0);
    expect(res.midis.rhythm.size).toBeGreaterThan(0);
    expect(res.details).toContain("Mélodie");
    expect(res.details).toContain("Basse");
    expect(res.details).toContain("Harmonie");
    expect(res.details).toContain("Rythme");
  });

  it("est reproductible avec la même graine", () => {
    const cfg = config() as any;
    const res1 = genererMultiReservoir(cfg);
    const res2 = genererMultiReservoir(cfg);
    expect(res1.details).toBe(res2.details);
    expect(res1.midis.melody.size).toBe(res2.midis.melody.size);
    expect(res1.midis.bass.size).toBe(res2.midis.bass.size);
    expect(res1.midis.harmony.size).toBe(res2.midis.harmony.size);
    expect(res1.midis.rhythm.size).toBe(res2.midis.rhythm.size);
  });

  it("écrit l'instrument choisi dans la sortie MIDI de chaque partie", async () => {
    // Défaut corrigé : seule la piste de rythme portait son instrument. Les autres
    // sorties partaient sans changement de programme, donc le nœud qui les rendait en
    // aval retombait sur le piano par défaut, et les cases n'avaient aucun effet.
    // 24 = guitare nylon, 33 = basse doigtée, 48 = ensemble de cordes.
    const res = genererMultiReservoir({ ...config(), melodieInstrument: 24, basseInstrument: 33, harmonieInstrument: 48 } as never);
    const programme = async (fichier: File) => {
      const midi = parseMidi(new Uint8Array(await fichier.arrayBuffer()));
      const ev = midi.tracks.flat().find((e) => e.type === "programChange") as { programNumber?: number; channel?: number } | undefined;
      return ev ? { programme: ev.programNumber, canal: ev.channel } : null;
    };
    expect(await programme(res.midis.melody)).toEqual({ programme: 24, canal: 0 });
    expect(await programme(res.midis.bass)).toEqual({ programme: 33, canal: 1 });
    expect(await programme(res.midis.harmony)).toEqual({ programme: 48, canal: 2 });
  });

  it("n'écrit aucun instrument quand on laisse « Suivre le MIDI »", async () => {
    const res = genererMultiReservoir(config() as never);
    for (const fichier of [res.midis.melody, res.midis.bass, res.midis.harmony]) {
      const midi = parseMidi(new Uint8Array(await fichier.arrayBuffer()));
      expect(midi.tracks.flat().some((e) => e.type === "programChange")).toBe(false);
    }
  });

  it("donne un canal à chaque partie, pour qu'elles ne se disputent pas le même instrument", async () => {
    // Assez long pour que les quatre parties jouent : sur deux mesures, l'harmonie
    // peut ne produire aucune note, et le test ne vérifierait rien.
    const res = genererMultiReservoir({ ...config(), mesures: 8 } as never);
    const canaux = async (fichier: File) => {
      const midi = parseMidi(new Uint8Array(await fichier.arrayBuffer()));
      return new Set(midi.tracks.flat().filter((e) => e.type === "noteOn").map((e) => (e as { channel: number }).channel));
    };
    for (const [nom, fichier, canal] of [["mélodie", res.midis.melody, 0], ["basse", res.midis.bass, 1],
                                         ["harmonie", res.midis.harmony, 2], ["rythme", res.midis.rhythm, 9]] as [string, File, number][]) {
      expect(await canaux(fichier), nom).toEqual(new Set([canal]));
    }
  });

  it("mappe la piste rythmique sur une batterie General MIDI", async () => {
    const res = genererMultiReservoir(config() as any);
    const bytes = new Uint8Array(await res.midis.rhythm.arrayBuffer());
    const midi = parseMidi(bytes);
    const gmDrums = new Set([36, 38, 39, 42, 44, 45, 46, 49, 50]);
    const notes = new Set<number>();
    const noteOnEvents = [];
    for (const track of midi.tracks) {
      for (const ev of track) {
        if (ev.type === "noteOn" && ev.noteNumber !== undefined) {
          notes.add(ev.noteNumber);
          noteOnEvents.push(ev);
        }
      }
    }
    expect(notes.size).toBeGreaterThan(0);
    for (const n of notes) {
      expect(gmDrums.has(n)).toBe(true);
    }
    expect(noteOnEvents.length).toBeGreaterThan(0);
    expect(noteOnEvents.every((ev) => ev.channel === 9)).toBe(true);
    const programChange = midi.tracks[0].find((ev) => ev.type === "programChange");
    expect(programChange).toBeDefined();
    expect(programChange?.channel).toBe(9);
  });

  it("ne produit jamais une piste rythmique MIDI vide", async () => {
    const cfg = { ...config(), rythmeDensite: 10, mesures: 1, pasParBeat: 1 } as any;
    const res = genererMultiReservoir(cfg);
    const bytes = new Uint8Array(await res.midis.rhythm.arrayBuffer());
    const midi = parseMidi(bytes);
    const noteOnCount = midi.tracks.reduce((acc, tr) => acc + tr.filter((ev: any) => ev.type === "noteOn").length, 0);
    expect(noteOnCount).toBeGreaterThan(0);
  });

  it("transpose les notes de batterie MIDI", async () => {
    const cfg = { ...config(), rythmeTranspose: 12 } as any;
    const res = genererMultiReservoir(cfg);
    const baseRes = genererMultiReservoir(config() as any);
    const baseBytes = new Uint8Array(await baseRes.midis.rhythm.arrayBuffer());
    const transposedBytes = new Uint8Array(await res.midis.rhythm.arrayBuffer());
    const baseMidi = parseMidi(baseBytes);
    const transposedMidi = parseMidi(transposedBytes);
    const baseNotes = baseMidi.tracks[0].filter((ev: any) => ev.type === "noteOn" && ev.noteNumber !== undefined).map((ev: any) => ev.noteNumber as number);
    const transposedNotes = transposedMidi.tracks[0].filter((ev: any) => ev.type === "noteOn" && ev.noteNumber !== undefined).map((ev: any) => ev.noteNumber as number);
    expect(transposedNotes.length).toBeGreaterThan(0);
    expect(transposedNotes.length).toBe(baseNotes.length);
    for (let i = 0; i < baseNotes.length; i++) {
      expect(transposedNotes[i]).toBe(baseNotes[i] + 12);
    }
  });
});
