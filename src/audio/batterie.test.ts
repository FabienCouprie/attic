// audio/batterie.test.ts
// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { genererGrilleCantor, genererRythmeCantor, decoderMotifVelocite, encoderMotifVelocite, rendreSequenceurBatterieAvance } from "./batterie";

describe("genererGrilleCantor", () => {
  it("produit au moins un pas actif", () => {
    const grille = genererGrilleCantor(64, 3, 3, "center");
    expect(grille.some((n) => n >= 0)).toBe(true);
  });

  it("les niveaux maximum augmentent avec la profondeur", () => {
    const g1 = genererGrilleCantor(64, 1, 3, "center");
    const g3 = genererGrilleCantor(64, 3, 3, "center");
    const max1 = Math.max(...g1);
    const max3 = Math.max(...g3);
    expect(max1).toBeGreaterThanOrEqual(0);
    expect(max3).toBeGreaterThan(max1);
  });

  it("change les pas actifs selon la partie retirée", () => {
    const gCentre = genererGrilleCantor(64, 2, 3, "center");
    const gGauche = genererGrilleCantor(64, 2, 3, "left");
    const diff = gCentre.some((n, i) => (n >= 0) !== (gGauche[i] >= 0));
    expect(diff).toBe(true);
  });

  it("supporte une subdivision 5", () => {
    const grille = genererGrilleCantor(64, 2, 5, "center");
    expect(grille.some((n) => n >= 0)).toBe(true);
  });
});

describe("genererRythmeCantor", () => {
  it("rend un buffer audio non silencieux", async () => {
    const buffer = await genererRythmeCantor(120, 3, 3, "center", 1, "all", 80, 0);
    expect(buffer).toBeInstanceOf(AudioBuffer);
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.duration).toBeGreaterThan(0);
    const energy = buffer.getChannelData(0).reduce((a, b) => a + Math.abs(b), 0);
    expect(energy).toBeGreaterThan(0);
  });

  it("respecte la durée attendue pour plusieurs mesures", async () => {
    const buffer = await genererRythmeCantor(120, 2, 3, "center", 2, "kick", 80, 0);
    expect(buffer.duration).toBeCloseTo(2 * 4 * (60 / 120), 0); // 2 mesures × 4 temps
  });
});

describe("decoderMotifVelocite", () => {
  it("découpe un motif en velocities 0-9", () => {
    const motif = "0009000000000000|0000000900000000";
    const grille = decoderMotifVelocite(motif, 2, 16);
    expect(grille).toHaveLength(2);
    expect(grille[0][3]).toBe(9);
    expect(grille[1][7]).toBe(9);
    expect(grille[0].filter((v) => v > 0).length).toBe(1);
  });

  it("ignore les caractères non numériques", () => {
    const motif = "abc|1a";
    const grille = decoderMotifVelocite(motif, 2, 4);
    expect(grille[0]).toEqual([0, 0, 0, 0]);
    expect(grille[1]).toEqual([1, 0, 0, 0]);
  });
});

describe("encoderMotifVelocite", () => {
  it("encode une grille de velocities", () => {
    const grille = [
      [0, 0, 0, 9],
      [0, 5, 0, 0],
    ];
    expect(encoderMotifVelocite(grille)).toBe("0009|0500");
  });
});

describe("rendreSequenceurBatterieAvance", () => {
  it("rend un buffer audio non silencieux", async () => {
    const motif = "9000000000000000|0009000000000000|0000000000000000|0000000000000000|0000000000000000|0000000000000000|0000000000000000|0000000000000000";
    const grille = decoderMotifVelocite(motif, 8, 16);
    const buffer = await rendreSequenceurBatterieAvance(grille, 120, 16, 0, 1, 80);
    expect(buffer).toBeInstanceOf(AudioBuffer);
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.duration).toBeGreaterThan(0);
    const energy = buffer.getChannelData(0).reduce((a, b) => a + Math.abs(b), 0);
    expect(energy).toBeGreaterThan(0);
  });
});
