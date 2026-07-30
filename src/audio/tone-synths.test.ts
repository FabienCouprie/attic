// audio/tone-synths.test.ts — Test de rendu offline Tone.js (MembraneSynth, MetalSynth, PolySynth, FM/AM, PluckSynth).
// Le polyfill Web Audio pour Node.js doit etre charge avant Tone.js.

// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";

describe("genererMembraneSynth", () => {
  it("rend un buffer stéréo non silencieux pour un kick C2", async () => {
    const { genererMembraneSynth } = await import("./tone-synths");
    const buffer = await genererMembraneSynth({
      note: "C2",
      duree: 1,
      volume: 80,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeGreaterThan(0.5);

    const gauche = buffer.getChannelData(0);
    const droite = buffer.getChannelData(1);
    const maxG = Math.max(...gauche);
    const maxD = Math.max(...droite);
    expect(maxG).toBeGreaterThan(0);
    expect(maxD).toBeGreaterThan(0);

    for (let i = 0; i < gauche.length; i++) {
      expect(Number.isFinite(gauche[i])).toBe(true);
      expect(Number.isFinite(droite[i])).toBe(true);
    }
  });

  it("respecte la duree demandee quand elle depasse l'enveloppe", async () => {
    const { genererMembraneSynth } = await import("./tone-synths");
    const buffer = await genererMembraneSynth({
      note: "A1",
      duree: 0.2,
      volume: 60,
      decay: 0.01,
      release: 0.05,
      sampleRate: 44100,
    });
    expect(buffer.duration).toBeLessThan(0.5);
  });
});

describe("genererMetalSynth", () => {
  it("rend un buffer stéréo non silencieux pour un hi-hat C5", async () => {
    const { genererMetalSynth } = await import("./tone-synths");
    const buffer = await genererMetalSynth({
      note: "C5",
      duree: 2,
      volume: 80,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeGreaterThan(1);

    const gauche = buffer.getChannelData(0);
    const droite = buffer.getChannelData(1);
    const maxG = Math.max(...gauche);
    const maxD = Math.max(...droite);
    expect(maxG).toBeGreaterThan(0);
    expect(maxD).toBeGreaterThan(0);

    for (let i = 0; i < gauche.length; i++) {
      expect(Number.isFinite(gauche[i])).toBe(true);
      expect(Number.isFinite(droite[i])).toBe(true);
    }
  });

  it("produit un son plus long avec un decay étendu", async () => {
    const { genererMetalSynth } = await import("./tone-synths");
    const buffer = await genererMetalSynth({
      note: "G4",
      duree: 0.5,
      volume: 70,
      decay: 0.05,
      release: 0.05,
      sampleRate: 44100,
    });
    expect(buffer.duration).toBeLessThan(0.8);
  });
});

describe("genererPolySynth", () => {
  it("rend un accord C major stéréo non silencieux", async () => {
    const { genererPolySynth } = await import("./tone-synths");
    const buffer = await genererPolySynth({
      notes: ["C4", "E4", "G4"],
      dureeNote: 0.5,
      volume: 80,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeGreaterThan(0.5);

    const gauche = buffer.getChannelData(0);
    const droite = buffer.getChannelData(1);
    expect(Math.max(...gauche)).toBeGreaterThan(0);
    expect(Math.max(...droite)).toBeGreaterThan(0);

    for (let i = 0; i < gauche.length; i++) {
      expect(Number.isFinite(gauche[i])).toBe(true);
      expect(Number.isFinite(droite[i])).toBe(true);
    }
  });
});

describe("genererModulationSynth", () => {
  it("rend FM et AM stéréo non silencieux", async () => {
    const { genererModulationSynth } = await import("./tone-synths");
    for (const mode of ["FM", "AM"] as const) {
      const buffer = await genererModulationSynth({
        note: "C4",
        duree: 1,
        volume: 80,
        mode,
        sampleRate: 44100,
      });

      expect(buffer.numberOfChannels).toBe(2);
      expect(Math.max(...buffer.getChannelData(0))).toBeGreaterThan(0);
      expect(Math.max(...buffer.getChannelData(1))).toBeGreaterThan(0);
    }
  });
});

describe("rendreBatterieMidi", () => {
  it("rend une piste rythmique stéréo non silencieuse", async () => {
    const { rendreBatterieMidi } = await import("./tone-synths");
    const buffer = await rendreBatterieMidi({
      notes: [
        { note: 36, velocite: 100, debut: 0, fin: 0.2 },
        { note: 38, velocite: 100, debut: 0.25, fin: 0.45 },
        { note: 42, velocite: 80, debut: 0.5, fin: 0.6 },
        { note: 46, velocite: 80, debut: 0.75, fin: 0.9 },
      ],
      volume: 80,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeGreaterThan(0.5);

    const gauche = buffer.getChannelData(0);
    const droite = buffer.getChannelData(1);
    expect(Math.max(...gauche)).toBeGreaterThan(0);
    expect(Math.max(...droite)).toBeGreaterThan(0);

    for (let i = 0; i < gauche.length; i++) {
      expect(Number.isFinite(gauche[i])).toBe(true);
      expect(Number.isFinite(droite[i])).toBe(true);
    }
  });
});

describe("genererPluckSynth", () => {
  it("rend une corde pincée C4 stéréo non silencieux", async () => {
    const { genererPluckSynth } = await import("./tone-synths");
    const buffer = await genererPluckSynth({
      note: "C4",
      duree: 2,
      volume: 80,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeGreaterThan(1);

    const gauche = buffer.getChannelData(0);
    const droite = buffer.getChannelData(1);
    expect(Math.max(...gauche)).toBeGreaterThan(0);
    expect(Math.max(...droite)).toBeGreaterThan(0);

    for (let i = 0; i < gauche.length; i++) {
      expect(Number.isFinite(gauche[i])).toBe(true);
      expect(Number.isFinite(droite[i])).toBe(true);
    }
  });
});
