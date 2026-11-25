// audio/ecart-reference.test.ts — Chaque axe de « Écart à une référence » éprouvé par un son dont la
// réponse est connue d'avance. La faute plantée, qui montre qu'un de ces témoins sait tomber, est dans
// `ecart-reference-faute.test.ts`.
//
// LE PLANCHER SE MESURE SUR LE MÊME SON CALCULÉ À DEUX FRÉQUENCES (voir `ecart-reference-essai.ts`).
// Relevé le 2026-11-25 sur huit graines, dix secondes et quatre cents partiels : couleur de 0,048 à
// 0,070 dB, MFCC de 0,107 à 0,119, écart type des MFCC de 0,31 à 0,33. Les seuils de 0,15 dB et de 0,5
// sont donc tenus par toutes les graines, et non par celle-ci. Sur six secondes et mille partiels, une
// graine montait à 0,146 dB : des partiels espacés de 0,2 Hz battent plus lentement que la fenêtre de
// 32 768 points ne glisse, et l'énergie d'une bande grave dépend alors de l'endroit où tombent les
// trames. Un son plus long, ou moins serré dans le grave, l'efface.
import { describe, expect, it } from "vitest";
import { decrireSon } from "./ecart-reference-mesures";
import { blocsChroma, coutDtw, ecartAReference } from "./ecart-reference-ecart";
import { accord, bruitBlanc, bruitRose, clics, memeSon, sinus } from "./ecart-reference-essai";
import { REGISTRES, TIERS_COMPARES } from "./ecart-reference-couleur";

const FE = 48000;
const DO = [48, 60, 64, 67, 72], FA = [53, 65, 69, 72, 77];

/** `mesure` est à `tolerance` près de `attendu`, et le message dit les deux. */
const pres = (mesure: number, attendu: number, tolerance: number) =>
  expect(Math.abs(mesure - attendu), `mesuré ${mesure}, attendu ${attendu} ± ${tolerance}`).toBeLessThanOrEqual(tolerance);

const registre = (id: string) => REGISTRES.findIndex((r) => r.id === id);

describe("un sinus stéréo d'amplitude 0,1 à 445,1 Hz, 48 kHz", () => {
  const f = 440 * 2 ** (20 / 1200);
  const x = sinus(f, 0.1, 10, FE);
  const d = decrireSon([x, x], FE);

  it("lit −20,68 LUFS : −20 dB pour deux canaux, −0,691, et le gain de la pondération K à 445 Hz", () => pres(d.sonie, -20.68, 0.01));
  it("n'a aucune plage de sonie", () => pres(d.plageSonie, 0, 0.01));
  it("a sa crête vraie à −20 dBTP et un facteur de crête de 3,01 dB", () => {
    pres(d.creteVraie, -20, 0.01);
    pres(d.facteurCrete, 10 * Math.log10(2), 0.01);
  });
  it("a une corrélation de 1 et un côté nul", () => {
    pres(d.correlation, 1, 1e-9);
    expect(d.coteSurMilieu).toBe(-Infinity);
  });
  it("a son centroïde sur sa fréquence, toute son énergie dans le tiers de 400 Hz et le bas médium", () => {
    pres(d.centroide, f, 1);
    pres(d.couleur.tiers.get(400)!, 0, 0.01);
    pres(d.couleur.registres[registre("bas-medium")], 100, 0.01);
  });
});

describe("un bruit rose stéréo, deux tirages indépendants, 44,1 kHz", () => {
  const g = bruitRose(30, 44100, 1), dr = bruitRose(30, 44100, 2);
  const d = decrireSon([g, dr], 44100);

  it("a ses tiers d'octave égaux à 1 dB près, de 31,5 Hz à 16 kHz", () => {
    const v = TIERS_COMPARES.map((f) => d.couleur.tiers.get(f)!);
    expect(v).toHaveLength(28);
    expect(Math.max(...v) - Math.min(...v)).toBeLessThan(1);
  });
  // Trente secondes de rose font peu de degrés de liberté dans le grave, où est l'énergie : la
  // corrélation de deux tirages indépendants y flotte de quelques centièmes. Le rapport côté sur
  // milieu doit alors valoir exactement 10 log10((1 − r) / (1 + r)).
  it("a une corrélation proche de zéro, et un côté sur milieu qui en découle", () => {
    expect(Math.abs(d.correlation)).toBeLessThan(0.05);
    pres(d.coteSurMilieu, 10 * Math.log10((1 - d.correlation) / (1 + d.correlation)), 0.01);
  });

  it("atténué de 6 dB, ne change ni de couleur ni de timbre, et perd 6,02 dB de sonie, de crête et de plancher", () => {
    const e = ecartAReference(decrireSon([g.map((v) => v / 2), dr.map((v) => v / 2)], 44100), d);
    expect(e.couleur).toBeLessThan(0.01);
    expect(e.mfcc).toBeLessThan(0.01);
    expect(e.mfccEcart).toBeLessThan(0.01);
    pres(e.sonie, 20 * Math.log10(0.5), 0.01);
    pres(e.creteVraie, 20 * Math.log10(0.5), 0.01);
    pres(e.plancher, 20 * Math.log10(0.5), 0.01);
    pres(e.facteurCrete, 0, 0.01);
  });
});

