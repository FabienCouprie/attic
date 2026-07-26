// audio/automate-cellulaire.test.ts
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { genererNotesAutomateCellulaire, genererAutomateCellulaire, GAMMES, normaliserGamme, normaliserCle, normaliserMode } from "./automate-cellulaire";

describe("automate-cellulaire", () => {
  it("génère des notes en mode polyphonie", () => {
    const notes = genererNotesAutomateCellulaire({
      regle: 90, mode: "Polyphonie", largeur: 16, generations: 16, graine: 0,
      cle: "Do", gamme: "Pentatonique majeure", octave: 4, dureeNote: 0.25,
      velocite: 100, volume: 80, timbre: "FM/Oscillateurs",
    });
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.note).toBeGreaterThanOrEqual(0);
      expect(n.note).toBeLessThanOrEqual(127);
      expect(n.velocite).toBeGreaterThan(0);
      expect(n.velocite).toBeLessThanOrEqual(127);
      expect(n.fin).toBeGreaterThan(n.debut);
    }
  });

  it("génère des notes en mode mélodie", () => {
    const notes = genererNotesAutomateCellulaire({
      regle: 30, mode: "Mélodie", largeur: 16, generations: 16, graine: 42,
      cle: "Sol", gamme: "Majeur", octave: 3, dureeNote: 0.2,
      velocite: 80, volume: 80, timbre: "FM/Oscillateurs",
    });
    expect(notes.length).toBeGreaterThan(0);
    // En mode mélodie, il y a au maximum une note par génération.
    expect(notes.length).toBeLessThanOrEqual(16);
  });

  it("respecte la gamme demandée", () => {
    const notes = genererNotesAutomateCellulaire({
      regle: 110, mode: "Polyphonie", largeur: 24, generations: 16, graine: 0,
      cle: "La", gamme: "Pentatonique mineure", octave: 4, dureeNote: 0.25,
      velocite: 100, volume: 80, timbre: "FM/Oscillateurs",
    });
    const gamme = GAMMES[normaliserGamme("Pentatonique mineure")];
    for (const n of notes) {
      const pc = ((n.note % 12) + 12) % 12;
      expect(gamme).toContain(pc);
    }
  });

  it("produit un AudioBuffer et un fichier MIDI", async () => {
    const res = await genererAutomateCellulaire({
      regle: 90, mode: "Polyphonie", largeur: 8, generations: 8, graine: 0,
      cle: "Do", gamme: "Pentatonique majeure", octave: 4, dureeNote: 0.25,
      velocite: 100, volume: 80, timbre: "FM/Oscillateurs",
    });
    expect(res.audio).toBeInstanceOf(AudioBuffer);
    expect(res.midi).toBeInstanceOf(File);
    expect(res.audio.duration).toBeGreaterThan(0);
  });

  it("normalise les modes, clés et gammes", () => {
    expect(normaliserMode("Polyphonie")).toBe("Polyphonie");
    expect(normaliserMode("Melody")).toBe("Mélodie");
    expect(normaliserCle("C")).toBe("Do");
    expect(normaliserCle("A")).toBe("La");
    expect(normaliserGamme("Major")).toBe("Majeur");
    expect(normaliserGamme("Minor pentatonic")).toBe("Pentatonique mineure");
  });
});
