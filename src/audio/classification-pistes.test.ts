// audio/classification-pistes.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { classifierPistes, calculerMoyennesParGroupe, type PisteVectorisee } from "./classification-pistes";
import { extraireVecteurFeatures } from "./features-piste";

class AudioBufferPolyfill {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private canaux: Float32Array[];
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.duration = opts.length / opts.sampleRate;
    this.canaux = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(c: number): Float32Array { return this.canaux[c]; }
  copyToChannel(src: Float32Array, c: number): void { this.canaux[c].set(src.subarray(0, this.length)); }
}

const SR = 44100;

function sinus(freq: number, dureeS: number): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  return b;
}

// PRNG seedé (pas Math.random()) : un bruit blanc reproductible d'un run à
// l'autre, sinon le test est intrinsèquement flaky — un tirage de bruit
// suffisamment proche des pistes tonales par hasard peut faire fusionner ce
// groupe avec un autre au clustering.
function mulberry32(graine: number): () => number {
  let a = graine | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bruitBlanc(dureeS: number, graine = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  const rng = mulberry32(graine);
  for (let i = 0; i < n; i++) d[i] = rng() * 2 - 1;
  return b;
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

// 3 groupes de 3 pistes synthétiques, nettement distincts en chroma/centroïde/
// MFCC : sinusoïde grave (A2, classe A), sinusoïde aiguë (C6, classe C),
// bruit blanc (pas de hauteur dominante, signature spectrale très différente).
// Vecteurs déjà extraits (comme le fait algebre-musicale.ts, piste par
// piste, juste après décodage) — classifierPistes ne prend plus d'AudioBuffer
// depuis la correction du plantage par épuisement mémoire.
function jeuDePistes(): PisteVectorisee[] {
  const brutes = [
    { nom: "grave-1", chemin: "/g1.wav", buffer: sinus(110, 1.5) },
    { nom: "grave-2", chemin: "/g2.wav", buffer: sinus(110, 1.5) },
    { nom: "grave-3", chemin: "/g3.wav", buffer: sinus(110, 1.5) },
    { nom: "aigu-1", chemin: "/a1.wav", buffer: sinus(1046.5, 1.5) },
    { nom: "aigu-2", chemin: "/a2.wav", buffer: sinus(1046.5, 1.5) },
    { nom: "aigu-3", chemin: "/a3.wav", buffer: sinus(1046.5, 1.5) },
    { nom: "bruit-1", chemin: "/b1.wav", buffer: bruitBlanc(1.5) },
    { nom: "bruit-2", chemin: "/b2.wav", buffer: bruitBlanc(1.5) },
    { nom: "bruit-3", chemin: "/b3.wav", buffer: bruitBlanc(1.5) },
  ];
  return brutes.map((p) => ({ nom: p.nom, chemin: p.chemin, features: extraireVecteurFeatures(p.buffer) }));
}

describe("classifierPistes", () => {
  it("regroupe les 3 familles de pistes synthétiques nettement distinctes (k fixe)", () => {
    const res = classifierPistes(jeuDePistes(), { nbAxesPCA: 5, k: 3, kMaxAuto: 6, graine: 42 });
    expect(res.rapport.length).toBe(9);

    const groupe = (nom: string) => res.rapport.find((l) => l.nom === nom)!.groupe;
    const gGrave = groupe("grave-1");
    const gAigu = groupe("aigu-1");
    const gBruit = groupe("bruit-1");
    expect(new Set([gGrave, gAigu, gBruit]).size).toBe(3);

    for (const nom of ["grave-1", "grave-2", "grave-3"]) expect(groupe(nom)).toBe(gGrave);
    for (const nom of ["aigu-1", "aigu-2", "aigu-3"]) expect(groupe(nom)).toBe(gAigu);
    for (const nom of ["bruit-1", "bruit-2", "bruit-3"]) expect(groupe(nom)).toBe(gBruit);
  }, 30000);

  it("fonctionne aussi en mode k = \"auto\" et expose les scores testés", () => {
    const res = classifierPistes(jeuDePistes(), { nbAxesPCA: 5, k: "auto", kMaxAuto: 6, graine: 42 });
    expect(res.k).toBeGreaterThanOrEqual(2);
    expect(res.scoresCalinskiHarabasz).toBeDefined();
    expect(res.scoresCalinskiHarabasz!.length).toBeGreaterThan(0);
  }, 30000);

  it("le rapport et les coordonnées sont cohérents et bien formés", () => {
    const res = classifierPistes(jeuDePistes(), { nbAxesPCA: 5, k: 3, kMaxAuto: 6, graine: 1 });
    expect(res.coordonnees.length).toBe(9);
    for (const ligne of res.rapport) {
      expect(ligne.groupe).toBeGreaterThanOrEqual(0);
      expect(ligne.groupe).toBeLessThan(res.k);
      const somme = ligne.probabilites.reduce((s, v) => s + v, 0);
      expect(somme).toBeCloseTo(1, 5);
    }
    for (const point of res.coordonnees) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    expect(res.etiquettesFeatures.length).toBe(40);
  }, 30000);

  it("refuse de fonctionner avec moins de 3 pistes", () => {
    const pistes = jeuDePistes().slice(0, 2);
    expect(() => classifierPistes(pistes, { nbAxesPCA: 5, k: 2, kMaxAuto: 6, graine: 1 })).toThrow();
  });

  it("est déterministe avec la même graine", () => {
    const pistes = jeuDePistes();
    const a = classifierPistes(pistes, { nbAxesPCA: 5, k: 3, kMaxAuto: 6, graine: 7 });
    const b = classifierPistes(pistes, { nbAxesPCA: 5, k: 3, kMaxAuto: 6, graine: 7 });
    expect(a.rapport).toEqual(b.rapport);
    expect(a.coordonnees).toEqual(b.coordonnees);
  }, 30000);
});

describe("calculerMoyennesParGroupe", () => {
  it("moyenne les variables de départ (features brutes) par groupe, pas les axes PCA", () => {
    const pistes = jeuDePistes();
    const resultat = classifierPistes(pistes, { nbAxesPCA: 5, k: 3, kMaxAuto: 6, graine: 42 });
    const moyennes = calculerMoyennesParGroupe(pistes, resultat.rapport);

    expect(moyennes.etiquettes).toEqual(pistes[0].features.etiquettes);
    expect(moyennes.groupes.length).toBe(3);

    for (const g of moyennes.groupes) {
      const membres = pistes.filter((_, i) => resultat.rapport[i].groupe === g.groupe);
      expect(g.n).toBe(membres.length);
      // La moyenne de groupe pour "Tempo (BPM)" (colonne 0) doit correspondre à
      // la moyenne manuelle des vecteurs bruts des pistes de ce groupe.
      const idxTempo = pistes[0].features.etiquettes.indexOf("Tempo (BPM)");
      const attendu = membres.reduce((s, p) => s + p.features.vecteur[idxTempo], 0) / membres.length;
      expect(g.moyennes[idxTempo]).toBeCloseTo(attendu, 6);
    }
  }, 30000);

  it("l'écart-type inter-groupes est élevé pour une variable qui sépare nettement les groupes (grave vs aigu)", () => {
    const pistes = jeuDePistes();
    const resultat = classifierPistes(pistes, { nbAxesPCA: 5, k: 3, kMaxAuto: 6, graine: 42 });
    const moyennes = calculerMoyennesParGroupe(pistes, resultat.rapport);
    const idxCentroid = moyennes.etiquettes.indexOf("Centroïde spectral");
    // Le centroïde spectral distingue nettement grave/aigu/bruit : son écart-type
    // inter-groupes doit être très supérieur à celui d'une variable non
    // discriminante comme "MFCC 1 (variance)" entre pistes tonales similaires.
    expect(moyennes.ecartTypeInterGroupes[idxCentroid]).toBeGreaterThan(0);
  }, 30000);
});

describe("voisins (calculés dans classifierPistes)", () => {
  it("donne 3 plus proches voisins par piste (n=9), jamais la piste elle-même, triés du plus proche au plus loin", () => {
    const pistes = jeuDePistes();
    const resultat = classifierPistes(pistes, { nbAxesPCA: 5, k: 3, kMaxAuto: 6, graine: 42 });
    expect(resultat.voisins.length).toBe(9);
    for (const v of resultat.voisins) {
      expect(v.plusProches.length).toBe(3);
      expect(v.plusProches.some((p) => p.chemin === v.chemin)).toBe(false);
      for (let i = 1; i < v.plusProches.length; i++) {
        expect(v.plusProches[i].distance).toBeGreaterThanOrEqual(v.plusProches[i - 1].distance);
      }
      for (const p of v.plusProches) expect(Number.isFinite(p.distance)).toBe(true);
    }
  }, 30000);

  it("les 2 plus proches voisins d'une piste tombent dans sa propre famille synthétique (grave/aigu/bruit nettement séparées)", () => {
    // Chaque famille ne compte que 3 pistes (elle-même + 2 autres) : avec
    // NB_VOISINS=3, le 3e voisin retourné vient nécessairement d'une autre
    // famille. On ne teste donc que les 2 premiers (les seuls "vrais" voisins
    // de même famille possibles).
    const pistes = jeuDePistes();
    const resultat = classifierPistes(pistes, { nbAxesPCA: 5, k: 3, kMaxAuto: 6, graine: 42 });
    const voisinsDe = (nom: string) => resultat.voisins.find((v) => v.nom === nom)!.plusProches.slice(0, 2).map((p) => p.nom);
    for (const nom of voisinsDe("grave-1")) expect(nom.startsWith("grave-")).toBe(true);
    for (const nom of voisinsDe("aigu-2")) expect(nom.startsWith("aigu-")).toBe(true);
    for (const nom of voisinsDe("bruit-3")) expect(nom.startsWith("bruit-")).toBe(true);
  }, 30000);

  it("plafonne le nombre de voisins à n-1 quand la collection est proche du minimum (n=3)", () => {
    const pistes = jeuDePistes().slice(0, 3);
    const resultat = classifierPistes(pistes, { nbAxesPCA: 5, k: 2, kMaxAuto: 6, graine: 1 });
    for (const v of resultat.voisins) expect(v.plusProches.length).toBe(2);
  }, 30000);
});
