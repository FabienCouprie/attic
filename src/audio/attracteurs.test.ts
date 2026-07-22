// @vitest-environment jsdom
// audio/attracteurs.test.ts
// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import {
  calculerHistogramme,
  calculerBoundingBox,
  canvasDisponible,
  collecterPoints,
  creerRng,
  interpolerCouleur,
  normaliserTypeAttracteur,
  PALETTES,
  rendreAttracteurImage,
  rendreAttracteurImageEtAudio,
  sonifierPoints,
  type TypeAttracteur,
} from "./attracteurs";

const TYPES: TypeAttracteur[] = ["lorenz", "rossler", "henon", "ikeda", "barnsley", "sierpinski"];

function pointsEtBbox(type: TypeAttracteur, iterations: number, projection: any, graine: number) {
  const rng = creerRng(graine);
  const points = collecterPoints(type, iterations, rng);
  const bbox = calculerBoundingBox(points, projection);
  return { points, bbox };
}

describe("attracteurs", () => {
  it("générateur aléatoire est déterministe", () => {
    const rng1 = creerRng(123);
    const rng2 = creerRng(123);
    for (let i = 0; i < 10; i++) expect(rng1()).toBe(rng2());
  });

  it("normalise les noms d'attracteurs avec accents et espaces", () => {
    expect(normaliserTypeAttracteur("Lorenz")).toBe("lorenz");
    expect(normaliserTypeAttracteur("Rössler")).toBe("rossler");
    expect(normaliserTypeAttracteur("Hénon")).toBe("henon");
    expect(normaliserTypeAttracteur("Sierpiński")).toBe("sierpinski");
    expect(normaliserTypeAttracteur("inconnu")).toBeNull();
  });

  it("interpolation de palette retourne une couleur rgb", () => {
    const c = interpolerCouleur(PALETTES.viridis, 0.5);
    expect(c).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it.each(TYPES)("%s produit un histogramme non vide", (type) => {
    const { points, bbox } = pointsEtBbox(type, 50000, "xy", 42);
    const { histogramme, max } = calculerHistogramme(points, 128, 128, "xy", bbox);
    expect(max).toBeGreaterThan(0);
    const total = histogramme.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(bbox.maxX).toBeGreaterThan(bbox.minX);
    expect(bbox.maxY).toBeGreaterThan(bbox.minY);
  });

  it("différentes graines produisent des histogrammes différents (IFS aléatoires)", () => {
    const { points: p1, bbox: b1 } = pointsEtBbox("barnsley", 20000, "xy", 1);
    const { points: p2, bbox: b2 } = pointsEtBbox("barnsley", 20000, "xy", 999);
    const h1 = calculerHistogramme(p1, 64, 64, "xy", b1).histogramme;
    const h2 = calculerHistogramme(p2, 64, 64, "xy", b2).histogramme;
    const s1 = h1.reduce((a, b) => a + b, 0);
    const s2 = h2.reduce((a, b) => a + b, 0);
    expect(s1).toBeGreaterThan(0);
    expect(s2).toBeGreaterThan(0);
    let diff = 0;
    for (let i = 0; i < h1.length; i++) diff += Math.abs(h1[i] - h2[i]);
    expect(diff).toBeGreaterThan(0);
  });

  it("sonifierPoints produit un buffer audio stéréo de la durée demandée", () => {
    const { points, bbox } = pointsEtBbox("lorenz", 10000, "xy", 42);
    const buffer = sonifierPoints(points, bbox, { duree: 0.5, frequenceBase: 220, plageDemiTons: 24, decimation: 1, volume: 80 });
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeCloseTo(0.5, 1);
    // Le signal n'est pas entièrement silencieux.
    const energy = buffer.getChannelData(0).reduce((a, b) => a + Math.abs(b), 0);
    expect(energy).toBeGreaterThan(0);
  });

  it("rendreAttracteurImage retourne un File PNG", async () => {
    if (!canvasDisponible()) return; // canvas npm package absent dans l'environnement de test
    const fichier = await rendreAttracteurImage({
      type: "lorenz",
      iterations: 10000,
      width: 64,
      height: 64,
      palette: "classic",
      exposure: 1,
      gamma: 1,
      projection: "xy",
      graine: 42,
    }, "png");
    expect(fichier).toBeInstanceOf(File);
    expect(fichier.type).toBe("image/png");
    expect(fichier.name).toMatch(/attracteur-lorenz-classic\.png$/);
    expect(fichier.size).toBeGreaterThan(0);
  });

  it("rendreAttracteurImage retourne un File JPEG", async () => {
    if (!canvasDisponible()) return; // canvas npm package absent dans l'environnement de test
    const fichier = await rendreAttracteurImage({
      type: "sierpinski",
      iterations: 10000,
      width: 64,
      height: 64,
      palette: "gray",
      exposure: 1,
      gamma: 1,
      projection: "xy",
      graine: 42,
    }, "jpeg");
    expect(fichier.type).toBe("image/jpeg");
    expect(fichier.name).toMatch(/attracteur-sierpinski-gray\.jpg$/);
  });

  it("rendreAttracteurImageEtAudio retourne image + audio", async () => {
    if (!canvasDisponible()) return; // canvas npm package absent dans l'environnement de test
    const { image, audio } = await rendreAttracteurImageEtAudio(
      {
        type: "lorenz",
        iterations: 10000,
        width: 64,
        height: 64,
        palette: "classic",
        exposure: 1,
        gamma: 1,
        projection: "xy",
        graine: 42,
      },
      { duree: 1, frequenceBase: 220, plageDemiTons: 24, decimation: 1, volume: 80 },
      "png"
    );
    expect(image).toBeInstanceOf(File);
    expect(audio).toBeInstanceOf(AudioBuffer);
    expect(audio.duration).toBeCloseTo(1, 0);
  });
});
