// audio/concret.test.ts — La vitesse variable, la convolution de deux sons, les résonateurs.
//
// Chaque test mesure ce qu'un compositeur entendrait : une hauteur, une durée, une décroissance, un
// retard. Aucun ne se contente de vérifier qu'un son sort.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import {
  convoluerDeuxSons, positionsDeLecture, rapportsDeVitesse, rapportsResonateurs, resonateurs, vitesseVariable,
} from "./concret";
import { constante, engendrer } from "./courbe";

const SR = 44100;

function son(n: number, f: (i: number) => number, canaux = 1): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  for (let c = 0; c < canaux; c++) b.copyToChannel(Float32Array.from({ length: n }, (_, i) => f(i)), c);
  return b;
}
const sinus = (hz: number, n = SR, a = 0.5) => son(n, (i) => a * Math.sin(2 * Math.PI * hz * i / SR));
const bruit = (n: number, graine = 3) => { let e = graine; return son(n, () => { e = (e * 1664525 + 1013904223) >>> 0; return 0.4 * (e / 4294967296 * 2 - 1); }); };

/** Fréquence moyenne par les passages montants par zéro, interpolés. */
function frequence(x: Float32Array, de = 0, a = x.length): number {
  const p: number[] = [];
  for (let i = Math.max(1, de); i < a; i++) if (x[i - 1] < 0 && x[i] >= 0) p.push(i - 1 + x[i - 1] / (x[i - 1] - x[i]));
  return p.length > 1 ? (SR * (p.length - 1)) / (p[p.length - 1] - p[0]) : 0;
}

/** Amplitude d'une fréquence, par Goertzel. */
function amplitude(x: Float32Array, hz: number, de = 0, a = x.length): number {
  const w = (2 * Math.PI * hz) / SR, k = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = de; i < a; i++) { const s0 = x[i] + k * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2) / ((a - de) / 2);
}

