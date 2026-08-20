// audio/accords-sequencer.test.ts
// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import {
  decoderMotifAccords, encoderMotifAccords, NB_LIGNES_ACCORDS, NB_DEGRES_ACCORDS,
  degreeEtExtensionPourLigne, nomAccordPourLigne, nomNotePourPitchClass, qualiteTriade, qualiteSeptieme, qualiteSixte,
  genererNotesSequenceurAccords, rendreSequenceurAccords, midiSequenceurAccords,
} from "./accords-sequencer";

// 21 lignes : 7 degrés × triade/7e/6e. Progression I – V – vi – IV en triades.
const MOTIF_I_V_vi_IV = [
  "1000000000000000", "0000000000000000", "0000000000000000", // I
  "0000000000000000", "0000000000000000", "0000000000000000", // II
  "0000000000000000", "0000000000000000", "0000000000000000", // III
  "0000000000001000", "0000000000000000", "0000000000000000", // IV
  "0000100000000000", "0000000000000000", "0000000000000000", // V
  "0000000010000000", "0000000000000000", "0000000000000000", // VI
  "0000000000000000", "0000000000000000", "0000000000000000", // VII
].join("|");

// Même progression mais le V est en V7 (ligne 13 = 4*3 + 1).
const MOTIF_I_V7_vi_IV = [
  "1000000000000000", "0000000000000000", "0000000000000000", // I
  "0000000000000000", "0000000000000000", "0000000000000000", // II
  "0000000000000000", "0000000000000000", "0000000000000000", // III
  "0000000000001000", "0000000000000000", "0000000000000000", // IV
  "0000000000000000", "0000100000000000", "0000000000000000", // V7
  "0000000010000000", "0000000000000000", "0000000000000000", // VI
  "0000000000000000", "0000000000000000", "0000000000000000", // VII
].join("|");

describe("decoderMotifAccords", () => {
  it("découpe un motif en 21 rangées x N pas", () => {
    const grille = decoderMotifAccords(MOTIF_I_V_vi_IV, 16);
    expect(grille).toHaveLength(NB_LIGNES_ACCORDS);
    expect(grille[0]).toHaveLength(16);
    expect(grille[0][0]).toBe(true);   // I triade
    expect(grille[9][12]).toBe(true);  // IV triade
    expect(grille[12][4]).toBe(true); // V triade
    expect(grille[15][8]).toBe(true); // VI triade
  });
});

describe("encoderMotifAccords", () => {
  it("encode une grille d'accords", () => {
    const grille = decoderMotifAccords(MOTIF_I_V_vi_IV, 16);
    expect(encoderMotifAccords(grille)).toBe(MOTIF_I_V_vi_IV);
  });
});

describe("degreeEtExtensionPourLigne", () => {
  it("associe les 3 lignes de chaque degré à triade/7e/6e", () => {
    for (let d = 0; d < NB_DEGRES_ACCORDS; d++) {
      expect(degreeEtExtensionPourLigne(d * 3)).toEqual({ degree: d, extension: "aucune" });
      expect(degreeEtExtensionPourLigne(d * 3 + 1)).toEqual({ degree: d, extension: "septieme" });
      expect(degreeEtExtensionPourLigne(d * 3 + 2)).toEqual({ degree: d, extension: "sixte" });
    }
  });
});

describe("nomNotePourPitchClass", () => {
  it("retourne les noms anglais des 12 classes de hauteur", () => {
    expect(nomNotePourPitchClass(0)).toBe("C");
    expect(nomNotePourPitchClass(1)).toBe("C#");
    expect(nomNotePourPitchClass(11)).toBe("B");
  });
});

describe("qualiteTriade", () => {
  it("donne les qualités abrégées correctes pour la gamme majeure", () => {
    const degres = [0, 2, 4, 5, 7, 9, 11];
    expect(qualiteTriade(degres, 0)).toBe("");
    expect(qualiteTriade(degres, 1)).toBe("m");
    expect(qualiteTriade(degres, 2)).toBe("m");
    expect(qualiteTriade(degres, 3)).toBe("");
    expect(qualiteTriade(degres, 4)).toBe("");
    expect(qualiteTriade(degres, 5)).toBe("m");
    expect(qualiteTriade(degres, 6)).toBe("dim");
  });
});

describe("qualiteSeptieme", () => {
  it("donne les symboles de 7e corrects pour la gamme majeure", () => {
    const degres = [0, 2, 4, 5, 7, 9, 11];
    expect(qualiteSeptieme(degres, 0)).toBe("maj7");
    expect(qualiteSeptieme(degres, 1)).toBe("m7");
    expect(qualiteSeptieme(degres, 2)).toBe("m7");
    expect(qualiteSeptieme(degres, 3)).toBe("maj7");
    expect(qualiteSeptieme(degres, 4)).toBe("7");
    expect(qualiteSeptieme(degres, 5)).toBe("m7");
    expect(qualiteSeptieme(degres, 6)).toBe("ø7");
  });
});

