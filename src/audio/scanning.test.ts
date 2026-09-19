// audio/scanning.test.ts — La propriété qui fait tout le procédé : hauteur et timbre séparés.
//
// Le scanning n'a d'intérêt que si la mécanique ne touche pas à la justesse et si la
// vitesse de lecture ne touche pas au timbre. Ces deux indépendances sont donc ce qu'il
// faut vérifier d'abord, et elles se mesurent : la hauteur doit rester celle qu'on demande
// quelles que soient tension et amortissement, et la forme de la chaîne doit avoir changé
// entre le début et la fin, sans quoi on n'aurait qu'une table d'onde ordinaire.
import { describe, expect, it } from "vitest";
import { avancerChaine, exciter, synthetiserScanning } from "./scanning";
import { fft } from "./fft";

const FS = 44100;

function hasardFixe(graine: number) {
  let x = graine >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

const jouer = (options: Partial<Parameters<typeof synthetiserScanning>[0]> = {}) =>
  synthetiserScanning({
    frequence: 220, duree: 1.5, frequenceEch: FS, masses: 64, cadence: 800,
    tension: 0.5, rappel: 0.3, amortissement: 0.1,
    excitation: "pincee", force: 1, ...options,
  }, hasardFixe(1));

function spectre(signal: Float32Array, depart: number) {
  const n = 16384;
  const re = new Float64Array(n), im = new Float64Array(n);
  const debut = Math.floor(depart * FS);
  for (let i = 0; i < n && debut + i < signal.length; i++) {
    re[i] = signal[debut + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  fft(re, im, false);
  const mag: number[] = [];
  for (let k = 0; k < n / 2; k++) mag.push(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
  return { mag, resolution: FS / n };
}

/**
 * Autocorrélation normalisée à un décalage donné, entre 0 et 1.
 *
 * On ne cherche pas ici à DÉTECTER la hauteur — un détecteur se fait piéger par ce signal,
 * dont le contenu aigu donne une corrélation large aux petits décalages, et le pic global
 * tombait sur 1 kHz pour un 110 Hz parfaitement périodique. On vérifie directement ce qui
 * nous intéresse : le signal se répète-t-il à la période demandée ?
 */
function correlation(signal: Float32Array, depart: number, lag: number): number {
  const debut = Math.floor(depart * FS);
  const termes = 6000;
  let produit = 0, energie = 0;
  for (let i = 0; i < termes; i++) {
    produit += signal[debut + i] * signal[debut + i + lag];
    energie += signal[debut + i] * signal[debut + i];
  }
  return produit / Math.max(1e-12, energie);
}

/** Une période du signal, normalisée, pour comparer des FORMES et non des niveaux. */
function forme(signal: Float32Array, depart: number, periode: number): number[] {
  const debut = Math.floor(depart * FS);
  const p: number[] = [];
  for (let i = 0; i < periode; i++) p.push(signal[debut + i]);
  const norme = Math.sqrt(p.reduce((s, x) => s + x * x, 0));
  return p.map((x) => x / Math.max(1e-12, norme));
}

const produitScalaire = (a: number[], b: number[]): number =>
  a.reduce((s, x, i) => s + x * b[i], 0);

function centroide(signal: Float32Array, depart: number): number {
  const { mag, resolution } = spectre(signal, depart);
  let s = 0, p = 0;
  for (let k = 1; k < mag.length; k++) { s += mag[k] * k * resolution; p += mag[k]; }
  return s / Math.max(1e-9, p);
}

describe("mécanique de la chaîne", () => {
  it("ne bouge pas si on ne l'excite pas", () => {
    const etat = { position: new Float64Array(32), vitesse: new Float64Array(32) };
    for (let i = 0; i < 100; i++) avancerChaine(etat, 0.5, 0.3, 0.1);
    expect([...etat.position].every((x) => x === 0)).toBe(true);
  });

  it("donne des formes différentes selon l'excitation", () => {
    const pincee = exciter(32, "pincee", 1, hasardFixe(1));
    const frappee = exciter(32, "frappee", 1, hasardFixe(1));
    // Pincée : un déplacement sans vitesse. Frappée : une vitesse sans déplacement.
    expect([...pincee.position].some((x) => x !== 0)).toBe(true);
    expect([...pincee.vitesse].every((x) => x === 0)).toBe(true);
    expect([...frappee.position].every((x) => x === 0)).toBe(true);
    expect([...frappee.vitesse].some((x) => x !== 0)).toBe(true);
  });

  it("propage l'onde le long de la chaîne", () => {
    // Une bosse au centre doit se retrouver ailleurs après quelques pas.
    const etat = exciter(64, "frappee", 1, hasardFixe(1));
    const bord = () => Math.abs(etat.position[2]) + Math.abs(etat.position[61]);
    const avant = bord();
    for (let i = 0; i < 400; i++) avancerChaine(etat, 1, 0, 0);
    expect(bord()).toBeGreaterThan(avant);
  });

  it("meurt quand l'amortissement est maximal", () => {
    const etat = exciter(64, "pincee", 1, hasardFixe(1));
    for (let i = 0; i < 4000; i++) avancerChaine(etat, 0.5, 0.5, 1);
    const somme = [...etat.position].reduce((a, b) => a + Math.abs(b), 0);
    expect(somme).toBeLessThan(0.01);
  });

  it("garde des valeurs finies même à tension et force maximales", () => {
    const etat = exciter(64, "bruit", 1, hasardFixe(3));
    for (let i = 0; i < 20000; i++) avancerChaine(etat, 1, 1, 0);
    expect([...etat.position].every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe("hauteur et timbre séparés", () => {
  it("se répète exactement à la période demandée, quelle que soit la mécanique", () => {
    for (const f of [110, 220, 440]) {
      const periode = Math.round(FS / f);
      for (const tension of [0.2, 0.8]) {
        for (const amortissement of [0, 0.5]) {
          const { signal } = jouer({ frequence: f, tension, amortissement });
          const c = correlation(signal, 0.2, periode);
          expect(c, `${f} Hz t${tension} a${amortissement}`).toBeGreaterThan(0.4);
          // Et la période est bien celle-là, non une voisine : le creux à mi-période.
          const creux = correlation(signal, 0.2, Math.round(periode / 2));
          expect(c, `${f} Hz demi-période`).toBeGreaterThan(creux);
        }
      }
    }
  });

  it("change la FORME de l'onde pendant que la période reste la même", () => {
    // C'est la propriété qui définit le procédé, et elle se mesure sur la forme et non sur
    // le centre de gravité du spectre : celui-ci bouge peu, parce que la table garde ses
    // soixante-quatre points quoi qu'il arrive.
    const f = 220, periode = Math.round(FS / f);
    const { signal } = jouer({ duree: 3, amortissement: 0, rappel: 0.2, tension: 0.6, frequence: f });
    const debut = forme(signal, 0.2, periode);
    // La chaîne est un système de modes propres : sa forme REVIENT régulièrement près de
    // celle du départ, si bien qu'un instant choisi au hasard peut la retrouver presque
    // identique — mesuré, à 2,2 s elle ressemblait au départ à 99 %. On regarde donc
    // l'évolution sur une dizaine d'instants, et l'on exige qu'elle s'en écarte vraiment.
    const ressemblances = [0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2]
      .map((t) => Math.abs(produitScalaire(debut, forme(signal, t, periode))));
    expect(Math.min(...ressemblances)).toBeLessThan(0.8);
    // Et la période, elle, n'a bougé à aucun de ces instants.
    for (const t of [0.4, 1.2, 2.2]) {
      expect(correlation(signal, t, periode), `période à ${t} s`).toBeGreaterThan(0.4);
    }
  });

  it("change la forme de la chaîne entre le début et la fin", () => {
    const depart = exciter(64, "pincee", 1, hasardFixe(1)).position;
    const { formeFinale } = jouer({ duree: 1, amortissement: 0 });
    let ecart = 0;
    for (let i = 0; i < 64; i++) ecart += Math.abs(formeFinale[i] - depart[i]);
    expect(ecart).toBeGreaterThan(0.1);
  });

  it("garde la même forme quand la mécanique est figée", () => {
    // Tension nulle, rappel nul, amortissement nul : rien ne bouge, la table est figée, et
    // l'on retrouve un oscillateur à table d'onde ordinaire. C'est le cas témoin.
    const f = 220, periode = Math.round(FS / f);
    const { signal } = jouer({ duree: 2, tension: 0, rappel: 0, amortissement: 0, frequence: f });
    const debut = forme(signal, 0.2, periode), fin = forme(signal, 1.5, periode);
    expect(Math.abs(produitScalaire(debut, fin))).toBeGreaterThan(0.99);
  });
});

describe("robustesse", () => {
  it("rend la longueur demandée, sans saturer", () => {
    const { signal } = jouer({ duree: 0.5 });
    expect(signal.length).toBe(Math.ceil(0.5 * FS));
    let crete = 0;
    for (const x of signal) crete = Math.max(crete, Math.abs(x));
    expect(crete).toBeLessThanOrEqual(0.9001);
  });

  it("avance la mécanique à la cadence demandée", () => {
    expect(jouer({ duree: 1, cadence: 800 }).pas).toBeGreaterThan(700);
    expect(jouer({ duree: 1, cadence: 800 }).pas).toBeLessThan(900);
    expect(jouer({ duree: 1, cadence: 100 }).pas).toBeLessThan(150);
  });

  it("borne le nombre de masses plutôt que d'allouer n'importe quoi", () => {
    expect(jouer({ masses: 1, duree: 0.2 }).formeFinale.length).toBe(4);
    expect(jouer({ masses: 100000, duree: 0.2 }).formeFinale.length).toBe(1024);
  });

  it("rejoue le même son à graine égale", () => {
    expect(jouer({ excitation: "bruit", duree: 0.3 }).signal)
      .toEqual(jouer({ excitation: "bruit", duree: 0.3 }).signal);
  });

  it("tient les quatre excitations", () => {
    for (const excitation of ["pincee", "frappee", "bruit", "deux-bosses"] as const) {
      const { signal } = jouer({ excitation, duree: 0.3 });
      for (const x of signal) expect(Number.isFinite(x), excitation).toBe(true);
    }
  });
});
