// plugins/tone-synths.test.ts
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { fiches } from "./tone-synths";
import { notesVersFichierMidi } from "../audio/midi";

function trouver(id: string) { return fiches.find((f) => f.id === id); }

async function midiTest() {
  return notesVersFichierMidi(
    [
      { note: 36, velocite: 100, debut: 0, fin: 0.2 },
      { note: 38, velocite: 100, debut: 0.25, fin: 0.45 },
      { note: 42, velocite: 80, debut: 0.5, fin: 0.6 },
    ],
    120,
    9,
  );
}

const ctx = (fichierMidi: File) => ({
  entree: (i: number) => (i === 0 ? fichierMidi : null),
  entrees: () => [fichierMidi],
  paramTexte: (nom: string, def: string) => def,
  paramNombre: (nom: string, def: number) => {
    const params: Record<string, number> = {
      "Canal MIDI": 10,
      Volume: 80,
    };
    return params[nom] ?? def;
  },
  onProgress: () => {},
  runtime: { sampleRate: 44100 },
});

describe("drum-synth plugin", () => {
  it("est enregistré", () => {
    expect(trouver("drum-synth")).toBeDefined();
  });

  it("rend audio et transmet le MIDI", async () => {
    const f = trouver("drum-synth")!;
    const midi = await midiTest();
    const res = await f.executer(ctx(midi) as any);
    expect(res.valeurs.length).toBe(2);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(res.valeurs[1]).toBeInstanceOf(File);
    expect(res.message).toContain("Batterie");
  });

  it("a de la documentation pour tous ses paramètres", () => {
    const f = trouver("drum-synth")!;
    for (const p of f.parametres) {
      expect(p.doc || p.docEn, `paramètre « ${p.nom} » sans doc`).toBeTruthy();
    }
  });
});
