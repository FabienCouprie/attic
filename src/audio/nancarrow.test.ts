// audio/nancarrow.test.ts — Ce qui distingue le canon de tempo du déphasage est
// arithmétique : rapport rationnel, le canon se referme ; rapport irrationnel,
// jamais. C'est donc cela qu'on teste, pas une impression.
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { canonDeTempo, periodeCanon, approximationRationnelle } from "./nancarrow";

const SR = 8000;

function motif(dureeSec = 0.5, sr = SR): AudioBuffer {
  const n = Math.round(dureeSec * sr);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const ph = i / n;
    d[i] = 0.5 * (1 - Math.cos(2 * Math.PI * ph)) * Math.sin((2 * Math.PI * 440 * i) / sr);
  }
  return b;
}

describe("approximationRationnelle", () => {
  it("retrouve exactement un rapport simple", () => {
    for (const [x, p, q] of [[1.5, 3, 2], [0.75, 3, 4], [5 / 7, 5, 7]] as const) {
      const r = approximationRationnelle(x);
      expect(r.p).toBe(p);
      expect(r.q).toBe(q);
      expect(r.erreur).toBeLessThan(1e-12);
    }
  });

  it("n'approche √2 qu'au prix d'un très grand dénominateur", () => {
    // C'est toute la différence entendue : 3/2 se referme en deux boucles, √2
    // demanderait des milliers de tours.
    const r = approximationRationnelle(Math.SQRT2);
    expect(r.q).toBeGreaterThan(1000);
    expect(r.erreur).toBeGreaterThan(0);
  });
});

describe("periodeCanon", () => {
  it("un rapport rationnel referme le canon au bout du dénominateur", () => {
    // 3:2 sur une boucle de 2 s : coïncidence toutes les deux boucles, soit 4 s.
    expect(periodeCanon(1.5, 2)).toBeCloseTo(4, 9);
    expect(periodeCanon(0.75, 2)).toBeCloseTo(8, 9);
    expect(periodeCanon(5 / 7, 1)).toBeCloseTo(7, 9);
  });

  it("un rapport irrationnel ne referme jamais le canon", () => {
    expect(periodeCanon(Math.SQRT2, 2)).toBe(Infinity);
    expect(periodeCanon(Math.PI / Math.E, 2)).toBe(Infinity);
  });

  it("l'unisson est un cas dégénéré, pas un canon", () => {
    expect(periodeCanon(1, 2)).toBeCloseTo(2, 9);
  });
});

describe("canonDeTempo", () => {
  const CAS = { dureeSec: 2, rapports: [1, 1.5], stereo: 1 };

  it("produit la durée demandée, en stéréo", () => {
    const out = canonDeTempo(motif(), CAS);
    expect(out.length).toBe(2 * SR);
    expect(out.numberOfChannels).toBe(2);
  });

  it("chaque voix lit la source à son rapport exact", () => {
    // Relation exacte, vérifiée point par point : avec un étalement maximal,
    // chaque voix occupe un canal, et la voix droite à l'instant i rend
    // l'échantillon que la gauche rendra à 1,5·i.
    const out = canonDeTempo(motif(), { ...CAS, rapports: [1, 1.5], dureeSec: 1 });
    const g = out.getChannelData(0), d = out.getChannelData(1);
    for (const i of [400, 1200, 2000]) {
      expect(Math.abs(d[i] - g[Math.round(i * 1.5)]), `échantillon ${i}`).toBeLessThan(0.02);
    }
  });

  it("un rapport de 1 rend deux canaux identiques : sans rapport, pas de canon", () => {
    const out = canonDeTempo(motif(), { ...CAS, rapports: [1, 1] });
    const g = out.getChannelData(0), d = out.getChannelData(1);
    let pire = 0;
    for (let i = 0; i < g.length; i++) pire = Math.max(pire, Math.abs(g[i] - d[i]));
    expect(pire).toBe(0);
  });

  it("accepte plus de deux voix", () => {
    const out = canonDeTempo(motif(), { ...CAS, rapports: [1, 1.25, 1.5, 1.75] });
    let energie = 0;
    const g = out.getChannelData(0);
    for (let i = 0; i < g.length; i++) energie += g[i] * g[i];
    expect(Math.sqrt(energie / g.length)).toBeGreaterThan(0.001);
  });

  it("rationnel et irrationnel ne produisent pas le même son", () => {
    const rationnel = canonDeTempo(motif(), { ...CAS, rapports: [1, 1.5] }).getChannelData(1);
    const irrationnel = canonDeTempo(motif(), { ...CAS, rapports: [1, Math.SQRT2] }).getChannelData(1);
    let ecart = 0;
    for (let i = 0; i < rationnel.length; i++) ecart += Math.abs(rationnel[i] - irrationnel[i]);
    expect(ecart / rationnel.length).toBeGreaterThan(1e-3);
  });
});
