// audio/spectral-cdp.test.ts — Le vocodeur de phase, les cinq opérations, le banc de peignes.
//
// Chaque test fabrique un son dont on connaît les partiels, et mesure où ils sont arrivés.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import {
  SAUT, analyserPV, arpegerSpectre, parCanal, cribler, etirerSpectre, filtrerParSpectre, melangerFenetres, rangsRetenus, synthetiserPV,
} from "./spectral-cdp";
import { peignes } from "./peigne";
import { creerAleatoire } from "../core/hasard";

const SR = 44100;
const somme = (freqs: number[], n = SR, a = 0.2) =>
  Float32Array.from({ length: n }, (_, i) => freqs.reduce((s, f) => s + a * Math.sin(2 * Math.PI * f * i / SR), 0));
const bruit = (n: number, g = 3) => { let e = g; return Float32Array.from({ length: n }, () => { e = (e * 1664525 + 1013904223) >>> 0; return 0.3 * (e / 4294967296 * 2 - 1); }); };
const tampon = (x: Float32Array) => { const b = new AudioBuffer({ numberOfChannels: 1, length: x.length, sampleRate: SR }); b.copyToChannel(new Float32Array(x), 0); return b; };

/** Amplitude d'une fréquence sur un intervalle, par Goertzel. */
function amplitude(x: Float32Array, hz: number, de = 0, a = x.length): number {
  const w = (2 * Math.PI * hz) / SR, k = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = de; i < a; i++) { const s0 = x[i] + k * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / ((a - de) / 2);
}
const milieu = (x: Float32Array) => [Math.round(x.length * 0.2), Math.round(x.length * 0.8)] as const;

describe("le vocodeur de phase", () => {
  it("SANS OPÉRATION, LE SON REVIENT : même amplitude de chaque partiel, à 1 % près", () => {
    const x = somme([220, 660, 1500]);
    const a = analyserPV(x, SR);
    const y = synthetiserPV(a);
    const [de, fin] = milieu(x);
    for (const f of [220, 660, 1500]) expect(Math.abs(amplitude(y, f, de, fin) / amplitude(x, f, de, fin) - 1), `${f} Hz`).toBeLessThan(0.01);
  });
});

describe("étirement du spectre", () => {
  it("k = 1,5 AU-DESSUS DE 200 Hz : 400 → 566, 600 → 1039, 800 → 1600 ; 200 ne bouge pas", () => {
    const x = somme([200, 400, 600, 800]);
    const a = analyserPV(x, SR);
    const y = synthetiserPV(a, etirerSpectre(a, 200, () => 1.5));
    const [de, fin] = milieu(x);
    const attendus = [200, 200 * 2 ** 1.5, 200 * 3 ** 1.5, 200 * 4 ** 1.5];
    for (const f of attendus) expect(amplitude(y, f, de, fin), `${f.toFixed(0)} Hz`).toBeGreaterThan(0.1);
    // Et plus rien aux anciennes places : le son n'est plus harmonique.
    for (const f of [400, 600, 800]) expect(amplitude(y, f, de, fin), `${f} Hz résiduel`).toBeLessThan(0.02);
  });

  it("LE FACTEUR PEUT ÉVOLUER : un son qui devient progressivement inharmonique", () => {
    const x = somme([200, 400, 600], 2 * SR);
    const a = analyserPV(x, SR);
    const n = a.trames.length;
    const y = synthetiserPV(a, etirerSpectre(a, 200, (t) => 1 + 0.5 * (t / n)));
    // Au début, 400 est encore là ; à la fin, il a monté vers 566.
    expect(amplitude(y, 400, SR / 10, SR / 3)).toBeGreaterThan(5 * amplitude(y, 400, Math.round(1.7 * SR), 2 * SR - 2000));
    expect(amplitude(y, 200 * 2 ** 1.45, Math.round(1.7 * SR), 2 * SR - 2000)).toBeGreaterThan(0.05);
  });
});

describe("arpègement du spectre", () => {
  it("UNE BANDE MONTANTE FAIT SONNER LE GRAVE, PUIS LE MÉDIUM, PUIS L'AIGU", () => {
    const x = somme([200, 800, 3200], 2 * SR);
    const a = analyserPV(x, SR);
    const y = synthetiserPV(a, arpegerSpectre(a, { vitesse: 0.5, largeur: 0.6, bas: 150, haut: 4500, sens: "montant", remanence: 0 }));
    // Où chaque partiel est-il le plus fort ? Sur des fenêtres de 100 ms.
    const quand = (f: number) => {
      let meilleur = 0, t = 0;
      for (let d = 0; d + 4410 < 2 * SR; d += 2205) { const v = amplitude(y, f, d, d + 4410); if (v > meilleur) { meilleur = v; t = d; } }
      return t / SR;
    };
    const t200 = quand(200), t800 = quand(800), t3200 = quand(3200);
    expect(t200).toBeLessThan(t800);
    expect(t800).toBeLessThan(t3200);
  });

  it("la rémanence laisse sonner un partiel après le passage de la bande", () => {
    const x = somme([200, 3200], 2 * SR);
    const a = analyserPV(x, SR);
    const sec = synthetiserPV(a, arpegerSpectre(a, { vitesse: 0.5, largeur: 0.4, bas: 150, haut: 4500, sens: "montant", remanence: 0 }));
    const long = synthetiserPV(a, arpegerSpectre(a, { vitesse: 0.5, largeur: 0.4, bas: 150, haut: 4500, sens: "montant", remanence: 3 }));
    // Au moment où la bande est dans l'aigu, le 200 Hz s'est tu sans rémanence, pas avec.
    const [de, fin] = [Math.round(1.6 * SR), Math.round(1.8 * SR)];
    expect(amplitude(long, 200, de, fin)).toBeGreaterThan(5 * amplitude(sec, 200, de, fin));
  });
});