describe("qualiteSixte", () => {
  it("donne les symboles abrégés de 6e pour la gamme majeure", () => {
    const degres = [0, 2, 4, 5, 7, 9, 11];
    expect(qualiteSixte(degres, 0)).toBe("6");
    expect(qualiteSixte(degres, 1)).toBe("m6");
    expect(qualiteSixte(degres, 2)).toBe("m6");
    expect(qualiteSixte(degres, 3)).toBe("6");
    expect(qualiteSixte(degres, 4)).toBe("6");
    expect(qualiteSixte(degres, 5)).toBe("m6");
    expect(qualiteSixte(degres, 6)).toBe("dim6");
  });
});

describe("nomAccordPourLigne", () => {
  it("nomme les accords en do majeur", () => {
    expect(nomAccordPourLigne(0, "C", "majeur")).toBe("C");
    expect(nomAccordPourLigne(1, "C", "majeur")).toBe("Cmaj7");
    expect(nomAccordPourLigne(2, "C", "majeur")).toBe("C6");
    expect(nomAccordPourLigne(3, "C", "majeur")).toBe("Dm");
    expect(nomAccordPourLigne(4, "C", "majeur")).toBe("Dm7");
    expect(nomAccordPourLigne(12, "C", "majeur")).toBe("G");
    expect(nomAccordPourLigne(13, "C", "majeur")).toBe("G7");
  });
});

describe("genererNotesSequenceurAccords", () => {
  it("produit 5 notes par accord triade", () => {
    const grille = decoderMotifAccords(MOTIF_I_V_vi_IV, 16);
    const notes = genererNotesSequenceurAccords(grille, "C", "majeur", "harmonie", 120, 16, 0, 1, 3);
    // 4 accords actifs × 5 notes = 20 notes
    expect(notes).toHaveLength(20);
  });

  it("produit 6 notes par accord 7e", () => {
    const grille = decoderMotifAccords(MOTIF_I_V7_vi_IV, 16);
    const notes = genererNotesSequenceurAccords(grille, "C", "majeur", "harmonie", 120, 16, 0, 1, 3);
    // 4 accords, dont un V7 avec 6 notes : 3×5 + 6 = 21 notes
    expect(notes).toHaveLength(21);
  });

  it("respecte la durée de la dernière note active", () => {
    const grille = decoderMotifAccords(MOTIF_I_V_vi_IV, 16);
    const notes = genererNotesSequenceurAccords(grille, "C", "majeur", "harmonie", 120, 16, 0, 1, 3);
    const stepDur = ((60 / 120) * 4) / 16;
    const maxFin = Math.max(...notes.map((n) => n.fin));
    expect(maxFin).toBeCloseTo(12 * stepDur + stepDur * 0.9, 5);
  });

  it("décale les notes en mode arpège", () => {
    const grille = decoderMotifAccords(MOTIF_I_V_vi_IV, 16);
    const notes = genererNotesSequenceurAccords(grille, "C", "majeur", "arpege", 120, 16, 0, 1, 3);
    const premieres = notes.filter((n) => n.debut === 0);
    const secondes = notes.filter((n) => n.debut > 0 && n.debut < 0.04);
    expect(premieres.length).toBe(1);
    expect(secondes.length).toBeGreaterThan(0);
  });
});

describe("rendreSequenceurAccords", () => {
  it("rend un buffer audio stéréo de la durée attendue", async () => {
    const grille = decoderMotifAccords(MOTIF_I_V_vi_IV, 16);
    const { audio, notes } = await rendreSequenceurAccords(grille, "C", "majeur", "harmonie", 120, 16, 0, 2, 85, 3, "FM/Oscillateurs");
    expect(audio).toBeInstanceOf(AudioBuffer);
    expect(audio.numberOfChannels).toBe(2);
    expect(audio.duration).toBeCloseTo(2 * 4 * (60 / 120), 2); // 2 mesures
    expect(notes.length).toBe(40); // 8 accords triades × 5 notes
  });
});

describe("midiSequenceurAccords", () => {
  it("produit un fichier MIDI", () => {
    const grille = decoderMotifAccords(MOTIF_I_V_vi_IV, 16);
    const notes = genererNotesSequenceurAccords(grille, "C", "majeur", "harmonie", 120, 16, 0, 1, 3);
    const file = midiSequenceurAccords(notes, 120);
    expect(file).toBeInstanceOf(File);
    expect(file.name.endsWith(".mid")).toBe(true);
  });
});