describe("les autres axes, chacun sur son témoin", () => {
  it("un bruit blanc a la platitude d'un spectre de puissance exponentiel, exp(−γ) = 0,5615", () => {
    const b = bruitBlanc(20, FE, 0.1, 3);
    pres(decrireSon([b, b], FE).platitude, Math.exp(-0.5772156649), 0.01);
  });

  it("des rafales toutes les 0,5 s font 120 BPM et deux attaques par seconde", () => {
    const c = clics(40, 44100, 4);
    const d = decrireSon([c, c], 44100);
    pres(d.tempo, 120, 0.5);
    pres(d.attaques, 2, 0.1);
  });

  it("un dixième du temps à −63 dB met le plancher à −63 dB", () => {
    const x = new Float32Array(20 * FE);
    for (let i = 0; i < x.length; i++) x[i] = (i < 2 * FE ? 0.001 : 0.1) * Math.sin((2 * Math.PI * 1000 * i) / FE);
    pres(decrireSon([x, x], FE).plancher, 20 * Math.log10(0.001 / Math.SQRT2), 0.01);
  });

  it("deux sinus de même puissance à 100 Hz et 1 kHz partagent l'énergie entre le grave et le médium", () => {
    const a = sinus(100, 0.1, 10, FE), b = sinus(1000, 0.1, 10, FE);
    const x = a.map((v, i) => v + b[i]);
    const d = decrireSon([x, x], FE);
    pres(d.couleur.registres[registre("grave")], 50, 0.1);
    pres(d.couleur.registres[registre("medium")], 50, 0.1);
    pres(d.couleur.tiers.get(100)!, -10 * Math.log10(2), 0.01);
    pres(d.couleur.tiers.get(1000)!, -10 * Math.log10(2), 0.01);
  });
});

describe("l'harmonie", () => {
  const dDo = decrireSon([accord(DO, 10, FE), accord(DO, 10, FE)], FE);
  const dFa = decrireSon([accord(FA, 10, FE), accord(FA, 10, FE)], FE);

  it("retrouve un accord transposé d'une quarte à la transposition 7, et la quarte inverse à 5", () => {
    const e = ecartAReference(dFa, dDo);
    expect(e.transposition).toBe(7);
    expect(e.dtw).toBeLessThan(0.01);
    // Sans transposer, le coût est loin de zéro, et le profil seul ne voit pas la parenté.
    expect(coutDtw(blocsChroma(dFa), blocsChroma(dDo))).toBeGreaterThan(0.5);
    expect(e.chromaCos).toBeLessThan(0.5);
    expect(ecartAReference(dDo, dFa).transposition).toBe(5);
  });

  it("sépare une suite d'accords de la même suite à l'envers", () => {
    const suite = [DO, FA, [55, 67, 71, 74, 79], [57, 69, 72, 76, 81]].map((n) => accord(n, 2, FE));
    const x = new Float32Array(suite.reduce((s, a) => s + a.length, 0));
    let o = 0;
    for (const a of suite) { x.set(a, o); o += a.length; }
    const d = decrireSon([x, x], FE);
    const e = ecartAReference(d, d);
    expect(e.dtw).toBeLessThan(1e-9);
    pres(e.chromaCos, 1, 1e-9);
    expect(e.transposition).toBe(0);
    expect(e.temoinRenverse).toBeGreaterThan(0.1);
  });
});

describe("le plancher de la mesure", () => {
  it("le même son à 44,1 et à 48 kHz s'écarte de moins de 0,15 dB de couleur et de 0,5 de MFCC", () => {
    const e = ecartAReference(decrireSon(memeSon(44100, 10, 1, 400), 44100), decrireSon(memeSon(48000, 10, 1, 400), 48000));
    expect(e.couleur).toBeLessThan(0.15);
    expect(e.mfcc).toBeLessThan(0.5);
    expect(Math.abs(e.sonie)).toBeLessThan(0.01);
  });
});
