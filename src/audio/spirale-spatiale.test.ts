// audio/spirale-spatiale.test.ts — L'azimut se referme, la distance jamais.
//
// CE QUI EST TENU :
//   1. UN TOUR RAMÈNE L'ANGLE, exactement.
//   2. UN TOUR MULTIPLIE LA DISTANCE par le rapport, exactement. C'est la spirale.
//   3. LE NIVEAU SUIT LA LOI DU CARRÉ INVERSE : doubler la distance coûte six décibels.
//   4. LE PANORAMIQUE EST EN COSINUS : la somme des carrés des deux gains reste constante, sans
//      le creux de trois décibels qu'une loi linéaire ferait au centre.
import { describe, expect, it } from "vitest";
import {
  NOMBRE_OR, RAPPORT_MAX, RAPPORT_MIN,
  ecartAzimutParTour, pointSpirale, rapportDistanceParTour, rapportValide,
  type OptionsSpatiale,
} from "./spirale-spatiale";

const BASE: OptionsSpatiale = {
  tours: 3, rapport: 2, eloigne: true, distanceDebut: 1, absorption: 0.5,
};

describe("le rapport de distance", () => {
  it("il est ramené dans ses bornes, et jamais à un", () => {
    expect(rapportValide(2)).toBe(2);
    expect(rapportValide(0.1)).toBe(RAPPORT_MIN);
    expect(rapportValide(50)).toBe(RAPPORT_MAX);
    expect(rapportValide(1)).toBeGreaterThan(1);
  });
});

describe("la trajectoire", () => {
  it("UN TOUR RAMÈNE L'ANGLE, exactement", () => {
    for (const tours of [1, 2, 5]) {
      expect(ecartAzimutParTour({ ...BASE, tours }), `${tours} tours`).toBeCloseTo(0, 9);
    }
  });

  it("UN TOUR MULTIPLIE LA DISTANCE par le rapport, exactement", () => {
    for (const rapport of [1.5, 2, NOMBRE_OR, 3]) {
      expect(rapportDistanceParTour({ ...BASE, rapport }), `rapport ${rapport}`)
        .toBeCloseTo(rapport, 9);
    }
  });

  it("se rapprocher divise la distance au lieu de la multiplier", () => {
    expect(rapportDistanceParTour({ ...BASE, eloigne: false, rapport: 2 })).toBeCloseTo(0.5, 9);
  });

  it("la distance part de sa valeur de départ et croît sans jamais revenir", () => {
    const parts = [0, 0.25, 0.5, 0.75, 1].map((p) => pointSpirale(BASE, p).distance);
    expect(parts[0]).toBeCloseTo(BASE.distanceDebut, 9);
    for (let i = 1; i < parts.length; i++) expect(parts[i]).toBeGreaterThan(parts[i - 1]);
    // Trois tours à rapport deux : huit fois plus loin.
    expect(parts[parts.length - 1]).toBeCloseTo(8, 6);
  });

  it("LE NIVEAU SUIT LA LOI DU CARRÉ INVERSE : six décibels par doublement", () => {
    const a = pointSpirale(BASE, 0);
    const b = pointSpirale(BASE, 1 / 3);                    // un tour, donc deux fois plus loin
    expect(b.distance / a.distance).toBeCloseTo(2, 9);
    expect(20 * Math.log10(b.gain / a.gain)).toBeCloseTo(-6.02, 1);
  });

  it("LE PANORAMIQUE EST EN COSINUS : la somme des carrés reste constante", () => {
    for (let i = 0; i <= 40; i++) {
      const p = pointSpirale(BASE, i / 40);
      expect(p.gaucheGain ** 2 + p.droiteGain ** 2, `part ${i / 40}`).toBeCloseTo(1, 9);
    }
  });

  it("l'azimut passe bien par les deux côtés au cours d'un tour", () => {
    const un = { ...BASE, tours: 1 };
    const gauche = pointSpirale(un, 0.75);
    const droite = pointSpirale(un, 0.25);
    expect(droite.droiteGain).toBeGreaterThan(droite.gaucheGain);
    expect(gauche.gaucheGain).toBeGreaterThan(gauche.droiteGain);
  });

  it("l'air ferme l'aigu à mesure que la distance croît, et pas du tout à absorption nulle", () => {
    const avec = [0, 0.5, 1].map((p) => pointSpirale(BASE, p).coupureHz);
    expect(avec[1]).toBeLessThan(avec[0]);
    expect(avec[2]).toBeLessThan(avec[1]);
    const sans = [0, 0.5, 1].map((p) => pointSpirale({ ...BASE, absorption: 0 }, p).coupureHz);
    expect(new Set(sans.map((v) => Math.round(v))).size).toBe(1);
  });

  it("la coupure reste dans des bornes audibles", () => {
    for (const absorption of [0, 0.5, 1]) {
      for (let i = 0; i <= 20; i++) {
        const c = pointSpirale({ ...BASE, absorption, tours: 6 }, i / 20).coupureHz;
        expect(c).toBeGreaterThanOrEqual(200);
        expect(c).toBeLessThanOrEqual(20000);
      }
    }
  });

  it("une part hors du parcours est ramenée dans ses bornes", () => {
    expect(pointSpirale(BASE, -5).distance).toBeCloseTo(BASE.distanceDebut, 9);
    expect(pointSpirale(BASE, 5).distance).toBeCloseTo(pointSpirale(BASE, 1).distance, 9);
  });

  it("sans tour, rien ne bouge", () => {
    const fixe = { ...BASE, tours: 0 };
    expect(rapportDistanceParTour(fixe)).toBe(1);
    expect(ecartAzimutParTour(fixe)).toBe(0);
    expect(pointSpirale(fixe, 1).distance).toBeCloseTo(BASE.distanceDebut, 9);
  });
});
