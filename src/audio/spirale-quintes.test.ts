// audio/spirale-quintes.test.ts — La spirale des quintes, et ce qui l'empêche de se refermer.
//
// CE QUI EST TENU :
//   1. LE COMMA. Douze quintes justes dépassent sept octaves de 23,460 cents, la valeur publiée.
//   2. L'ÉCART EST LINÉAIRE : 1,955 cent par pas, exactement, contre le tempérament égal.
//   3. LA SPIRALE NE SE REFERME JAMAIS. Aucun rang ne retombe sur une octave, jusqu'à mille pas.
//   4. ELLE FRÔLE SA FERMETURE aux rangs 12, 41 et 53, et dans cet ordre.
//   5. À 700 cents, ce n'est plus une spirale mais un cercle : le douzième pas revient au départ.
import { describe, expect, it } from "vitest";
import {
  CENTS_QUINTE_JUSTE, CENTS_QUINTE_TEMPEREE, COMMA_PYTHAGORICIEN, QUINTE_JUSTE,
  frequenceDuPas, manqueFermeture, pasDeSpirale, rangsQuiFrolent,
} from "./spirale-quintes";

describe("la quinte et son comma", () => {
  it("la quinte juste vaut 701,955 cents", () => {
    expect(QUINTE_JUSTE).toBe(1.5);
    expect(CENTS_QUINTE_JUSTE).toBeCloseTo(701.955, 3);
  });

  it("LE COMMA PYTHAGORICIEN vaut 23,460 cents", () => {
    expect(COMMA_PYTHAGORICIEN).toBeCloseTo(23.460, 3);
    // Et c'est bien le rapport 531441/524288, que la valeur en cents doit retrouver.
    expect(1200 * Math.log2(531441 / 524288)).toBeCloseTo(COMMA_PYTHAGORICIEN, 9);
  });

  it("l'écart d'une quinte juste au tempérament égal est le douzième du comma", () => {
    expect(CENTS_QUINTE_JUSTE - CENTS_QUINTE_TEMPEREE).toBeCloseTo(COMMA_PYTHAGORICIEN / 12, 9);
    expect(CENTS_QUINTE_JUSTE - CENTS_QUINTE_TEMPEREE).toBeCloseTo(1.955, 3);
  });
});

describe("les pas de la spirale", () => {
  it("le premier pas est la tonique, le deuxième la quinte", () => {
    const p = pasDeSpirale(1);
    expect(p).toHaveLength(2);
    expect(p[0].centsReplies).toBe(0);
    expect(p[0].degreEgal).toBe(0);
    expect(p[1].degreEgal).toBe(7);
    expect(p[1].ecartCents).toBeCloseTo(1.955, 3);
  });

  it("L'ÉCART AU TEMPÉRAMENT ÉGAL CROÎT DE 1,955 CENT PAR PAS, exactement", () => {
    // Tant que le repliement ne change pas de degré de référence, l'écart est k fois 1,955.
    for (const p of pasDeSpirale(11)) {
      expect(p.ecartCents, `rang ${p.rang}`).toBeCloseTo(p.rang * 1.955, 2);
    }
  });

  it("les douze premiers pas parcourent les douze degrés, une fois chacun", () => {
    const degres = pasDeSpirale(11).map((p) => p.degreEgal);
    expect(new Set(degres).size).toBe(12);
    // L'ordre est celui du cycle des quintes : do, sol, ré, la, mi, si, fa#…
    expect(degres.slice(0, 7)).toEqual([0, 7, 2, 9, 4, 11, 6]);
  });

  it("le treizième pas revient au degré de départ, mais pas à la même hauteur", () => {
    const p = pasDeSpirale(12);
    expect(p[12].degreEgal).toBe(0);
    expect(p[12].ecartCents).toBeCloseTo(COMMA_PYTHAGORICIEN, 3);
    expect(p[12].centsReplies).not.toBeCloseTo(p[0].centsReplies, 2);
  });

  it("descendre donne les quartes, et l'écart change de signe", () => {
    const p = pasDeSpirale(2, CENTS_QUINTE_JUSTE, -1);
    expect(p[1].degreEgal).toBe(5);
    expect(p[1].ecartCents).toBeCloseTo(-1.955, 2);
    expect(p[2].degreEgal).toBe(10);
  });

  it("toutes les hauteurs repliées restent dans une octave", () => {
    for (const p of pasDeSpirale(120)) {
      expect(p.centsReplies).toBeGreaterThanOrEqual(0);
      expect(p.centsReplies).toBeLessThan(1200);
    }
  });
});

describe("la fermeture, qui ne vient jamais", () => {
  it("LA SPIRALE NE SE REFERME À AUCUN RANG, jusqu'à mille pas", () => {
    for (let k = 1; k <= 1000; k++) {
      expect(Math.abs(manqueFermeture(k)), `rang ${k}`).toBeGreaterThan(0.01);
    }
  });

  it("ELLE FRÔLE SA FERMETURE AUX RANGS 12, 41 ET 53, dans cet ordre", () => {
    const rangs = rangsQuiFrolent(60).map((r) => r.rang);
    expect(rangs).toContain(12);
    expect(rangs).toContain(41);
    expect(rangs).toContain(53);
    expect(rangs.indexOf(12)).toBeLessThan(rangs.indexOf(41));
    expect(rangs.indexOf(41)).toBeLessThan(rangs.indexOf(53));
  });

  it("le rang 53 manque sa fermeture de moins de quatre cents, le rang 12 de vingt-trois", () => {
    expect(Math.abs(manqueFermeture(12))).toBeCloseTo(23.460, 2);
    expect(Math.abs(manqueFermeture(53))).toBeLessThan(4);
    expect(Math.abs(manqueFermeture(53))).toBeGreaterThan(3);
  });

  it("À 700 CENTS CE N'EST PLUS UNE SPIRALE MAIS UN CERCLE", () => {
    // Le tempérament égal referme le chemin de force : c'est un cas particulier, pas la règle.
    expect(manqueFermeture(12, CENTS_QUINTE_TEMPEREE)).toBeCloseTo(0, 9);
    const p = pasDeSpirale(12, CENTS_QUINTE_TEMPEREE);
    expect(p[12].centsReplies).toBeCloseTo(p[0].centsReplies, 9);
    expect(p[12].ecartCents).toBeCloseTo(0, 9);
  });
});

describe("les fréquences rendues", () => {
  it("la tonique sort à la fréquence demandée, et la quinte 1,955 cent au-dessus de la tempérée", () => {
    const p = pasDeSpirale(1);
    expect(frequenceDuPas(p[0], 220)).toBeCloseTo(220, 9);
    const quinte = frequenceDuPas(p[1], 220);
    expect(quinte).toBeCloseTo(330, 6);                       // 220 fois 3/2
    expect(1200 * Math.log2(quinte / (220 * Math.pow(2, 7 / 12)))).toBeCloseTo(1.955, 2);
  });

  it("toutes les fréquences tiennent dans une octave au-dessus de la fondamentale", () => {
    for (const p of pasDeSpirale(53)) {
      const f = frequenceDuPas(p, 220);
      expect(f).toBeGreaterThanOrEqual(220 - 1e-9);
      expect(f).toBeLessThan(440);
    }
  });
});