describe("vitesse variable", () => {
  it("À ZÉRO DEMI-TON, LA SOURCE EST RENDUE EXACTEMENT, échantillon pour échantillon", () => {
    const x = bruit(SR);
    const y = vitesseVariable(x, rapportsDeVitesse(SR, 0));
    expect(y.length).toBe(SR);
    const a = x.getChannelData(0), b = y.getChannelData(0);
    expect(b.every((v, i) => v === a[i])).toBe(true);
  });

  it("UNE OCTAVE AU-DESSUS : DEUX FOIS PLUS AIGU ET DEUX FOIS PLUS COURT — c'est une bande", () => {
    const y = vitesseVariable(sinus(440, 2 * SR), rapportsDeVitesse(2 * SR, 12));
    expect(Math.abs(y.length - SR)).toBeLessThanOrEqual(2);
    expect(Math.abs(frequence(y.getChannelData(0), 1000, SR - 1000) / 880 - 1)).toBeLessThan(1e-3);
    const bas = vitesseVariable(sinus(440, SR), rapportsDeVitesse(SR, -7));
    expect(Math.abs(frequence(bas.getChannelData(0), 2000, bas.length - 2000) / (440 * 2 ** (-7 / 12)) - 1)).toBeLessThan(1e-3);
  });

  it("ACCÉLÉRER NE REPLIE PAS LES AIGUS : un 8 kHz poussé à 32 kHz disparaît, il ne revient pas à 12 kHz", () => {
    const y = vitesseVariable(sinus(8000, SR), rapportsDeVitesse(SR, 24)).getChannelData(0);
    // Une interpolation naïve rendrait un 12,1 kHz d'amplitude voisine de l'original (0,5).
    expect(amplitude(y, SR - 32000, 200, y.length - 200)).toBeLessThan(0.005);
  });

  it("LA COURBE SUIT LA SOURCE : de 0 à +12 demi-tons, la sortie dure N · (1 − ½) / ln 2 ≈ 0,721 N", () => {
    const n = 2 * SR;
    const r = rapportsDeVitesse(n, 0, engendrer({ dureeSec: 2, forme: "rampe" }), { min: 0, max: 12 });
    const y = positionsDeLecture(r);
    expect(Math.abs(y.length / n - 0.5 / Math.LN2)).toBeLessThan(0.005);
  });

  it("une courbe constante vaut le réglage : le milieu de −12 à +12 est la vitesse d'origine", () => {
    const r = rapportsDeVitesse(1000, 7, constante(0.5, 1), { min: -12, max: 12 });
    expect(r.every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
  });

  it("les transpositions extrêmes restent bornées à quatre octaves", () => {
    const r = rapportsDeVitesse(10, 200);
    expect(r[0]).toBeCloseTo(16, 6);
  });
});

describe("convolution de deux sons", () => {
  it("PAR UNE IMPULSION, UN SON RESTE LUI-MÊME ; par une impulsion retardée, il est retardé d'autant", async () => {
    const x = bruit(SR / 2);
    const impulsion = son(1000, (i) => (i === 0 ? 1 : 0));
    const y = await convoluerDeuxSons(x, impulsion, 100);
    expect(y.length).toBe(x.length + 1000 - 1);
    const a = x.getChannelData(0), b = y.getChannelData(0);
    let e = 0;
    for (let i = 0; i < a.length; i++) e = Math.max(e, Math.abs(a[i] - b[i]));
    expect(e).toBeLessThan(1e-4);
    const retard = await convoluerDeuxSons(x, son(1000, (i) => (i === 700 ? 1 : 0)), 100);
    const c = retard.getChannelData(0);
    let e2 = 0;
    for (let i = 0; i < a.length; i++) e2 = Math.max(e2, Math.abs(a[i] - c[i + 700]));
    expect(e2).toBeLessThan(1e-4);
  });

  it("L'OPÉRATION EST SYMÉTRIQUE : échanger les deux sons rend le même son, au niveau près", async () => {
    const a = bruit(4000, 5), b = son(3000, (i) => Math.exp(-i / 400) * Math.sin(i / 3));
    const ab = (await convoluerDeuxSons(a, b, 100)).getChannelData(0);
    const ba = (await convoluerDeuxSons(b, a, 100)).getChannelData(0);
    // Le niveau est ramené à celui du premier son : on compare donc les formes, normalisées.
    const norme = (x: Float32Array) => { const m = Math.max(...Array.from(x, Math.abs)); return Float32Array.from(x, (v) => v / m); };
    const na = norme(ab), nb = norme(ba);
    let e = 0;
    for (let i = 0; i < na.length; i++) e = Math.max(e, Math.abs(na[i] - nb[i]));
    expect(e).toBeLessThan(1e-3);
  });

  it("SEULES LES FRÉQUENCES COMMUNES SURVIVENT : un bruit convolué par un sinus devient ce sinus", async () => {
    const y = (await convoluerDeuxSons(bruit(SR), sinus(1000, SR / 2), 100)).getChannelData(0);
    const f = frequence(y, SR / 4, SR);
    expect(Math.abs(f / 1000 - 1)).toBeLessThan(0.01);
  });

  it("le niveau de sortie est celui du premier son, et non +40 dB", async () => {
    const x = bruit(SR / 2);
    const y = (await convoluerDeuxSons(x, bruit(SR / 2, 9), 100)).getChannelData(0);
    const picX = Math.max(...Array.from(x.getChannelData(0), Math.abs));
    expect(Math.abs(Math.max(...Array.from(y, Math.abs)) - picX)).toBeLessThan(1e-4);
  });
});

describe("résonateurs", () => {
  const impulsion = () => son(SR / 10, (i) => (i === 0 ? 1 : 0));

  it("LES RAPPORTS DE LA BARRE SONT CEUX DES POUTRES : 1 ; 2,756 ; 5,404 ; 8,933", () => {
    const r = rapportsResonateurs("barre", 5);
    expect(r[1]).toBeCloseTo(2.756, 2); // 2,7565 exactement ; la littérature arrondit à 2,756
    expect(r[2]).toBeCloseTo(5.404, 3);
    expect(r[3]).toBeCloseTo(8.933, 3);
    expect(r[4]).toBeCloseTo(13.345, 2);
    expect(rapportsResonateurs("accord", 5, [0, 4, 7]).map((v) => +v.toFixed(4))).toEqual([1, 1.2599, 1.4983, 2, 2.5198]);
  });

  it("UNE IMPULSION FAIT SONNER EXACTEMENT LES FRÉQUENCES DEMANDÉES, et rien entre elles", () => {
    const y = resonateurs(impulsion(), { fondamentale: 220, rapports: rapportsResonateurs("harmonique", 4), t60: 2, brillance: 100, mix: 100 }).getChannelData(0);
    const de = SR / 10, a = SR / 10 + SR / 2;
    const sur = [220, 440, 660, 880].map((f) => amplitude(y, f, de, a));
    const entre = [330, 550, 770].map((f) => amplitude(y, f, de, a));
    expect(Math.min(...sur)).toBeGreaterThan(20 * Math.max(...entre));
  });

  it("LA RÉSONANCE SE RÈGLE EN SECONDES : après T60, 60 dB de moins", () => {
    for (const t60 of [0.5, 2]) {
      const y = resonateurs(impulsion(), { fondamentale: 440, rapports: [1], t60, brillance: 100, mix: 100 }).getChannelData(0);
      const niveau = (t: number) => amplitude(y, 440, Math.round(t * SR), Math.round(t * SR) + 2205);
      const chute = 20 * Math.log10(niveau(0.05) / niveau(0.05 + t60));
      expect(Math.abs(chute - 60), `T60 = ${t60} s : ${chute.toFixed(1)} dB`).toBeLessThan(3);
    }
  });

  it("la queue laisse sonner les résonateurs après la fin du son d'entrée", () => {
    const y = resonateurs(impulsion(), { fondamentale: 440, rapports: [1], t60: 1.5, brillance: 100, mix: 100 });
    expect(y.length).toBe(SR / 10 + Math.round(1.5 * SR));
  });

  it("LA FONDAMENTALE PILOTÉE GLISSE : de 220 à 440 Hz, le résonateur suit", () => {
    const n = 2 * SR;
    const f = Float32Array.from({ length: n + 3 * SR }, (_, i) => (i < n / 2 ? 220 : 440));
    const y = resonateurs(bruit(n), { fondamentale: 220, rapports: [1], t60: 0.3, brillance: 100, mix: 100, fondamentales: f }).getChannelData(0);
    expect(amplitude(y, 220, SR / 4, SR - 2000)).toBeGreaterThan(5 * amplitude(y, 440, SR / 4, SR - 2000));
    expect(amplitude(y, 440, SR + SR / 4, n - 2000)).toBeGreaterThan(5 * amplitude(y, 220, SR + SR / 4, n - 2000));
  });

  it("une fréquence au-delà de Nyquist est écartée, pas repliée", () => {
    const y = resonateurs(impulsion(), { fondamentale: 15000, rapports: [1, 2], t60: 1, brillance: 100, mix: 100 }).getChannelData(0);
    expect(y.every(Number.isFinite)).toBe(true);
    // 30 kHz replié tomberait à 14,1 kHz.
    expect(amplitude(y, SR - 30000, SR / 10, SR / 2)).toBeLessThan(0.05 * amplitude(y, 15000, SR / 10, SR / 2));
  });
});
