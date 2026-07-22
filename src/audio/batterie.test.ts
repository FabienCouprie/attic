// audio/batterie.test.ts
// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { genererGrilleCantor, genererRythmeCantor } from "./batterie";

describe("genererGrilleCantor", () => {
  it("produit au moins un pas actif", () => {
    const grille = genererGrilleCantor(64, 3, 3, "centre");
    expect(grille.some((n) => n >= 0)).toBe(true);
  });

  it("les niveaux maximum augmentent avec la profondeur", () => {
    const g1 = genererGrilleCantor(64, 1, 3, "centre");
    const g3 = genererGrilleCantor(64, 3, 3, "centre");
    const max1 = Math.max(...g1);
    const max3 = Math.max(...g3);
    expect(max1).toBeGreaterThanOrEqual(0);
    expect(max3).toBeGreaterThan(max1);
  });

  it("change les pas actifs selon la partie retirée", () => {
    const gCentre = genererGrilleCantor(64, 2, 3, "centre");
    const gGauche = genererGrilleCantor(64, 2, 3, "gauche");
    const diff = gCentre.some((n, i) => (n >= 0) !== (gGauche[i] >= 0));
    expect(diff).toBe(true);
  });

  it("supporte une subdivision 5", () => {
    const grille = genererGrilleCantor(64, 2, 5, "centre");
    expect(grille.some((n) => n >= 0)).toBe(true);
  });
});

describe("genererRythmeCantor", () => {
  it("rend un buffer audio non silencieux", async () => {
    const buffer = await genererRythmeCantor(120, 3, 3, "centre", 1, "Tous", 80, 0);
    expect(buffer).toBeInstanceOf(AudioBuffer);
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.duration).toBeGreaterThan(0);
    const energy = buffer.getChannelData(0).reduce((a, b) => a + Math.abs(b), 0);
    expect(energy).toBeGreaterThan(0);
  });

  it("respecte la durée attendue pour plusieurs mesures", async () => {
    const buffer = await genererRythmeCantor(120, 2, 3, "centre", 2, "Kick", 80, 0);
    expect(buffer.duration).toBeCloseTo(2 * 4 * (60 / 120), 0); // 2 mesures × 4 temps
  });
});
