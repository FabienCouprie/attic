// audio/spirale-logarithmique.test.ts — La spirale équiangle, et son auto-similarité.
//
// CE QUI EST TENU :
//   1. UN TOUR VAUT UN CHANGEMENT D'ÉCHELLE. C'est la définition de la spirale logarithmique, et
//      c'est ce qui doit se retrouver dans les fréquences : le spectre à t plus un tour est le
//      spectre à t multiplié par le rapport.
//   2. LES PARTIELS SONT À UN TOUR LES UNS DES AUTRES : leurs fréquences forment une progression
//      géométrique de raison le rapport.
//   3. LA SPIRALE NE SE REFERME POUR AUCUN RAPPORT : revenir au même angle ne ramène pas au même
//      rayon, sauf si le rapport vaut un, cas exclu par les bornes.
import { describe, expect, it } from "vitest";
import {
  NOMBRE_OR, RAPPORT_MAX, RAPPORT_MIN,
  ecartAutoSimilarite, frequenceAuTemps, partielsDeSpirale, rapportValide,
  type OptionsSpirale,
} from "./spirale-logarithmique";

const BASE: OptionsSpirale = {
  fondamentale: 110, rapport: NOMBRE_OR, partiels: 8, tours: 3, dureeSec: 6, decroissance: 1,
};

describe("le rapport par tour", () => {
  it("il est ramené dans ses bornes, et jamais à un", () => {
    expect(rapportValide(2)).toBe(2);
    expect(rapportValide(0.5)).toBe(RAPPORT_MIN);
    expect(rapportValide(99)).toBe(RAPPORT_MAX);
    expect(rapportValide(Number.NaN)).toBeCloseTo(NOMBRE_OR, 9);
    expect(rapportValide(1)).toBeGreaterThan(1);
  });

  it("le nombre d'or vaut 1,618", () => {
    expect(NOMBRE_OR).toBeCloseTo(1.6180339887, 9);
  });
});

describe("les partiels placés sur la spirale", () => {
  it("LEURS FRÉQUENCES SONT EN PROGRESSION GÉOMÉTRIQUE, de raison le rapport", () => {
    for (const rapport of [1.5, 2, NOMBRE_OR, Math.E]) {
      const p = partielsDeSpirale({ ...BASE, rapport });
      for (let k = 1; k < p.length; k++) {
        expect(p[k].frequenceDebut / p[k - 1].frequenceDebut, `rapport ${rapport}`)
          .toBeCloseTo(rapport, 9);
      }
    }
  });

  it("à rapport 2, ce sont des octaves", () => {
    const p = partielsDeSpirale({ ...BASE, rapport: 2, fondamentale: 55 });
    expect(p.map((x) => Math.round(x.frequenceDebut)).slice(0, 4)).toEqual([55, 110, 220, 440]);
  });

  it("l'amplitude décroît avec le rang, et la fondamentale vaut un", () => {
    const p = partielsDeSpirale(BASE);
    expect(p[0].amplitude).toBe(1);
    for (let k = 1; k < p.length; k++) expect(p[k].amplitude).toBeLessThan(p[k - 1].amplitude);
  });

  it("à décroissance nulle, tous les partiels pèsent autant", () => {
    for (const p of partielsDeSpirale({ ...BASE, decroissance: 0 })) expect(p.amplitude).toBe(1);
  });

  it("la fréquence d'arrivée est celle du départ multipliée par le rapport à la puissance des tours", () => {
    const p = partielsDeSpirale(BASE);
    for (const x of p) {
      expect(x.frequenceFin / x.frequenceDebut).toBeCloseTo(Math.pow(NOMBRE_OR, BASE.tours), 9);
    }
  });
});

describe("le parcours dans le temps", () => {
  it("UN TOUR VAUT UN CHANGEMENT D'ÉCHELLE : l'écart d'auto-similarité est nul", () => {
    for (const rapport of [1.5, 2, NOMBRE_OR, 3]) {
      for (const tours of [1, 3, -2]) {
        expect(ecartAutoSimilarite({ ...BASE, rapport, tours }), `${rapport} / ${tours}`)
          .toBeLessThan(1e-9);
      }
    }
  });

  it("au départ et à l'arrivée, les fréquences sont celles annoncées", () => {
    const p = partielsDeSpirale(BASE)[2];
    expect(frequenceAuTemps(p, BASE, 0)).toBeCloseTo(p.frequenceDebut, 9);
    expect(frequenceAuTemps(p, BASE, BASE.dureeSec)).toBeCloseTo(p.frequenceFin, 9);
  });

  it("descendre inverse le parcours, exactement", () => {
    const bas: OptionsSpirale = { ...BASE, tours: -BASE.tours };
    const p = partielsDeSpirale(bas)[0];
    expect(frequenceAuTemps(p, bas, bas.dureeSec) * Math.pow(NOMBRE_OR, BASE.tours))
      .toBeCloseTo(p.frequenceDebut, 6);
  });

  it("LA SPIRALE NE SE REFERME PAS : après un tour, l'angle est le même, le rayon non", () => {
    const p = partielsDeSpirale(BASE)[0];
    const unTour = BASE.dureeSec / BASE.tours;
    // Le même angle, c'est-à-dire un tour plus tard ; le rayon a ete multiplie par le rapport.
    expect(frequenceAuTemps(p, BASE, unTour) / frequenceAuTemps(p, BASE, 0)).toBeCloseTo(NOMBRE_OR, 9);
    expect(frequenceAuTemps(p, BASE, unTour)).not.toBeCloseTo(frequenceAuTemps(p, BASE, 0), 1);
  });

  it("sans tour, rien ne bouge et l'écart n'a pas de sens", () => {
    const fixe: OptionsSpirale = { ...BASE, tours: 0 };
    const p = partielsDeSpirale(fixe)[3];
    expect(frequenceAuTemps(p, fixe, fixe.dureeSec)).toBeCloseTo(p.frequenceDebut, 9);
    expect(ecartAutoSimilarite(fixe)).toBe(0);
  });

  it("un temps hors de la durée est ramené dans le parcours", () => {
    const p = partielsDeSpirale(BASE)[0];
    expect(frequenceAuTemps(p, BASE, -10)).toBeCloseTo(p.frequenceDebut, 9);
    expect(frequenceAuTemps(p, BASE, 1000)).toBeCloseTo(p.frequenceFin, 9);
  });
});
