// audio/automate-cellulaire.test.ts
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import {
  genererNotesAutomateCellulaire,
  genererAutomateCellulaire,
  GAMMES,
  normaliserGamme,
  normaliserCle,
  normaliserMode,
  normaliserTopologie,
  normaliserModeVoix,
  normaliserMapping,
} from "./automate-cellulaire";

const defaults = {
  regle: 90,
  reglePersonnalisee: 90,
  topologie: "1D" as const,
  modeVoix: "Polyphonie" as const,
  mapping: "Hauteur" as const,
  largeur: 16,
  hauteur: 16,
  generations: 16,
  graine: 0,
  cle: "Do",
  gamme: "Pentatonique majeure",
  octave: 4,
  dureeNote: 0.25,
  velocite: 100,
  volume: 80,
  timbre: "FM/Oscillateurs" as const,
  probabilite: 0,
  densiteMax: 4,
};

describe("automate-cellulaire", () => {
  it("génère des notes en mode polyphonie 1D", () => {
    const notes = genererNotesAutomateCellulaire(defaults);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.note).toBeGreaterThanOrEqual(0);
      expect(n.note).toBeLessThanOrEqual(127);
      expect(n.velocite).toBeGreaterThan(0);
      expect(n.velocite).toBeLessThanOrEqual(127);
      expect(n.fin).toBeGreaterThan(n.debut);
    }
  });

  it("génère des notes en mode mélodie 1D", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      regle: 30,
      modeVoix: "Mélodie",
      graine: 42,
      cle: "Sol",
      gamme: "Majeur",
      octave: 3,
    });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(defaults.generations);
  });

  it("génère des notes en mode arpège 1D", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      regle: 110,
      modeVoix: "Arpège",
      graine: 1,
    });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(defaults.generations);
  });

  it("respecte la gamme demandée", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      regle: 110,
      modeVoix: "Polyphonie",
      largeur: 24,
      generations: 16,
      graine: 0,
      cle: "La",
      gamme: "Pentatonique mineure",
    });
    const gamme = GAMMES[normaliserGamme("Pentatonique mineure")];
    for (const n of notes) {
      const pc = ((n.note % 12) + 12) % 12;
      expect(gamme).toContain(pc);
    }
  });

  it("génère des notes en mode 2D Conway", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      topologie: "2D Conway",
      modeVoix: "Polyphonie",
      largeur: 12,
      hauteur: 12,
      generations: 5,
      graine: 0,
    });
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.note).toBeGreaterThanOrEqual(0);
      expect(n.note).toBeLessThanOrEqual(127);
      expect(n.fin).toBeGreaterThan(n.debut);
    }
  });

  it("génère des notes en mode 2D Highlife avec mapping vélocité", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      topologie: "2D Highlife",
      mapping: "Vélocité",
      modeVoix: "Mélodie",
      largeur: 10,
      hauteur: 10,
      generations: 4,
      graine: 7,
    });
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.velocite).toBeGreaterThan(0);
      expect(n.velocite).toBeLessThanOrEqual(127);
    }
  });

  it("respecte la densité maximale", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      regle: 90,
      modeVoix: "Polyphonie",
      largeur: 32,
      generations: 16,
      densiteMax: 2,
    });
    for (let i = 0; i < defaults.generations; i++) {
      const count = notes.filter((n) => n.debut >= i * defaults.dureeNote && n.debut < (i + 1) * defaults.dureeNote).length;
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("utilise une règle personnalisée", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      regle: 0,
      reglePersonnalisee: 184,
    });
    expect(notes.length).toBeGreaterThan(0);
  });

  it("produit un AudioBuffer et un fichier MIDI", async () => {
    const res = await genererAutomateCellulaire({
      ...defaults,
      largeur: 8,
      generations: 8,
    });
    expect(res.audio).toBeInstanceOf(AudioBuffer);
    expect(res.midi).toBeInstanceOf(File);
    expect(res.audio.duration).toBeGreaterThan(0);
  });

  it("normalise les modes, clés, gammes, topologies et mappings", () => {
    expect(normaliserMode("Polyphonie")).toBe("Polyphonie");
    expect(normaliserMode("Melody")).toBe("Mélodie");
    expect(normaliserCle("C")).toBe("Do");
    expect(normaliserCle("A")).toBe("La");
    expect(normaliserGamme("Major")).toBe("Majeur");
    expect(normaliserGamme("Minor pentatonic")).toBe("Pentatonique mineure");
    expect(normaliserTopologie("2D Conway")).toBe("2D Conway");
    expect(normaliserTopologie("Highlife")).toBe("2D Highlife");
    expect(normaliserModeVoix("Arpège")).toBe("Arpège");
    expect(normaliserModeVoix("Melody")).toBe("Mélodie");
    expect(normaliserMapping("Pitch + velocity")).toBe("Hauteur + vélocité");
    expect(normaliserMapping("Velocity")).toBe("Vélocité");
  });
});
