// audio/egaliseur-parametrique.test.ts — La réponse rendue est celle que la théorie annonce, au centième de décibel.
//
// L'ORACLE N'EST PAS LE MODULE. Les formules de Robert Bristow-Johnson sont récrites ici, à part,
// et la réponse est MESURÉE sur ce que le moteur Web Audio rend d'une impulsion : la transformée de
// Fourier de la réponse impulsionnelle, prise aux fréquences qui comptent. Un module qui poserait le
// mauvais type de filtre, le mauvais Q ou les étages dans le désordre s'écarterait de la théorie.
//
// TROIS PROPRIÉTÉS SONT TENUES EN PLUS, QUI NE DOIVENT RIEN AUX FORMULES : une cloche rend son gain
// exact à son centre, un plateau la moitié de son gain à sa charnière, un passe-haut −3 dB à sa
// coupure. Si les formules du test étaient fausses de la même façon que le module, celles-là
// tomberaient quand même.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { egaliserParametrique, etagesActifs, type ReglagesEgaliseur } from "./egaliseur-parametrique";

const SR = 48000;
const N = 1 << 16;

const NEUTRE: ReglagesEgaliseur = {
  passeHaut: 0, graveFrequence: 100, graveGainDb: 0,
  cloches: [{ frequence: 250, gainDb: 0, q: 1 }, { frequence: 1000, gainDb: 0, q: 1 },
    { frequence: 3000, gainDb: 0, q: 1 }, { frequence: 8000, gainDb: 0, q: 1 }],
  aiguFrequence: 10000, aiguGainDb: 0,
};

const avec = (modif: Partial<ReglagesEgaliseur>, cloches?: Partial<ReglagesEgaliseur["cloches"][number]>[]) => ({
  ...NEUTRE, ...modif,
  cloches: NEUTRE.cloches.map((c, i) => ({ ...c, ...cloches?.[i] })),
});

/** Les coefficients d'un étage, d'après le livre de recettes, récrits sans rien emprunter au module. */
function coefficients(type: string, f0: number, gainDb: number, qLin: number): [number[], number[]] {
  const w0 = 2 * Math.PI * f0 / SR, c = Math.cos(w0), s = Math.sin(w0), A = Math.pow(10, gainDb / 40);
  if (type === "peaking") {
    const al = s / (2 * qLin);
    return [[1 + al * A, -2 * c, 1 - al * A], [1 + al / A, -2 * c, 1 - al / A]];
  }
  if (type === "highpass") {
    const al = s / (2 * qLin);
    return [[(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al]];
  }
  const al = s / Math.SQRT2, r = 2 * Math.sqrt(A) * al;
  if (type === "lowshelf") {
    return [[A * ((A + 1) - (A - 1) * c + r), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - r)],
      [(A + 1) + (A - 1) * c + r, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - r]];
  }
  return [[A * ((A + 1) + (A - 1) * c + r), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - r)],
    [(A + 1) - (A - 1) * c + r, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - r]];
}

/** Le gain théorique d'un étage à une fréquence, en décibels. */
function theorie(type: string, f0: number, gainDb: number, qLin: number, f: number): number {
  const [b, a] = coefficients(type, f0, gainDb, qLin), w = 2 * Math.PI * f / SR;
  const mod = (k: number[]) => Math.hypot(k[0] + k[1] * Math.cos(w) + k[2] * Math.cos(2 * w), k[1] * Math.sin(w) + k[2] * Math.sin(2 * w));
  return 20 * Math.log10(mod(b) / mod(a));
}

/** Rend une impulsion par l'égaliseur et rend son gain mesuré à chaque fréquence demandée. */
async function mesurer(r: ReglagesEgaliseur, frequences: number[]): Promise<number[]> {
  const impulsion = new AudioBuffer({ numberOfChannels: 1, length: N, sampleRate: SR });
  impulsion.getChannelData(0)[0] = 1;
  const h = (await egaliserParametrique(impulsion, r)).getChannelData(0);
  return frequences.map((f) => {
    let re = 0, im = 0;
    const w = 2 * Math.PI * f / SR;
    for (let n = 0; n < h.length; n++) { re += h[n] * Math.cos(w * n); im -= h[n] * Math.sin(w * n); }
    return 20 * Math.log10(Math.hypot(re, im));
  });
}

const FREQUENCES = [20, 50, 100, 200, 500, 1000, 2000, 3000, 5000, 8000, 10000, 12000, 16000, 20000];

async function ecartMax(r: ReglagesEgaliseur, attendu: (f: number) => number): Promise<number> {
  const mesure = await mesurer(r, FREQUENCES);
  return Math.max(...FREQUENCES.map((f, i) => Math.abs(mesure[i] - attendu(f))));
}

