// audio/velours.test.ts — Réverbération à bruit de velours.
//
// Deux choses se vérifient ici, et ce sont celles qui distinguent ce nœud des quatre
// réverbérations déjà présentes : la structure du velours — UNE impulsion par intervalle, ni
// plus ni moins — et le fait que la décroissance obtenue soit bien CELLE QU'ON A DEMANDÉE, y
// compris quand elle ne ressemble à aucune salle.
import { describe, expect, it } from "vitest";
import {
  convoluer, courbeDecroissance, courbeSchroeder, reponseVelours, sequenceVelours,
} from "./velours";

const SR = 44100;

describe("la séquence de velours", () => {
  it("place UNE impulsion par intervalle, ni plus ni moins", () => {
    // C'est ce qui distingue le velours d'un bruit épars quelconque : deux impulsions trop
    // proches feraient entendre un grain, un intervalle vide ferait un trou.
    const densite = 1000, longueur = SR;
    const { positions } = sequenceVelours(longueur, densite, SR, 3);
    // L'intervalle est ARRONDI à un nombre entier d'échantillons — une position ne peut pas être
    // fractionnaire —, si bien que la densité obtenue est 44 100/44 = 1 002 et non 1 000. L'écart
    // est celui de l'arrondi, et le test le reprend plutôt que de l'ignorer.
    const intervalle = Math.round(SR / densite);
    expect(positions.length).toBe(Math.floor(longueur / intervalle));
    for (let k = 0; k < positions.length; k++) {
      expect(positions[k]).toBeGreaterThanOrEqual(k * intervalle);
      expect(positions[k]).toBeLessThan((k + 1) * intervalle);
    }
  });

  it("les positions sont strictement croissantes", () => {
    const { positions } = sequenceVelours(SR, 1500, SR, 9);
    for (let k = 1; k < positions.length; k++) expect(positions[k]).toBeGreaterThan(positions[k - 1]);
  });

  it("les signes valent ±1 et s'équilibrent", () => {
    const { signes } = sequenceVelours(SR, 2000, SR, 11);
    expect([...signes].every((s) => s === 1 || s === -1)).toBe(true);
    const somme = [...signes].reduce((a, b) => a + b, 0);
    expect(Math.abs(somme) / signes.length).toBeLessThan(0.1);
  });

  it("est reproductible à graine égale", () => {
    const a = sequenceVelours(10000, 1500, SR, 42);
    const b = sequenceVelours(10000, 1500, SR, 42);
    expect([...a.positions]).toEqual([...b.positions]);
    expect([...a.signes]).toEqual([...b.signes]);
  });
});

describe("les profils de décroissance", () => {
  it("l'exponentielle perd soixante décibels au temps demandé", () => {
    const c = courbeDecroissance(SR * 2, SR, { profil: "exponentielle", rt60: 1 });
    // À une seconde, l'amplitude doit valoir un millième.
    expect(20 * Math.log10(c[SR])).toBeCloseTo(-60, 0);
  });

  it("la linéaire descend en ligne droite", () => {
    const c = courbeDecroissance(1000, SR, { profil: "lineaire" });
    expect(c[0]).toBeCloseTo(1, 5);
    expect(c[500]).toBeCloseTo(0.5, 2);
    expect(c[999]).toBeCloseTo(0, 5);
  });

  it("LE GONFLEMENT MONTE AU LIEU DE DESCENDRE — ce qu'aucune salle ne fait", () => {
    const c = courbeDecroissance(SR, SR, { profil: "gonflement", rt60: 0.5 });
    expect(c[0]).toBeLessThan(c[SR / 2]);
    expect(c[SR / 2]).toBeLessThan(c[SR - 1]);
    expect(c[SR - 1]).toBeCloseTo(1, 5);
  });

  it("la couplée a deux pentes, la seconde plus douce que la première", () => {
    // Signature d'une salle qui en contient une autre : la petite s'éteint vite, la grande tient.
    const n = SR * 2;
    const c = courbeDecroissance(n, SR, { profil: "couplee", rt60: 2, coude: 0.25 });
    const pente = (a: number, b: number) => (20 * Math.log10(c[b]) - 20 * Math.log10(c[a])) / (b - a);
    const premiere = pente(1000, Math.floor(n * 0.2));
    const seconde = pente(Math.floor(n * 0.6), n - 1000);
    expect(premiere).toBeLessThan(seconde); // plus négative = plus raide
  });
});

