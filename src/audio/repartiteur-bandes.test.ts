// audio/repartiteur-bandes.test.ts — Neuf bandes : chacune garde la sienne, et la somme dit sa méthode.
//
// Chaque cas porte sur la réponse impulsionnelle, dont le module à une fréquence se calcule en clair :
// c'est ce qui permet d'affirmer une platitude ou une réjection en décibels, et non « à l'oreille ».
import { describe, expect, it } from "vitest";
import { creerAleatoire } from "../core/hasard";
import {
  COUPURES_DEFAUT, NOMBRE_BANDES, coupuresUtiles, gabarits, longueurNoyau, modulesA, repartirVoie,
  type MethodeRepartition,
} from "./repartiteur-bandes";

const FE = 48000;
const N = 1 << 16;
const CENTRES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000];
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));

/** Une impulsion unité au rang donné. */
function impulsion(rang: number, n = N): Float32Array {
  const x = new Float32Array(n);
  x[rang] = 1;
  return x;
}

/** Le module de la transformée de Fourier de `h` à la fréquence f, calculé directement. */
function moduleA(h: Float32Array, f: number): number {
  let re = 0, im = 0;
  const w = (2 * Math.PI * f) / FE;
  for (let i = 0; i < h.length; i++) {
    if (h[i] === 0) continue;
    re += h[i] * Math.cos(w * i);
    im -= h[i] * Math.sin(w * i);
  }
  return Math.hypot(re, im);
}

/** Des fréquences au douzième d'octave, de 20 Hz à 20 kHz. */
const GRILLE: number[] = [];
for (let f = 20; f <= 20000; f *= 2 ** (1 / 12)) GRILLE.push(f);

const bandesDe = (x: Float32Array, methode: MethodeRepartition, coupures: readonly number[] = COUPURES_DEFAUT) =>
  repartirVoie(x, { methode, coupures, frequence: FE }).bandes;

const somme = (bandes: Float32Array[]) => {
  const s = new Float32Array(bandes[0].length);
  for (const b of bandes) for (let i = 0; i < s.length; i++) s[i] += b[i];
  return s;
};

describe("les coupures", () => {
  it("sont rangées, et ramenées entre 10 Hz et 45 % de la fréquence d'échantillonnage", () => {
    expect(coupuresUtiles([5657, 45, 707, 89], FE)).toEqual([45, 89, 707, 5657]);
    expect(coupuresUtiles([3, 30000, Number.NaN], FE)).toEqual([10, 10, 21600]);
  });

  it("par défaut, tombent à mi-chemin en octaves entre les centres de l'égaliseur à neuf bandes", () => {
    COUPURES_DEFAUT.forEach((c, k) => expect(c).toBeCloseTo(Math.sqrt(CENTRES[k] * CENTRES[k + 1]), -1));
  });

  it("le noyau de la FFT couvre au moins vingt-quatre périodes de la coupure la plus basse", () => {
    expect(longueurNoyau(45, FE)).toBe(32768);
    expect(longueurNoyau(20, FE)).toBe(65536);
    expect(longueurNoyau(10, 96000)).toBe(1 << 17);
  });
});

