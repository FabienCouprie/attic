// audio/concatenatif.test.ts — Le test décisif : un son mosaïqué avec lui-même se retrouve.
//
// Si l'on donne comme corpus le son cible lui-même, chaque grain doit se reconnaître, et le
// recollage doit reconstruire l'original presque exactement. Cette propriété teste d'un coup
// les trois pièces — description, appariement, assemblage — et si l'une flanche, elle tombe.
// Les autres tests vérifient que les descripteurs disent bien ce qu'ils prétendent, et que
// l'appariement choisit par ressemblance et non au hasard.
import { describe, expect, it } from "vitest";
import { apparier, assembler, decrireGrains, normaliser, rapporter } from "./concatenatif";
import { fft } from "./fft";

const FS = 44100;
const fftReelle = (re: Float64Array, im: Float64Array) => fft(re, im, false);

const TAILLE = 1024;
const PAS = TAILLE / 2;

const POIDS = { rms: 1, centroide: 1, zcr: 1 };

function sinus(frequence: number, duree: number, amplitude = 0.8): Float32Array {
  const n = Math.floor(duree * FS);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = amplitude * Math.sin((2 * Math.PI * frequence * i) / FS);
  return s;
}

function bruit(duree: number, amplitude = 0.5): Float32Array {
  const n = Math.floor(duree * FS);
  const s = new Float32Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    s[i] = amplitude * (2 * (x / 4294967296) - 1);
  }
  return s;
}

function concatener(...morceaux: Float32Array[]): Float32Array {
  const total = morceaux.reduce((s, m) => s + m.length, 0);
  const sortie = new Float32Array(total);
  let p = 0;
  for (const m of morceaux) { sortie.set(m, p); p += m.length; }
  return sortie;
}

const grains = (s: Float32Array) => decrireGrains(s, FS, TAILLE, PAS, fftReelle);

describe("descripteurs", () => {
  it("ne décrit rien d'un signal plus court qu'un grain", () => {
    expect(grains(new Float32Array(100))).toEqual([]);
  });

  it("mesure le niveau", () => {
    const fort = grains(sinus(440, 0.2, 0.8))[2].rms;
    const faible = grains(sinus(440, 0.2, 0.05))[2].rms;
    expect(fort).toBeGreaterThan(faible * 10);
    expect(grains(new Float32Array(FS * 0.2))[2].rms).toBe(0);
  });

  it("mesure la brillance là où elle est", () => {
    const grave = grains(sinus(200, 0.2))[2].centroide;
    const aigu = grains(sinus(4000, 0.2))[2].centroide;
    // Le centre de gravité d'une sinusoïde est sa propre fréquence, à la résolution près.
    expect(Math.abs(grave - 200)).toBeLessThan(120);
    expect(Math.abs(aigu - 4000)).toBeLessThan(200);
  });

  it("distingue le bruit d'un son tenu par les passages par zéro", () => {
    expect(grains(bruit(0.2))[2].zcr).toBeGreaterThan(grains(sinus(200, 0.2))[2].zcr * 5);
  });

  it("avance du pas demandé", () => {
    const g = grains(sinus(440, 0.2));
    expect(g[1].debut - g[0].debut).toBe(PAS);
    expect(g.every((x) => x.longueur === TAILLE)).toBe(true);
  });
});

describe("normalisation", () => {
  it("ramène les trois descripteurs à la même échelle", () => {
    const a = grains(sinus(200, 0.3)), b = grains(sinus(6000, 0.3));
    const projeter = normaliser([a, b]);
    const tous = [...a, ...b].map(projeter);
    for (let d = 0; d < 3; d++) {
      const valeurs = tous.map((v) => v[d]);
      const moyenne = valeurs.reduce((s, x) => s + x, 0) / valeurs.length;
      expect(Math.abs(moyenne), `descripteur ${d}`).toBeLessThan(1e-6);
    }
  });

  it("supporte un descripteur constant sans diviser par zéro", () => {
    const g = grains(sinus(440, 0.3));
    const projeter = normaliser([g]);
    for (const x of g.map(projeter).flat()) expect(Number.isFinite(x)).toBe(true);
  });
});

