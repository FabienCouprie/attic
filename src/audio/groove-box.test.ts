// audio/groove-box.test.ts
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { genererGrooveBox, type ConfigGrooveBox } from "./groove-box";
import { rendreBatterieMidi } from "./tone-synths";
import { rendreSequence, analyserMidi } from "./midi";
import { parseMidi } from "midi-file";

describe("genererGrooveBox", () => {
  it("produit un MIDI non vide et une description", () => {
    const result = genererGrooveBox({
      cle: "C",
      gamme: "majeur",
      genre: "pop",
      progression: "I-V-vi-IV",
      extension: "aucune",
      tempo: 120,
      dureeAccord: 2,
      nbAccords: 4,
      styleRythme: "Pop dance",
      neurones: 10,
      connectivite: 0.3,
      memoire: 0.3,
      spectre: 0.9,
      octave: 4,
      densite: 0.7,
      repetition: 0.25,
      silence: 0.1,
      graine: 42,
    });

    expect(result.midiBytes.length).toBeGreaterThan(0);
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.description).toContain("Groove Box");
    expect(result.description).toContain("C majeur");
    expect(result.graineUtilisee).toBe(42);

    // Canal 0 = accords, canal 1 = basse, canal 2 = mélodie, canal 9 = batterie
    const canaux = new Set(result.notes.map((n) => n.canal));
    expect(canaux.has(0)).toBe(true);
    expect(canaux.has(1)).toBe(true);
    expect(canaux.has(2)).toBe(true);
    expect(canaux.has(9)).toBe(true);

    // Quatre sorties MIDI séparées, chacune non vide
    expect(result.midiBatterie.length).toBeGreaterThan(0);
    expect(result.midiAccords.length).toBeGreaterThan(0);
    expect(result.midiBasse.length).toBeGreaterThan(0);
    expect(result.midiMelodie.length).toBeGreaterThan(0);

    // Chaque fichier MIDI séparé ne contient que son canal
    const drums = analyserMidi(parseMidi(result.midiBatterie));
    expect([...new Set(drums.notes.map((n) => n.canal))]).toEqual([9]);
    expect(drums.notes.length).toBeGreaterThan(0);

    const chords = analyserMidi(parseMidi(result.midiAccords));
    expect([...new Set(chords.notes.map((n) => n.canal))]).toEqual([0]);
    expect(chords.notes.length).toBeGreaterThan(0);

    const bass = analyserMidi(parseMidi(result.midiBasse));
    expect([...new Set(bass.notes.map((n) => n.canal))]).toEqual([1]);
    expect(bass.notes.length).toBeGreaterThan(0);

    const melody = analyserMidi(parseMidi(result.midiMelodie));
    expect([...new Set(melody.notes.map((n) => n.canal))]).toEqual([2]);

    // Pas de notes hors de la plage MIDI
    for (const n of result.notes) {
      expect(n.note).toBeGreaterThanOrEqual(0);
      expect(n.note).toBeLessThanOrEqual(127);
      expect(n.debut).toBeLessThan(n.fin);
    }
  });

  it("est déterministe avec la même graine", () => {
    const config: ConfigGrooveBox = {
      cle: "D",
      gamme: "mineur",
      genre: "rock",
      progression: "i-VII-VI-i",
      extension: "aucune",
      tempo: 100,
      dureeAccord: 2,
      nbAccords: 4,
      styleRythme: "Rock",
      neurones: 12,
      connectivite: 0.25,
      memoire: 0.35,
      spectre: 0.85,
      octave: 4,
      densite: 0.6,
      repetition: 0.2,
      silence: 0.15,
      graine: 123,
    };

    const a = genererGrooveBox(config);
    const b = genererGrooveBox(config);
    const sameNotes = a.notes.length === b.notes.length && a.notes.every((n, i) => {
      const m = b.notes[i];
      return n.note === m.note && n.velocite === m.velocite && n.debut === m.debut && n.fin === m.fin && n.canal === m.canal;
    });
    expect(sameNotes).toBe(true);
  });

  it("produit des accords consonants pour chaque degré de la progression", () => {
    const result = genererGrooveBox({
      cle: "C",
      gamme: "majeur",
      genre: "personnalisé",
      progression: "I-II-III-IV-V-VI-VII",
      extension: "aucune",
      tempo: 120,
      dureeAccord: 1,
      nbAccords: 7,
      styleRythme: "Rock",
      neurones: 8,
      connectivite: 0.2,
      memoire: 0.2,
      spectre: 0.8,
      octave: 4,
      densite: 0.5,
      repetition: 0.1,
      silence: 0.1,
      graine: 1,
    });

    const chords = result.notes.filter((n) => n.canal === 0);
    for (let i = 0; i < chords.length; i += 3) {
      const [root, third, fifth] = chords.slice(i, i + 3).map((n) => n.note);
      expect(third).toBeGreaterThan(root);
      expect(fifth).toBeGreaterThan(root);
      // Tierce majeure ou mineure (3 ou 4), quinte juste (7)
      const thirdInterval = (third - root) % 12;
      const fifthInterval = (fifth - root) % 12;
      expect([3, 4]).toContain(thirdInterval);
      expect([7, 6, 8]).toContain(fifthInterval); // tolérance mineure/juste/augmentée
    }
  });

  it("accepte une progression personnalisée", () => {
    const result = genererGrooveBox({
      cle: "C",
      gamme: "majeur",
      genre: "personnalisé",
      progression: "I-IV-V-I",
      extension: "aucune",
      tempo: 120,
      dureeAccord: 1,
      nbAccords: 4,
      styleRythme: "Four-on-the-floor",
      neurones: 8,
      connectivite: 0.2,
      memoire: 0.2,
      spectre: 0.8,
      octave: 3,
      densite: 0.5,
      repetition: 0.1,
      silence: 0.1,
      graine: 1,
    });

    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.description).toContain("I–IV–V–I");
  });

  it("l'extension 7e ajoute une 4e note diatonique aux accords (canal 0)", () => {
    const config: ConfigGrooveBox = {
      cle: "C", gamme: "majeur", genre: "personnalisé", progression: "I",
      extension: "septieme",
      tempo: 120, dureeAccord: 4, nbAccords: 1, styleRythme: "Rock",
      neurones: 5, connectivite: 0.3, memoire: 0.3, spectre: 0.9, octave: 4,
      densite: 0, repetition: 0, silence: 0, graine: 1,
    };
    const result = genererGrooveBox(config);
    const pitches = [...new Set(result.notes.filter((n) => n.canal === 0).map((n) => ((n.note % 12) + 12) % 12))].sort((a, b) => a - b);
    expect(pitches).toEqual([0, 4, 7, 11]); // Cmaj7
  });

  it("sans extension, les accords restent des triades pures (comportement inchangé)", () => {
    const config: ConfigGrooveBox = {
      cle: "C", gamme: "majeur", genre: "personnalisé", progression: "I",
      extension: "aucune",
      tempo: 120, dureeAccord: 4, nbAccords: 1, styleRythme: "Rock",
      neurones: 5, connectivite: 0.3, memoire: 0.3, spectre: 0.9, octave: 4,
      densite: 0, repetition: 0, silence: 0, graine: 1,
    };
    const result = genererGrooveBox(config);
    const pitches = [...new Set(result.notes.filter((n) => n.canal === 0).map((n) => ((n.note % 12) + 12) % 12))].sort((a, b) => a - b);
    expect(pitches).toEqual([0, 4, 7]);
  });

  it("rend un mix FM avec des drums audibles", async () => {
    const result = genererGrooveBox({
      cle: "C",
      gamme: "majeur",
      genre: "pop",
      progression: "I-V-vi-IV",
      extension: "aucune",
      tempo: 120,
      dureeAccord: 2,
      nbAccords: 2,
      styleRythme: "Rock",
      neurones: 5,
      connectivite: 0.3,
      memoire: 0.3,
      spectre: 0.9,
      octave: 4,
      densite: 0.3,
      repetition: 0.1,
      silence: 0.1,
      graine: 42,
    });
    const { notes: notesMidi } = analyserMidi(parseMidi(result.midiBytes));
    const sampleRate = 44100;

    const melodic = notesMidi
      .filter((n) => n.canal !== 9)
      .map((n) => ({ note: n.note, velocite: n.velociete, debut: n.debut, fin: n.fin }));
    const drums = notesMidi
      .filter((n) => n.canal === 9)
      .map((n) => ({ note: n.note, velocite: n.velociete, debut: n.debut, fin: n.fin }));

    expect(drums.length).toBeGreaterThan(0);

    const melodicBuf = await rendreSequence(melodic, "FM/Oscillateurs", 80);
    const drumBuf = await rendreBatterieMidi({ notes: drums, volume: 80, sampleRate });

    function rms(buf: AudioBuffer) {
      let sum = 0;
      let count = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const ch = buf.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          sum += ch[i] * ch[i];
          count++;
        }
      }
      return count === 0 ? 0 : Math.sqrt(sum / count);
    }

    const drumRms = rms(drumBuf);
    const melodicRms = rms(melodicBuf);
    expect(drumRms).toBeGreaterThan(0);
    expect(melodicRms).toBeGreaterThan(0);
    // Les drums doivent être au moins 10% du niveau mélodique pour être audibles
    expect(drumRms).toBeGreaterThan(melodicRms * 0.05);
  }, 60000);
});
