// @vitest-environment jsdom
// audio/attracteurs.test.ts
import { describe, it, expect } from "vitest";
import {
  calculerHistogramme,
  canvasDisponible,
  creerRng,
  interpolerCouleur,
  normaliserTypeAttracteur,
  PALETTES,
  rendreAttracteurImage,
  type TypeAttracteur,
} from "./attracteurs";

const TYPES: TypeAttracteur[] = ["lorenz", "rossler", "henon", "ikeda", "barnsley", "sierpinski"];

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
    const { histogramme, max, bbox } = calculerHistogramme(type, 50000, 128, 128, "xy", 42);
    expect(max).toBeGreaterThan(0);
    const total = histogramme.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(bbox.maxX).toBeGreaterThan(bbox.minX);
    expect(bbox.maxY).toBeGreaterThan(bbox.minY);
  });

  it("différentes graines produisent des histogrammes différents (IFS aléatoires)", () => {
    const h1 = calculerHistogramme("barnsley", 20000, 64, 64, "xy", 1).histogramme;
    const h2 = calculerHistogramme("barnsley", 20000, 64, 64, "xy", 999).histogramme;
    const s1 = h1.reduce((a, b) => a + b, 0);
    const s2 = h2.reduce((a, b) => a + b, 0);
    expect(s1).toBeGreaterThan(0);
    expect(s2).toBeGreaterThan(0);
    // Les distributions exactes diffèrent presque toujours.
    let diff = 0;
    for (let i = 0; i < h1.length; i++) diff += Math.abs(h1[i] - h2[i]);
    expect(diff).toBeGreaterThan(0);
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
});
