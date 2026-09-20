// audio/stereo-correlation.test.ts — Le goniomètre, sur des signaux dont on sait tout.
//
// Attic transforme beaucoup l'image stéréo sans offrir de quoi la contrôler. Ces tests
// construisent les quatre cas d'école — mono, opposition de phase, canaux indépendants,
// un canal muet — et vérifient que la mesure dit ce qu'un ingénieur du son en dirait.
import { describe, expect, it } from "vitest";
import { mesurerStereo, pointsGoniometre, verdictStereo } from "./stereo-correlation";

const N = 4096;
const sinus = (freq: number, phase = 0, amp = 0.5) =>
  Float32Array.from({ length: N }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / 44100 + phase));
const bruit = (graine: number) => {
  let x = graine;
  return Float32Array.from({ length: N }, () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x / 2147483648) * 2 - 1;
  });
};

describe("corrélation", () => {
  it("vaut +1 pour du mono : les deux canaux sont le même signal", () => {
    const s = sinus(440);
    expect(mesurerStereo(s, s).correlation).toBeCloseTo(1, 5);
  });

  it("vaut −1 pour une opposition de phase, celle qui s'annule en mono", () => {
    const s = sinus(440);
    const inverse = Float32Array.from(s, (v) => -v);
    expect(mesurerStereo(s, inverse).correlation).toBeCloseTo(-1, 5);
  });

  it("vaut environ 0 pour deux canaux indépendants", () => {
    const m = mesurerStereo(bruit(1), bruit(99));
    expect(Math.abs(m.correlation)).toBeLessThan(0.1);
  });

  it("vaut 0 pour deux sinus en quadrature — décorrélés sans être opposés", () => {
    const m = mesurerStereo(sinus(440), sinus(440, Math.PI / 2));
    expect(Math.abs(m.correlation)).toBeLessThan(0.05);
  });

  it("vaut 1 quand un canal est muet, plutôt que 0 : un mix à demi silencieux n'est pas « large »", () => {
    const m = mesurerStereo(sinus(440), new Float32Array(N));
    expect(m.correlation).toBe(1);
  });

  it("ne dépasse jamais les bornes, même sur des signaux forts", () => {
    const fort = Float32Array.from(sinus(220, 0, 4));
    const m = mesurerStereo(fort, fort);
    expect(m.correlation).toBeLessThanOrEqual(1);
    expect(m.correlation).toBeGreaterThanOrEqual(-1);
  });
});

describe("compatibilité mono", () => {
  it("n'annonce aucune perte sur un signal mono", () => {
    const s = sinus(440);
    expect(mesurerStereo(s, s).perteMono).toBeCloseTo(0, 5);
  });

  it("annonce une perte énorme sur une opposition de phase : le son disparaît", () => {
    const s = sinus(440);
    const m = mesurerStereo(s, Float32Array.from(s, (v) => -v));
    expect(m.perteMono).toBeGreaterThan(60);
    expect(m.rmsMono).toBeLessThan(-100);
  });

  it("annonce les 3 dB attendus sur deux canaux indépendants", () => {
    // Deux bruits décorrélés d'égale puissance : la somme divisée par deux perd 3 dB.
    const m = mesurerStereo(bruit(7), bruit(1234));
    expect(m.perteMono).toBeGreaterThan(2);
    expect(m.perteMono).toBeLessThan(4);
  });

  it("mesure le niveau de chaque canal séparément", () => {
    const m = mesurerStereo(sinus(440, 0, 0.5), sinus(440, 0, 0.25));
    expect(m.rmsGauche - m.rmsDroite).toBeCloseTo(6, 0); // moitié = 6 dB
  });
});

describe("verdict", () => {
  it("nomme les quatre situations", () => {
    expect(verdictStereo(1)).toBe("mono");
    expect(verdictStereo(0.97)).toBe("mono");
    expect(verdictStereo(0.7)).toBe("etroit");
    expect(verdictStereo(0.1)).toBe("large");
    expect(verdictStereo(-0.8)).toBe("opposition");
  });
});

describe("figure de Lissajous", () => {
  it("dessine un trait VERTICAL pour du mono — la somme, rien en différence", () => {
    const s = sinus(440);
    const pts = pointsGoniometre(s, s, 200);
    expect(pts.length).toBeGreaterThan(50);
    expect(Math.max(...pts.map((p) => Math.abs(p.x)))).toBeLessThan(1e-6);
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeGreaterThan(0.5);
  });

  it("dessine un trait HORIZONTAL pour une opposition de phase", () => {
    const s = sinus(440);
    const pts = pointsGoniometre(s, Float32Array.from(s, (v) => -v), 200);
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeLessThan(1e-6);
    expect(Math.max(...pts.map((p) => Math.abs(p.x)))).toBeGreaterThan(0.5);
  });

  it("étale un nuage dans les deux axes pour deux canaux indépendants", () => {
    const pts = pointsGoniometre(bruit(3), bruit(4242), 500);
    expect(Math.max(...pts.map((p) => Math.abs(p.x)))).toBeGreaterThan(0.3);
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeGreaterThan(0.3);
  });

  it("sous-échantillonne sans jamais sortir du cadre", () => {
    const pts = pointsGoniometre(bruit(1), bruit(2), 100);
    expect(pts.length).toBeLessThanOrEqual(110);
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
    }
  });

  it("ne produit rien sur un signal vide", () => {
    expect(pointsGoniometre(new Float32Array(0), new Float32Array(0))).toEqual([]);
  });
});