describe("mélange des fenêtres", () => {
  const troisNotes = () => {
    const f = [300, 600, 1200];
    return Float32Array.from({ length: 3 * SR }, (_, i) => 0.3 * Math.sin(2 * Math.PI * f[Math.min(2, Math.floor(i / SR))] * i / SR));
  };

  it("À PORTÉE NULLE, RIEN NE BOUGE", () => {
    const a = analyserPV(troisNotes(), SR);
    const m = melangerFenetres(a, 4, 0, creerAleatoire(1));
    expect(m.every((tr, i) => tr === a.trames[i])).toBe(true);
  });

  it("À GRANDE PORTÉE, LES INSTANTS SE MÊLENT : la note de la fin se fait entendre au début", () => {
    const x = troisNotes();
    const a = analyserPV(x, SR);
    const y = synthetiserPV(a, melangerFenetres(a, 4, 200, creerAleatoire(7)));
    expect(amplitude(y, 1200, 0, SR)).toBeGreaterThan(20 * amplitude(x, 1200, 2000, SR - 2000));
    // Le mélange n'invente ni ne perd de fenêtres : autant de trames, chacune une seule fois.
    const m = melangerFenetres(a, 4, 200, creerAleatoire(7));
    expect(new Set(m).size).toBe(a.trames.length);
  });

  it("à graine égale, le même mélange", () => {
    const a = analyserPV(troisNotes(), SR);
    const u = melangerFenetres(a, 3, 50, creerAleatoire(4)), v = melangerFenetres(a, 3, 50, creerAleatoire(4));
    expect(u.every((tr, i) => tr === v[i])).toBe(true);
  });
});

describe("crible harmonique", () => {
  it("LES RANGS : impairs, pairs, premiers", () => {
    expect([...rangsRetenus("impairs", 9)]).toEqual([1, 3, 5, 7, 9]);
    expect([...rangsRetenus("premiers", 12)]).toEqual([1, 2, 3, 5, 7, 11]);
    expect([...rangsRetenus([2, 5], 9)]).toEqual([2, 5]);
  });

  it("SUR UN BRUIT, LE CRIBLE DÉCOUPE UN ACCORD : les harmoniques de 200 Hz, et rien entre elles", () => {
    const x = bruit(2 * SR);
    const a = analyserPV(x, SR);
    const y = synthetiserPV(a, cribler(a, () => 200, "tous", 30, false));
    const [de, fin] = milieu(y);
    const sur = [200, 400, 600, 800].map((f) => amplitude(y, f, de, fin));
    const entre = [300, 500, 700].map((f) => amplitude(y, f, de, fin));
    expect(Math.min(...sur)).toBeGreaterThan(4 * Math.max(...entre));
  });

  it("SUR UN SON HARMONIQUE : garder les impairs ôte les pairs ; inversé, l'inverse", () => {
    const x = somme([200, 400, 600, 800]);
    const a = analyserPV(x, SR);
    const impairs = synthetiserPV(a, cribler(a, () => 200, "impairs", 30, false));
    const inverse = synthetiserPV(a, cribler(a, () => 200, "impairs", 30, true));
    const [de, fin] = milieu(x);
    expect(amplitude(impairs, 600, de, fin)).toBeGreaterThan(20 * amplitude(impairs, 400, de, fin));
    expect(amplitude(inverse, 400, de, fin)).toBeGreaterThan(20 * amplitude(inverse, 600, de, fin));
  });
});

describe("filtrer un spectre par un autre", () => {
  it("UN BRUIT FILTRÉ PAR UNE NOTE PREND LES PARTIELS DE LA NOTE", () => {
    const aB = analyserPV(somme([220, 440, 660], 2 * SR), SR);
    const aN = analyserPV(bruit(2 * SR), SR);
    const y = synthetiserPV(aN, filtrerParSpectre(aN, aB, 1, 0));
    const [de, fin] = milieu(y);
    const sur = [220, 440, 660].map((f) => amplitude(y, f, de, fin));
    const entre = [330, 550, 1000].map((f) => amplitude(y, f, de, fin));
    expect(Math.min(...sur)).toBeGreaterThan(4 * Math.max(...entre));
  });

  it("À PROFONDEUR NULLE, LE PREMIER SON RESTE INTACT", () => {
    const aA = analyserPV(somme([300, 900]), SR), aB = analyserPV(bruit(SR), SR);
    const f = filtrerParSpectre(aA, aB, 0, 0);
    expect(f.every((tr, t) => tr.amp.every((v, i) => v === aA.trames[t].amp[i]))).toBe(true);
  });
});