describe("l'égaliseur paramétrique, contre la théorie", () => {
  it("UNE CLOCHE suit la courbe du livre de recettes, et rend son gain exact à son centre", async () => {
    const r = avec({}, [{}, {}, { frequence: 3000, gainDb: 6, q: 1.5 }]);
    expect(await ecartMax(r, (f) => theorie("peaking", 3000, 6, 1.5, f))).toBeLessThan(0.01);
    expect((await mesurer(r, [3000]))[0]).toBeCloseTo(6, 2);
  });

  it("LE PLATEAU AIGU monte l'octave du haut, et rend la moitié de son gain à sa charnière", async () => {
    const r = avec({ aiguFrequence: 10000, aiguGainDb: 4 });
    expect(await ecartMax(r, (f) => theorie("highshelf", 10000, 4, 1, f))).toBeLessThan(0.01);
    const [charniere, haut, bas] = await mesurer(r, [10000, 20000, 500]);
    expect(charniere).toBeCloseTo(2, 2);
    expect(haut).toBeGreaterThan(3.5);
    expect(Math.abs(bas)).toBeLessThan(0.05);
  });

  it("LE PLATEAU GRAVE agit sous sa charnière et laisse l'aigu", async () => {
    const r = avec({ graveFrequence: 100, graveGainDb: -6 });
    expect(await ecartMax(r, (f) => theorie("lowshelf", 100, -6, 1, f))).toBeLessThan(0.01);
    const [charniere, aigu] = await mesurer(r, [100, 10000]);
    expect(charniere).toBeCloseTo(-3, 2);
    expect(Math.abs(aigu)).toBeLessThan(0.01);
  });

  it("LE PASSE-HAUT est un Butterworth : −3 dB à la coupure, douze décibels par octave, sans bosse", async () => {
    const r = avec({ passeHaut: 80 });
    expect(await ecartMax(r, (f) => theorie("highpass", 80, 0, Math.SQRT1_2, f))).toBeLessThan(0.01);
    const [coupure, octaveDessous, deuxOctaves, haut] = await mesurer(r, [80, 40, 20, 1000]);
    expect(coupure).toBeCloseTo(-3.01, 2);
    expect(octaveDessous).toBeLessThan(-11.5);
    expect(deuxOctaves).toBeLessThan(-23.5);
    expect(Math.abs(haut)).toBeLessThan(0.05);
  });

  it("LES ÉTAGES S'ADDITIONNENT EN DÉCIBELS : la chaîne entière suit la somme des sept courbes", async () => {
    const r = avec({ passeHaut: 30, graveFrequence: 120, graveGainDb: 3, aiguFrequence: 12000, aiguGainDb: 2.5 },
      [{ frequence: 340, gainDb: -4, q: 4 }, { frequence: 900, gainDb: 1.5, q: 0.7 },
        { frequence: 3500, gainDb: 3, q: 1 }, { frequence: 7000, gainDb: -2, q: 2 }]);
    const somme = (f: number) => theorie("highpass", 30, 0, Math.SQRT1_2, f) + theorie("lowshelf", 120, 3, 1, f)
      + r.cloches.reduce((s, c) => s + theorie("peaking", c.frequence, c.gainDb, c.q, f), 0)
      + theorie("highshelf", 12000, 2.5, 1, f);
    expect(await ecartMax(r, somme)).toBeLessThan(0.01);
  });
});

describe("l'égaliseur paramétrique, à plat et aux bords", () => {
  it("RIEN DE RÉGLÉ, RIEN DE POSÉ : le son revient à l'échantillon près", async () => {
    expect(etagesActifs(NEUTRE, SR)).toEqual([]);
    const b = new AudioBuffer({ numberOfChannels: 2, length: 4800, sampleRate: SR });
    for (let c = 0; c < 2; c++) b.getChannelData(c).set(Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i * (c + 1) * 0.07) * 0.5));
    const sortie = await egaliserParametrique(b, NEUTRE);
    for (let c = 0; c < 2; c++) expect(Array.from(sortie.getChannelData(c))).toEqual(Array.from(b.getChannelData(c)));
  });

  it("une bande à zéro décibel est sautée, quelles que soient sa fréquence et sa largeur", () => {
    const r = avec({ graveFrequence: 40 }, [{ frequence: 15000, q: 9 }]);
    expect(etagesActifs(r, SR)).toEqual([]);
    expect(etagesActifs(avec({}, [{ gainDb: 2 }]), SR).map((e) => e.type)).toEqual(["peaking"]);
  });

  it("garde la durée, la cadence et le nombre de canaux", async () => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: 4410, sampleRate: 44100 });
    const sortie = await egaliserParametrique(b, avec({ aiguGainDb: 3 }));
    expect([sortie.length, sortie.sampleRate, sortie.numberOfChannels]).toEqual([4410, 44100, 2]);
  });

  it("UNE FRÉQUENCE AU-DELÀ DE LA MOITIÉ DE LA CADENCE est ramenée dessous, et le son reste fini", async () => {
    const b = new AudioBuffer({ numberOfChannels: 1, length: 3200, sampleRate: 32000 });
    b.getChannelData(0).set(Float32Array.from({ length: 3200 }, (_, i) => Math.sin(i * 0.3) * 0.5));
    const r = avec({ aiguFrequence: 20000, aiguGainDb: 6 }, [{ frequence: 18000, gainDb: 6, q: 2 }]);
    expect(Math.max(...etagesActifs(r, 32000).map((e) => e.frequence))).toBeLessThan(16000);
    const sortie = await egaliserParametrique(b, r);
    expect(sortie.getChannelData(0).every(Number.isFinite)).toBe(true);
  });
});
