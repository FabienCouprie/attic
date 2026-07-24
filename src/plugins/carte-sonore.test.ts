// plugins/carte-sonore.test.ts
import { describe, it, expect } from "vitest";
import { genererCarteVille } from "./carte-sonore";

describe("carte-sonore", () => {
  it("génère une carte avec les points fournis", () => {
    const points = Array.from({ length: 8 }, (_, i) => ({ nom: `son${i}.mp3`, chemin: `/tmp/son${i}.mp3` }));
    const carte = genererCarteVille(42, 640, 420, points);
    expect(carte.width).toBe(640);
    expect(carte.height).toBe(420);
    expect(carte.points.length).toBe(8);
    expect(carte.routes.length).toBeGreaterThan(0);
    expect(carte.batiments.length).toBeGreaterThan(0);
    expect(carte.riviere.length).toBeGreaterThan(0);
  });

  it("même graine = même carte", () => {
    const points = [{ nom: "a.wav", chemin: "/a.wav" }];
    const c1 = genererCarteVille(123, 640, 420, points);
    const c2 = genererCarteVille(123, 640, 420, points);
    expect(c1.points[0].x).toBe(c2.points[0].x);
    expect(c1.points[0].y).toBe(c2.points[0].y);
    expect(c1.routes.length).toBe(c2.routes.length);
  });

  it("graine différente = carte différente", () => {
    const points = [{ nom: "a.wav", chemin: "/a.wav" }];
    const c1 = genererCarteVille(111, 640, 420, points);
    const c2 = genererCarteVille(222, 640, 420, points);
    expect(c1.points[0].x !== c2.points[0].x || c1.points[0].y !== c2.points[0].y).toBe(true);
  });

  it("les points restent dans les limites", () => {
    const points = Array.from({ length: 20 }, (_, i) => ({ nom: `${i}.mp3`, chemin: `/${i}.mp3` }));
    const carte = genererCarteVille(7, 640, 420, points);
    for (const p of carte.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(carte.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(carte.height);
    }
  });
});
