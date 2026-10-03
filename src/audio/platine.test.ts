// audio/platine.test.ts — Les défauts sont-ils ceux d'une platine, et à sa vitesse ?
//
// CE QUE CE FICHIER DOIT PROUVER. Un ronflement qui serait du souffle, une ondulation qui irait à
// une vitesse quelconque, des clics qui seraient du bruit : les trois sonneraient comme un vieux
// disque, et aucun ne serait une platine. Ce qui fait la platine est que TOUT y est accroché à la
// rotation, et que chaque défaut garde sa nature, un grondement en bas, une impulsion brève, un fond
// continu. Les cas mesurent ces trois choses sur le son rendu.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { frequenceDeRotation, platine, ronflement, surfaceEtClics } from "./platine";

const SR = 8000;

const BASE = {
  vitesse: 33 + 1 / 3, ronflement: -40, surface: -60, clics: 0, excentricite: 0, graine: 4,
};

/** Un son porteur, pour que l'ondulation ait une hauteur où se lire. */
function porteuse(secondes: number, hz = 400): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * hz * (i / SR)) * 0.5;
  return b;
}

/** L'énergie d'un signal dans une bande, par somme de Goertzel. */
function energieBande(x: Float32Array, bas: number, haut: number): number {
  let total = 0;
  for (let k = 0; k < 16; k++) {
    const hz = bas + ((k + 0.5) * (haut - bas)) / 16;
    const w = (2 * Math.PI * hz) / SR;
    const c = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
    total += Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2);
  }
  return total / 16;
}

describe("la vitesse de rotation", () => {
  it("DONNE UN TOUR EN 1,8 SECONDE À TRENTE-TROIS TOURS, et le cycle suit la vitesse", () => {
    expect(1 / frequenceDeRotation(33 + 1 / 3)).toBeCloseTo(1.8, 6);
    expect(1 / frequenceDeRotation(45)).toBeCloseTo(1.333, 3);
    expect(1 / frequenceDeRotation(78)).toBeCloseTo(0.769, 3);
  });
});

describe("le ronflement", () => {
  it("EST UN GRONDEMENT ET NON UN SOUFFLE : son énergie tient sous cent hertz", () => {
    // LA PREUVE QUI COMPTE. Un bruit à peine filtré sonnerait comme un vieux disque et serait faux :
    // c'est la pente du filtre qui sépare le grondement du souffle, et elle ne s'entend pas.
    const x = ronflement(Math.round(4 * SR), SR, { vitesse: BASE.vitesse, niveau: -20, graine: 3 });
    const grave = energieBande(x, 20, 100);
    const medium = energieBande(x, 500, 2000);
    expect(grave).toBeGreaterThan(medium * 1000);
  });

  it("ET SON NIVEAU SUIT LE RÉGLAGE EN DÉCIBELS", () => {
    const rms = (x: Float32Array) => {
      let s = 0;
      for (const v of x) s += v * v;
      return Math.sqrt(s / x.length);
    };
    const fort = ronflement(Math.round(2 * SR), SR, { vitesse: BASE.vitesse, niveau: -30, graine: 3 });
    const faible = ronflement(Math.round(2 * SR), SR, { vitesse: BASE.vitesse, niveau: -50, graine: 3 });
    expect(rms(fort) / rms(faible)).toBeCloseTo(10, 0);
  });
});

