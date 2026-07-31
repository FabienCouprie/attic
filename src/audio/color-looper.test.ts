// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { hexToRgb } from "./couleurs";
import { parseCouleurs, rgbTextToRgb, genererNotesColorLooper, genererColorLooper } from "./color-looper";

describe("color-looper", () => {
  it("parse une liste de couleurs hex et rgb", () => {
    const colors = parseCouleurs("#ff0000, #00ff00, rgb(0,0,255), invalid");
    expect(colors.length).toBe(4);
    expect(colors[0]).toEqual({ r: 255, g: 0, b: 0 });
    expect(colors[1]).toEqual({ r: 0, g: 255, b: 0 });
    expect(colors[2]).toEqual({ r: 0, g: 0, b: 255 });
    expect(colors[3]).toEqual({ r: 128, g: 128, b: 128 }); // fallback
  });

  it("convertit hex et rgb", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(rgbTextToRgb("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30 });
  });

  it("genere une note par pas en mode melodie", () => {
    const notes = genererNotesColorLooper({
      couleurs: "#ff0000,#0000ff",
      cle: "C",
      gamme: "majeur",
      mode: "melodie",
      octave: 4,
      portee: 2,
      tempo: 120,
      dureeNote: 0.5,
      mesures: 1,
      modeRendu: "FM/Oscillateurs",
      instrument: 0,
      volume: 80,
    });
    expect(notes.length).toBe(2);
    expect(notes[0].debut).toBe(0);
    expect(notes[1].debut).toBe(0.5);
    expect(notes[0].note).not.toBe(notes[1].note);
  });

  it("genere un accord par pas en mode harmonie", () => {
    const notes = genererNotesColorLooper({
      couleurs: "#ff0000",
      cle: "C",
      gamme: "majeur",
      mode: "harmonie",
      octave: 4,
      portee: 2,
      tempo: 120,
      dureeNote: 0.5,
      mesures: 1,
      modeRendu: "FM/Oscillateurs",
      instrument: 0,
      volume: 80,
    });
    expect(notes.length).toBe(3);
  });

  it("genere audio et midi", async () => {
    const result = await genererColorLooper({
      couleurs: "#ff0000,#0000ff",
      cle: "C",
      gamme: "majeur",
      mode: "melodie",
      octave: 4,
      portee: 2,
      tempo: 120,
      dureeNote: 1,
      mesures: 1,
      modeRendu: "FM/Oscillateurs",
      instrument: 0,
      volume: 80,
    });
    expect(result.audio).toBeDefined();
    expect(result.midi).toBeDefined();
    expect(result.audio.numberOfChannels).toBe(2);
    expect(result.audio.duration).toBeCloseTo(1, 1);
  });
});