describe("appariement", () => {
  it("reconnaît chaque grain quand le corpus est la cible elle-même", () => {
    const signal = concatener(sinus(200, 0.15), bruit(0.15), sinus(3000, 0.15));
    const g = grains(signal);
    const indices = apparier(g, g, POIDS);
    expect(indices).toEqual(g.map((_, i) => i));
  });

  it("choisit le grain qui ressemble, pas n'importe lequel", () => {
    // Corpus fait de trois zones : grave, bruit, aigu. Cible : un aigu.
    const corpusSignal = concatener(sinus(200, 0.1), bruit(0.1), sinus(5000, 0.1));
    const corpus = grains(corpusSignal);
    const cible = grains(sinus(5000, 0.05));
    const indices = apparier(cible, corpus, POIDS);
    // Les grains choisis doivent venir de la dernière zone.
    const zoneAigue = Math.floor((0.2 * FS) / PAS);
    for (const i of indices) expect(corpus[i].debut / PAS).toBeGreaterThanOrEqual(zoneAigue - 1);
  });

  it("suit la brillance de la cible quand elle monte", () => {
    const corpusSignal = concatener(sinus(300, 0.08), sinus(1200, 0.08), sinus(5000, 0.08));
    const corpus = grains(corpusSignal);
    const monte = concatener(sinus(300, 0.04), sinus(1200, 0.04), sinus(5000, 0.04));
    const indices = apparier(grains(monte), corpus, POIDS);
    // Le premier grain vient d'avant le dernier : l'ordre est respecté.
    expect(indices[0]).toBeLessThan(indices[indices.length - 1]);
  });

  it("ne rend rien d'un corpus vide", () => {
    expect(apparier(grains(sinus(440, 0.2)), [], POIDS)).toEqual([]);
  });

  it("évite de répéter le même grain quand le corpus est trop pauvre", () => {
    // Un corpus court et uniforme contre une cible longue : tous les grains du corpus se
    // valent, et sans pénalité l'appariement prend toujours le même. C'est le défaut le
    // plus audible du procédé — un grain répété cent fois fait un bourdonnement.
    const corpusSignal = sinus(440, 0.1);
    const corpus = grains(corpusSignal);
    const cible = grains(sinus(440, 0.5));
    const consecutifs = (indices: number[]) =>
      indices.filter((x, i) => i > 0 && x === indices[i - 1]).length;
    const sans = consecutifs(apparier(cible, corpus, POIDS, 0));
    const avec = consecutifs(apparier(cible, corpus, POIDS, 10));
    expect(sans).toBeGreaterThan(0);
    expect(avec).toBeLessThan(sans);
  });

  it("compte la variété du résultat", () => {
    const corpusSignal = concatener(sinus(300, 0.1), sinus(3000, 0.1));
    const corpus = grains(corpusSignal);
    const indices = apparier(grains(sinus(3000, 0.1)), corpus, POIDS);
    const r = rapporter(indices, corpus.length);
    expect(r.grainsCible).toBe(indices.length);
    expect(r.grainsCorpus).toBe(corpus.length);
    expect(r.distincts).toBeGreaterThan(0);
    expect(r.partDuPlusFrequent).toBeGreaterThan(0);
    expect(r.partDuPlusFrequent).toBeLessThanOrEqual(1);
  });

  it("annonce un corpus trop pauvre par la palette autant que par le favori", () => {
    // Le cas mesuré dans l'application : six grains distincts sur cent neuf, avec un plus
    // fréquent à 46 % seulement. La palette est minuscule, le résultat bourdonne, et le
    // seul critère du grain le plus fréquent laissait passer ce cas.
    const peuVarie = rapporter([...Array(109)].map((_, i) => i % 6), 199);
    expect(peuVarie.partDuPlusFrequent).toBeLessThan(0.5);
    expect(peuVarie.repetitif).toBe(true);

    const unSeul = rapporter([...Array(20)].map(() => 3), 50);
    expect(unSeul.repetitif).toBe(true);

    const varie = rapporter([...Array(60)].map((_, i) => i), 100);
    expect(varie.repetitif).toBe(false);

    expect(rapporter([], 10).repetitif).toBe(false);
  });
});

describe("assemblage", () => {
  it("reconstruit le son quand le corpus est la cible — le test décisif", () => {
    const signal = concatener(sinus(220, 0.1), bruit(0.1), sinus(1500, 0.1));
    const g = grains(signal);
    const indices = apparier(g, g, POIDS);
    const sortie = assembler(signal, g, indices, g, signal.length);
    // On compare là où les fenêtres se recouvrent pleinement, c'est-à-dire partout sauf
    // aux deux extrémités du premier et du dernier grain.
    let erreur = 0, energie = 0;
    for (let i = TAILLE; i < signal.length - TAILLE; i++) {
      erreur += (sortie[i] - signal[i]) ** 2;
      energie += signal[i] * signal[i];
    }
    expect(Math.sqrt(erreur / energie)).toBeLessThan(0.02);
  });

  it("rend la longueur demandée", () => {
    const signal = sinus(440, 0.2);
    const g = grains(signal);
    expect(assembler(signal, g, apparier(g, g, POIDS), g, signal.length).length)
      .toBe(signal.length);
  });

  it("ne laisse pas de claquement aux raccords", () => {
    // Le corpus doit être LISSE pour que la mesure ait un sens : un corpus de bruit blanc
    // saute d'un échantillon à l'autre de toute l'amplitude, et l'on mesurerait le bruit et
    // non les raccords. Avec un corpus sinusoïdal, la pente naturelle est connue — un
    // 300 Hz à 0,8 ne peut pas bouger de plus de 0,035 par échantillon — et tout saut
    // au-delà serait une soudure mal faite.
    const corpusSignal = sinus(300, 0.3);
    const corpus = grains(corpusSignal);
    const cible = grains(bruit(0.2));
    const sortie = assembler(corpusSignal, corpus, apparier(cible, corpus, POIDS), cible, Math.floor(0.2 * FS));
    let saut = 0;
    for (let i = 1; i < sortie.length; i++) saut = Math.max(saut, Math.abs(sortie[i] - sortie[i - 1]));
    expect(saut).toBeLessThan(0.1);
  });

  it("laisse le silence là où aucun grain n'a été posé", () => {
    const signal = sinus(440, 0.2);
    const g = grains(signal);
    const sortie = assembler(signal, g, apparier(g, g, POIDS), g, signal.length * 2);
    let fin = 0;
    for (let i = signal.length + TAILLE; i < sortie.length; i++) fin += Math.abs(sortie[i]);
    expect(fin).toBe(0);
  });

  it("ignore un index hors du corpus plutôt que de planter", () => {
    const signal = sinus(440, 0.2);
    const g = grains(signal);
    const sortie = assembler(signal, g, [9999, 0, 1], g, signal.length);
    for (const x of sortie) expect(Number.isFinite(x)).toBe(true);
  });

  it("rend deux fois le même résultat", () => {
    const signal = concatener(sinus(220, 0.1), bruit(0.1));
    const g = grains(signal);
    const faire = () => assembler(signal, g, apparier(g, g, POIDS), g, signal.length);
    expect(faire()).toEqual(faire());
  });
});