describe("banc de peignes", () => {
  const impulsion = () => tampon(Float32Array.from({ length: SR / 10 }, (_, i) => (i === 0 ? 1 : 0)));

  it("UN PEIGNE À 220 Hz RÉSONNE À 220 ET À TOUS SES MULTIPLES, et pas entre", () => {
    const y = peignes(impulsion(), { frequences: [220], t60: 2, amortissement: 0, mix: 100 }).getChannelData(0);
    const de = SR / 10, fin = de + SR / 2;
    const sur = [220, 440, 660, 880].map((f) => amplitude(y, f, de, fin));
    const entre = [330, 550, 770].map((f) => amplitude(y, f, de, fin));
    expect(Math.min(...sur)).toBeGreaterThan(10 * Math.max(...entre));
  });

  it("LA RÉSONANCE DURE LE T60 DEMANDÉ, grave comme aigu", () => {
    for (const f of [110, 880]) {
      // Une entrée d'une demi-seconde : la seconde mesure, à 1,05 s, doit tomber dans le fichier.
      const longue = tampon(Float32Array.from({ length: SR / 2 }, (_, i) => (i === 0 ? 1 : 0)));
      const y = peignes(longue, { frequences: [f], t60: 1, amortissement: 0, mix: 100 }).getChannelData(0);
      const niveau = (t: number) => amplitude(y, f, Math.round(t * SR), Math.round(t * SR) + 4410);
      const chute = 20 * Math.log10(niveau(0.05) / niveau(1.05));
      expect(Math.abs(chute - 60), `${f} Hz : ${chute.toFixed(1)} dB`).toBeLessThan(4);
    }
  });

  it("L'AMORTISSEMENT ÉTEINT LES AIGUS AVANT LES GRAVES", () => {
    const y = peignes(impulsion(), { frequences: [220], t60: 2, amortissement: 40, mix: 100 }).getChannelData(0);
    const tard = Math.round(0.8 * SR);
    const rapportTot = amplitude(y, 1760, SR / 10, SR / 10 + 4410) / amplitude(y, 220, SR / 10, SR / 10 + 4410);
    const rapportTard = amplitude(y, 1760, tard, tard + 4410) / amplitude(y, 220, tard, tard + 4410);
    expect(rapportTard).toBeLessThan(rapportTot / 3);
  });

  it("AMORTI, LE PEIGNE RESTE ACCORDÉ : la note ne baisse pas quand on l'étouffe", () => {
    const y = peignes(tampon(bruit(SR)), { frequences: [220], t60: 2, amortissement: 60, mix: 100 }).getChannelData(0);
    // Le partiel le plus fort autour de 220 Hz, cherché au hertz près.
    let meilleur = 0, ou = 0;
    for (let f = 205; f <= 235; f += 0.5) { const v = amplitude(y, f, SR / 5, SR); if (v > meilleur) { meilleur = v; ou = f; } }
    expect(Math.abs(ou - 220), `crête à ${ou} Hz`).toBeLessThanOrEqual(1);
  });

  it("UNE TRANSPOSITION PILOTÉE FAIT GLISSER L'ACCORD, et la sortie reste finie", () => {
    const n = 2 * SR;
    const tr = Float32Array.from({ length: n + 3 * SR }, (_, i) => (i < n / 2 ? 1 : 2));
    const y = peignes(tampon(bruit(n)), { frequences: [220], t60: 0.3, amortissement: 10, mix: 100, transpositions: tr }).getChannelData(0);
    expect(y.every(Number.isFinite)).toBe(true);
    expect(amplitude(y, 220, SR / 4, SR - 2000)).toBeGreaterThan(3 * amplitude(y, 220, SR + SR / 4, n - 2000));
  });
});

describe("la garde de crête", () => {
  it("UN BRUIT MÉLANGÉ NE DÉPASSE PAS LA CRÊTE D'ENTRÉE ; l'identité n'est pas touchée", () => {
    const x = tampon(bruit(2 * SR));
    const picDe = (b: AudioBuffer) => Math.max(...Array.from(b.getChannelData(0), Math.abs));
    const melange = parCanal(x, (a) => melangerFenetres(a, 4, 40, creerAleatoire(1)));
    expect(picDe(melange)).toBeLessThanOrEqual(picDe(x) + 1e-6);
    const identite = parCanal(x, (a) => a.trames);
    expect(Math.abs(picDe(identite) - picDe(x))).toBeLessThan(1e-3);
  });
});

// Le saut est exporté pour que les nœuds puissent convertir une durée en trames.
it("un saut d'un quart de trame", () => expect(SAUT).toBe(512));