describe("le bruit de surface et les clics", () => {
  it("SONT DE NATURES DIFFÉRENTES : le fond est continu, les clics sont des impulsions", () => {
    // LE CAS QUI SÉPARE LES DEUX. Tirer les clics dans le même bruit que le fond rendrait un souffle
    // un peu plus fort, et l'on perdrait le craquement. Le facteur de crête le dit : un fond
    // continu le garde bas, une impulsion le fait bondir.
    const n = Math.round(4 * SR);
    const crete = (x: Float32Array) => {
      let s = 0;
      let m = 0;
      for (const v of x) { s += v * v; m = Math.max(m, Math.abs(v)); }
      return m / Math.sqrt(s / x.length);
    };
    const fond = surfaceEtClics(n, SR, { surface: -40, clics: 0, graine: 5 });
    const avecClics = surfaceEtClics(n, SR, { surface: -40, clics: 4, graine: 5 });
    expect(crete(fond)).toBeLessThan(6);
    expect(crete(avecClics)).toBeGreaterThan(crete(fond) * 3);
  });

  it("ET LE NOMBRE DE CLICS SUIT LE RÉGLAGE", () => {
    const n = Math.round(10 * SR);
    // LE COMPTEUR GROUPE CE QUI EST PROCHE, et ce n'est pas une facilité : un clic est une
    // impulsion AMORTIE, donc une poignée de lobes qui repassent le seuil. Sans le groupement, la
    // mesure en trouvait trente-sept pour vingt, chaque craquement étant compté deux fois.
    const compter = (x: Float32Array) => {
      const seuil = 0.2;
      const ecart = Math.round(0.005 * SR);
      let combien = 0;
      let dernier = -ecart * 2;
      for (let i = 0; i < x.length; i++) {
        if (Math.abs(x[i]) > seuil && i - dernier > ecart) { combien++; dernier = i; }
      }
      return combien;
    };
    expect(compter(surfaceEtClics(n, SR, { surface: -60, clics: 0, graine: 5 }))).toBe(0);
    const deux = compter(surfaceEtClics(n, SR, { surface: -60, clics: 2, graine: 5 }));
    expect(deux).toBeGreaterThan(10);
    expect(deux).toBeLessThan(30);
  });
});

describe("l'excentricité", () => {
  it("FAIT ONDULER LA HAUTEUR UNE FOIS PAR TOUR, et c'est la signature de la platine", () => {
    // LA PREUVE QUI RATTACHE LE DÉFAUT À LA VITESSE. Une ondulation qui irait à un rythme quelconque
    // sonnerait comme une bande fatiguée ; ici elle doit suivre la rotation, et rien d'autre.
    const mesurerLePeriode = (vitesse: number) => {
      const out = platine(porteuse(12), { ...BASE, vitesse, excentricite: 1, ronflement: -120, surface: -120 });
      const x = out.getChannelData(0);
      // La hauteur se relève par le nombre de passages à zéro sur des fenêtres de cent seize
      // millisecondes : elle monte et descend avec l'ondulation.
      const pas = Math.round(0.116 * SR);
      const combien = Math.floor(x.length / pas);
      const hauteurs = new Float32Array(combien);
      for (let k = 0; k < combien; k++) {
        let c = 0;
        for (let i = k * pas + 1; i < (k + 1) * pas; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) c++;
        hauteurs[k] = c;
      }
      let moyenne = 0;
      for (const h of hauteurs) moyenne += h / combien;
      const centre = Float32Array.from(hauteurs, (h) => h - moyenne);
      let meilleur = 0;
      let score = -Infinity;
      for (let k = 2; k < combien / 2; k++) {
        let s = 0;
        for (let i = k; i < combien; i++) s += centre[i] * centre[i - k];
        if (s > score) { score = s; meilleur = k; }
      }
      return (meilleur * pas) / SR;
    };
    // LA TOLÉRANCE EST CELLE DE LA MESURE, et non une marge de confort. La hauteur se relève par
    // fenêtres de cent seize millisecondes, donc la période ne peut tomber que sur des multiples de
    // ce pas : 1,74 et 1,856 encadrent les 1,8 attendues, et aucune fenêtre ne donnera mieux. Une
    // fenêtre plus courte rendrait une hauteur plus grossière, et le remède serait pire.
    expect(Math.abs(mesurerLePeriode(33 + 1 / 3) - 1.8)).toBeLessThan(0.12);
    expect(Math.abs(mesurerLePeriode(45) - 1.333)).toBeLessThan(0.12);
  });

  it("ET À ZÉRO LA LECTURE NE SE DÉCALE PAS", () => {
    const b = porteuse(1);
    const out = platine(b, { ...BASE, excentricite: 0, ronflement: -200, surface: -200 });
    const x = b.getChannelData(0);
    const y = out.getChannelData(0);
    for (let i = 10; i < x.length; i += 37) expect(y[i], `échantillon ${i}`).toBeCloseTo(x[i], 4);
  });
});
