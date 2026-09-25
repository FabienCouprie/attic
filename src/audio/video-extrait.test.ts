// audio/video-extrait.test.ts — Une borne mal traduite coupe le plan à côté.
import { describe, it, expect } from "vitest";
import { formatDuree, plageExtrait } from "./video-extrait";

describe("portion à garder", () => {
  it("deux bornes ordinaires deviennent deux instants", () => {
    const p = plageExtrait(25, 100, 25, 60);
    expect(p.debutSec).toBe(1);
    expect(p.finSec).toBe(4);
    expect(p.images).toBe(75);
  });

  it("une fin au plus bas que le début désigne la fin du film", () => {
    // C'est le cas d'un composant qu'on vient de poser, ses deux bornes valant zéro.
    expect(plageExtrait(0, 0, 25, 10)).toEqual({ debutSec: 0, finSec: 10, images: 250 });
    expect(plageExtrait(50, 10, 25, 10)).toEqual({ debutSec: 2, finSec: 10, images: 200 });
  });

  it("une image n'est pas un trentième de seconde", () => {
    const p = plageExtrait(1000, 2000, 30000 / 1001, 600);
    expect(p.debutSec).toBeCloseTo(33.3667, 4);
    expect(p.finSec).toBeCloseTo(66.7333, 4);
  });

  it("les bornes ne sortent pas du film", () => {
    const p = plageExtrait(-40, 100_000, 25, 8);
    expect(p.debutSec).toBe(0);
    expect(p.finSec).toBe(8);
    expect(p.images).toBe(200);
  });

  it("un début au-delà de la fin du film est ramené à la dernière image", () => {
    const p = plageExtrait(9999, 0, 25, 4);
    expect(p.debutSec).toBe(4);
    expect(p.finSec).toBe(4);
    expect(p.images).toBe(0);
  });

  it("sans cadence connue, on ne divise pas par zéro", () => {
    const p = plageExtrait(25, 50, 0, 10);
    expect(Number.isFinite(p.debutSec)).toBe(true);
    expect(Number.isFinite(p.finSec)).toBe(true);
  });
});

describe("durée affichée", () => {
  it("se lit en minutes, secondes et centièmes", () => {
    expect(formatDuree(0)).toBe("0:00.00");
    expect(formatDuree(75.25)).toBe("1:15.25");
    expect(formatDuree(-3)).toBe("0:00.00");
  });
});
