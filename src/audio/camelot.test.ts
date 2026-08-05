// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { parseCamelot, camelotToAccord, genererParcoursCamelot, genererNotesCamelot, genererCamelot, genererSvgCamelot } from "./camelot";

function bufferNonSilencieux(buf: AudioBuffer): boolean {
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      if (Math.abs(d[i]) > 1e-6) return true;
    }
  }
  return false;
}

describe("camelot", () => {
  it("parse les codes Camelot", () => {
    expect(parseCamelot("4B")).toEqual({ n: 4, ring: "B" });
    expect(parseCamelot("7a")).toEqual({ n: 7, ring: "A" });
    expect(parseCamelot("13B")).toBeNull();
    expect(parseCamelot("abc")).toBeNull();
  });

  it("convertit les codes en accords", () => {
    expect(camelotToAccord("4B")).toBe("Ab");
    expect(camelotToAccord("4A")).toBe("Fm");
    expect(camelotToAccord("8B")).toBe("C");
    expect(camelotToAccord("8A")).toBe("Am");
  });

  it("génère un parcours complet autour de la roue", () => {
    const p = genererParcoursCamelot("4B", "complet", 12);
    expect(p).toHaveLength(12);
    expect(p[0]).toBe("4B");
    expect(p[1]).toBe("5B");
    expect(p[11]).toBe("3B");
  });

  it("génère un parcours de voisins", () => {
    const p = genererParcoursCamelot("4B", "voisins", 5);
    expect(p).toHaveLength(5);
    expect(p[0]).toBe("4B");
    // +1 puis relatif, etc.
    expect(p[1]).toBe("5B");
    expect(p[2]).toBe("5A");
  });

  it("génère des notes et un audio non silencieux", async () => {
    const out = genererNotesCamelot({
      depart: "4B",
      parcours: "complet",
      pas: 4,
      tempo: 120,
      dureeNote: 0.5,
      octave: 3,
      mode: "bloc",
      modeRendu: "FM/Oscillateurs",
      instrument: 0,
      volume: 80,
    });
    expect(out.notes.length).toBeGreaterThan(0);
    expect(out.codes.length).toBe(4);
    expect(out.accords.length).toBe(4);

    const { audio } = await genererCamelot({
      depart: "4B",
      parcours: "complet",
      pas: 4,
      tempo: 120,
      dureeNote: 0.5,
      octave: 3,
      mode: "bloc",
      modeRendu: "FM/Oscillateurs",
      instrument: 0,
      volume: 80,
    });
    expect(bufferNonSilencieux(audio)).toBe(true);
  });

  it("génère des notes en mode arpège", async () => {
    const out = genererNotesCamelot({
      depart: "8A",
      parcours: "complet",
      pas: 3,
      tempo: 120,
      dureeNote: 0.5,
      octave: 4,
      mode: "arpege",
      modeRendu: "FM/Oscillateurs",
      instrument: 0,
      volume: 80,
    });
    expect(out.notes.length).toBeGreaterThan(0);
    // En arpège, les notes d'un accord sont décalées dans le temps
    const starts = out.notes.map((n) => n.debut);
    expect(new Set(starts).size).toBeGreaterThan(1);
  });

  it("génère un SVG de la roue avec le parcours", async () => {
    const svg = genererSvgCamelot(["4B", "5B", "5A", "4A"], { width: 400, height: 400 });
    expect(svg.type).toBe("image/svg+xml");
    expect(svg.name).toBe("camelot.svg");
    const text = await svg.text();
    expect(text).toContain("Roue de Camelot");
    expect(text).toContain("4B");
    expect(text).toContain("4B → 5B → 5A → 4A");
    expect(text).toContain("<svg");
    expect(text).toContain("<rect");

    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    expect(doc.documentElement.tagName).toBe("svg");
    expect(doc.querySelector("parsererror")).toBeNull();
  });
});