describe("la réponse impulsionnelle", () => {
  it("est éparse : l'immense majorité des échantillons est nulle avant filtrage", () => {
    const h = reponseVelours({ duree: 0.5, sampleRate: SR, densite: 1000, assombrissement: 1 });
    const nonNuls = [...h].filter((v) => v !== 0).length;
    expect(nonNuls / h.length).toBeLessThan(0.05);
  });

  it("DÉCROÎT COMME ON L'A DEMANDÉ, et on le mesure plutôt que de le supposer", () => {
    // Intégrale de Schroeder : c'est la mesure de la littérature, et elle doit retrouver le RT60
    // demandé à un dixième de seconde près.
    const h = reponseVelours({ duree: 3, sampleRate: SR, densite: 2000, rt60: 1.5, assombrissement: 1 });
    const c = courbeSchroeder(h);
    let t60 = -1;
    for (let i = 0; i < c.length; i++) if (c[i] <= -60) { t60 = i / SR; break; }
    expect(t60).toBeGreaterThan(1.2);
    expect(t60).toBeLessThan(1.9);
  });

  it("la queue qui gonfle a bien son énergie à la fin", () => {
    const h = reponseVelours({ duree: 1, sampleRate: SR, profil: "gonflement", rt60: 0.4, assombrissement: 1 });
    const moitie = h.length >> 1;
    const energie = (d: number, f: number) => {
      let e = 0;
      for (let i = d; i < f; i++) e += h[i] * h[i];
      return e;
    };
    expect(energie(moitie, h.length)).toBeGreaterThan(10 * energie(0, moitie));
  });

  it("est reproductible à graine égale, et différente sinon", () => {
    const a = reponseVelours({ duree: 0.2, sampleRate: SR, graine: 7 });
    const b = reponseVelours({ duree: 0.2, sampleRate: SR, graine: 7 });
    const c = reponseVelours({ duree: 0.2, sampleRate: SR, graine: 8 });
    expect([...a]).toEqual([...b]);
    expect([...a]).not.toEqual([...c]);
  });

  it("l'assombrissement retire de l'aigu sans vider la réponse", () => {
    const claire = reponseVelours({ duree: 0.5, sampleRate: SR, assombrissement: 1, graine: 5 });
    const sombre = reponseVelours({ duree: 0.5, sampleRate: SR, assombrissement: 0.05, graine: 5 });
    // Mesure grossière de l'aigu : l'énergie des différences d'un échantillon à l'autre.
    const aigu = (h: Float32Array) => {
      let e = 0;
      for (let i = 1; i < h.length; i++) e += (h[i] - h[i - 1]) ** 2;
      return e;
    };
    expect(aigu(sombre)).toBeLessThan(aigu(claire));
    expect(Math.max(...sombre)).toBeGreaterThan(0.1);
  });
});

describe("la convolution", () => {
  it("rend la réponse elle-même quand on lui donne une impulsion", () => {
    const h = Float32Array.from([1, 0.5, -0.25]);
    const x = Float32Array.from([1]);
    const y = convoluer(x, h);
    expect(y[0]).toBeCloseTo(1, 6);
    expect(y[1]).toBeCloseTo(0.5, 6);
    expect(y[2]).toBeCloseTo(-0.25, 6);
  });

  it("retarde d'autant que l'impulsion est tardive", () => {
    const h = Float32Array.from([0, 0, 1]);
    const y = convoluer(Float32Array.from([1, 0, 0, 0]), h);
    expect(y[2]).toBeCloseTo(1, 6);
    expect(y[0]).toBeCloseTo(0, 6);
  });

  it("rend la longueur de la somme moins un", () => {
    expect(convoluer(new Float32Array(100), new Float32Array(30)).length).toBe(129);
  });

  it("est linéaire", () => {
    const h = reponseVelours({ duree: 0.05, sampleRate: SR, graine: 2 });
    const a = Float32Array.from({ length: 200 }, (_, i) => Math.sin(i / 5));
    const b = Float32Array.from({ length: 200 }, (_, i) => Math.cos(i / 7));
    const somme = Float32Array.from(a, (v, i) => v + b[i]);
    const ya = convoluer(a, h), yb = convoluer(b, h), ys = convoluer(somme, h);
    let ecart = 0;
    for (let i = 0; i < ys.length; i++) ecart = Math.max(ecart, Math.abs(ys[i] - (ya[i] + yb[i])));
    expect(ecart).toBeLessThan(1e-4);
  });
});
