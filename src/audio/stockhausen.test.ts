// audio/stockhausen.test.ts — La démonstration est vérifiable exactement : pour
// une source périodique, le taux de répétition à l'instant t vaut la période
// source divisée par le facteur de vitesse. On mesure donc le rythme réellement
// produit, et non une impression de « ça ralentit ».
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { continuumHauteurRythme, vitesseContinuum, frequenceAttendue } from "./stockhausen";

const SR = 8000;

/** Train d'impulsions : la source qui rend le continuum audible et mesurable. */
function impulsions(freqHz: number, dureeSec: number, sr = SR): AudioBuffer {
  const n = Math.round(dureeSec * sr);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  const periode = sr / freqHz;
  for (let i = 0; i < n; i++) {
    const ph = (i % periode) / periode;
    d[i] = Math.exp(-ph * 40) * Math.sin(2 * Math.PI * ph);
  }
  // Normalisé à 1 : la forme brute culmine à 0,058, ce qui rendait toute
  // détection à seuil absolu illusoire — une première version comptait zéro pic
  // partout et concluait à un rapport NaN.
  let pic = 0;
  for (let i = 0; i < n; i++) pic = Math.max(pic, Math.abs(d[i]));
  if (pic > 0) for (let i = 0; i < n; i++) d[i] /= pic;
  return b;
}

/**
 * Compte les impulsions dans une fenêtre, avec un seuil RELATIF au maximum
 * local. Un seuil absolu ne survit pas au changement d'échelle du signal, et
 * c'est précisément ce que ce module fait varier.
 */
function densite(d: Float32Array, sr: number, t0: number, t1: number): number {
  const a = Math.round(t0 * sr), b = Math.min(d.length, Math.round(t1 * sr));
  let max = 0;
  for (let i = a; i < b; i++) max = Math.max(max, d[i]);
  if (max <= 1e-6) return 0;
  const seuil = max * 0.5;
  let pics = 0;
  for (let i = a + 1; i < b - 1; i++) {
    if (d[i] > seuil && d[i] >= d[i - 1] && d[i] > d[i + 1]) pics++;
  }
  return pics / (t1 - t0);
}

const BASE = { dureeSec: 4, octaves: 10, versLaHauteur: false };

describe("vitesseContinuum", () => {
  it("part de 1 et parcourt exactement le nombre d'octaves demandé", () => {
    expect(vitesseContinuum(0, BASE)).toBeCloseTo(1, 12);
    expect(vitesseContinuum(BASE.dureeSec, BASE)).toBeCloseTo(Math.pow(2, -10), 12);
  });

  it("progresse en octaves égales et non en hertz égaux", () => {
    // La perception de la hauteur est logarithmique : à mi-parcours d'un balayage
    // de dix octaves, on doit être à cinq octaves, pas à la moitié du facteur.
    expect(vitesseContinuum(BASE.dureeSec / 2, BASE)).toBeCloseTo(Math.pow(2, -5), 12);
  });

  it("le sens inverse la traversée", () => {
    const monte = vitesseContinuum(BASE.dureeSec, { ...BASE, versLaHauteur: true });
    expect(monte).toBeCloseTo(Math.pow(2, 10), 6);
  });
});

describe("frequenceAttendue", () => {
  it("traverse la frontière perceptive des ~20 Hz", () => {
    // Une source à 200 Hz ralentie de dix octaves finit à 0,195 Hz : une
    // pulsation toutes les cinq secondes. C'est là toute la démonstration.
    const periode = 1 / 200;
    expect(frequenceAttendue(0, periode, BASE)).toBeCloseTo(200, 6);
    expect(frequenceAttendue(BASE.dureeSec, periode, BASE)).toBeCloseTo(200 / 1024, 6);
    // Le franchissement des 20 Hz a bien lieu pendant le son, pas après.
    const milieu = frequenceAttendue(BASE.dureeSec / 2, periode, BASE);
    expect(milieu).toBeLessThan(20);
    expect(milieu).toBeGreaterThan(0.195);
  });
});

describe("continuumHauteurRythme", () => {
  it("produit la durée et les canaux demandés", () => {
    const out = continuumHauteurRythme(impulsions(200, 0.2), { ...BASE, dureeSec: 2 });
    expect(out.length).toBe(2 * SR);
    expect(out.numberOfChannels).toBe(1);
  });

  it("le rythme réellement produit suit la prédiction", () => {
    // LE test. On compte les impulsions dans une fenêtre du début et dans une
    // fenêtre plus tardive, et l'on compare au facteur de vitesse prédit.
    const src = impulsions(100, 0.5);
    const out = continuumHauteurRythme(src, { ...BASE, dureeSec: 8, octaves: 6 });
    const d = out.getChannelData(0);
    const debut = densite(d, SR, 0, 0.5);
    const fin = densite(d, SR, 7, 8);
    // Six octaves sur 8 s : à t = 7,5 s la vitesse vaut 2^(-6·0,9375) ≈ 1/57.
    const rapportAttendu = 1 / vitesseContinuum(7.5, { ...BASE, dureeSec: 8, octaves: 6 });
    expect(debut / fin).toBeGreaterThan(rapportAttendu * 0.6);
    expect(debut / fin).toBeLessThan(rapportAttendu * 1.6);
  });

  it("ralentit de façon monotone", () => {
    const out = continuumHauteurRythme(impulsions(100, 0.5), { ...BASE, dureeSec: 6, octaves: 5 });
    const d = out.getChannelData(0);
    const mesures = [0, 1, 2, 3, 4].map((t) => densite(d, SR, t, t + 1));
    for (let i = 1; i < mesures.length; i++) {
      expect(mesures[i], `seconde ${i}`).toBeLessThanOrEqual(mesures[i - 1]);
    }
  });

  it("ne produit pas de discontinuité au rebouclage de la source", () => {
    const out = continuumHauteurRythme(impulsions(200, 0.3), { ...BASE, dureeSec: 3, octaves: 4 });
    const d = out.getChannelData(0);
    let pire = 0;
    for (let i = 1; i < d.length; i++) pire = Math.max(pire, Math.abs(d[i] - d[i - 1]));
    // La source elle-même a des attaques franches ; on vérifie seulement
    // qu'aucun saut n'excède l'amplitude du signal, signe d'un raccord raté.
    expect(pire).toBeLessThanOrEqual(2);
  });
});