describe.each(["linkwitz-riley", "fft"] as const)("la méthode %s", (methode) => {
  // La phase nulle s'étend avant l'instant : l'impulsion est posée au milieu pour garder les deux côtés.
  const bandes = bandesDe(impulsion(N / 2), methode);

  it("rend neuf bandes de la longueur de l'entrée", () => {
    expect(bandes).toHaveLength(NOMBRE_BANDES);
    for (const b of bandes) expect(b.length).toBe(N);
  });

  it("chaque centre de l'égaliseur sort par sa bande à un décibel près, l'octave voisine sous −24 dB", () => {
    CENTRES.forEach((c, k) => {
      const gains = bandes.map((b) => db(moduleA(b, c)));
      expect(gains[k], `bande ${k + 1} à ${c} Hz`).toBeGreaterThan(-1.2);
      expect(Math.max(...gains), `${c} Hz sort par la bande ${k + 1}`).toBe(gains[k]);
      for (const voisine of [k - 1, k + 1].filter((v) => v >= 0 && v < NOMBRE_BANDES)) {
        expect(gains[voisine], `bande ${voisine + 1} à ${c} Hz`).toBeLessThan(-24);
      }
    });
  });

  it("la somme des neuf a un module plat de 20 Hz à 20 kHz, à un centième de décibel près", () => {
    const s = somme(bandes);
    for (const f of GRILLE) expect(Math.abs(db(moduleA(s, f))), `${f.toFixed(0)} Hz`).toBeLessThan(0.01);
  });

  it("chaque coupure agit, et ne touche que les deux bandes qu'elle sépare", () => {
    const deplacees: number[] = [...COUPURES_DEFAUT];
    deplacees[4] = 900;
    const autres = bandesDe(impulsion(N / 2), methode, deplacees);
    const ecart = (a: Float32Array, b: Float32Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
    expect(ecart(bandes[4], autres[4])).toBeGreaterThan(1e-3);
    expect(ecart(bandes[5], autres[5])).toBeGreaterThan(1e-3);
    // Une bande grave ne passe par la coupure 5 que par son passe-tout, qui ne change pas son module.
    expect(Math.abs(db(moduleA(bandes[0], 32)) - db(moduleA(autres[0], 32)))).toBeLessThan(1e-3);
    // En FFT, une bande éloignée ne change pas du tout ; elle ne dépend que de son gabarit.
    if (methode === "fft") expect(ecart(bandes[8], autres[8])).toBeLessThan(1e-6);
  });

  it("des coupures données dans le désordre rendent les mêmes bandes que rangées", () => {
    const melangees = [...COUPURES_DEFAUT].reverse();
    const autres = bandesDe(impulsion(N / 2), methode, melangees);
    autres.forEach((b, k) => expect(Array.from(b)).toEqual(Array.from(bandes[k])));
  });
});

describe("deux coupures égales", () => {
  it.each(["linkwitz-riley", "fft"] as const)("laissent entre elles une bande presque vide (%s)", (methode) => {
    const x = new Float32Array(N);
    const hasard = creerAleatoire(3);
    for (let i = 0; i < x.length; i++) x[i] = hasard() - 0.5;
    const egales: number[] = [...COUPURES_DEFAUT];
    egales[4] = egales[3];
    const b = bandesDe(x, methode, egales);
    const energie = (v: Float32Array) => v.reduce((s, e) => s + e * e, 0);
    // La bande 5, entre deux coupures à 354 Hz, contre la bande 4 qui couvre de 177 à 354 Hz.
    expect(energie(b[4]) / energie(b[3])).toBeLessThan(0.1);
  });
});

describe("ce qui sépare les deux méthodes", () => {
  it("en FFT, la somme redonne l'entrée à l'arrondi près", () => {
    const x = new Float32Array(20000);
    const hasard = creerAleatoire(12345);
    for (let i = 0; i < x.length; i++) x[i] = hasard() - 0.5;
    const s = somme(bandesDe(x, "fft"));
    let ecart = 0;
    for (let i = 0; i < x.length; i++) ecart = Math.max(ecart, Math.abs(s[i] - x[i]));
    expect(ecart).toBeLessThan(1e-5);
  });

  it("en Linkwitz-Riley, la somme a la phase tournée : son module est plat, sa forme d'onde n'est pas l'entrée", () => {
    const s = somme(bandesDe(impulsion(0), "linkwitz-riley"));
    // L'impulsion d'entrée vaut un au rang zéro ; la somme l'étale dans le temps.
    expect(s[0]).toBeLessThan(0.9);
  });

  it("en FFT, chaque bande est symétrique autour de l'instant qui l'excite", () => {
    const bandes = bandesDe(impulsion(N / 2), "fft");
    for (const b of bandes) {
      let pic = 0, asym = 0;
      for (let d = 1; d < 8000; d++) {
        pic = Math.max(pic, Math.abs(b[N / 2 + d]));
        asym = Math.max(asym, Math.abs(b[N / 2 + d] - b[N / 2 - d]));
      }
      expect(asym).toBeLessThan(1e-6 + pic * 1e-5);
    }
  });

  it("le module de chaque bande est le même dans les deux méthodes : le gabarit du Linkwitz-Riley 8", () => {
    const lr = bandesDe(impulsion(N / 2), "linkwitz-riley");
    const ff = bandesDe(impulsion(N / 2), "fft");
    for (const f of GRILLE) {
      const attendus = modulesA(f, COUPURES_DEFAUT, FE);
      for (let k = 0; k < NOMBRE_BANDES; k++) {
        const a = moduleA(lr[k], f), b = moduleA(ff[k], f);
        expect(Math.abs(a - attendus[k]), `Linkwitz-Riley, bande ${k + 1} à ${f.toFixed(0)} Hz`).toBeLessThan(1e-4);
        expect(Math.abs(b - attendus[k]), `FFT, bande ${k + 1} à ${f.toFixed(0)} Hz`).toBeLessThan(1e-4);
      }
    }
  });

  it("les gabarits échantillonnés sont ceux de la fonction en clair, et somment à un", () => {
    const g = gabarits(COUPURES_DEFAUT, FE, 4096);
    for (const m of [0, 1, 3, 17, 200, 2047, 2048]) {
      const attendus = modulesA((m * FE) / 4096, COUPURES_DEFAUT, FE);
      attendus.forEach((v, k) => expect(g[k][m]).toBeCloseTo(v, 12));
      expect(g.reduce((s, b) => s + b[m], 0)).toBeCloseTo(1, 12);
    }
  });
});
