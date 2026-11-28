// audio/passe-tout.test.ts — Le passe-tout d'accord retarde la note de ce qu'on lui demande.
//
// LE TÉMOIN GARDE LA DICHOTOMIE D'AVANT, celle de la corde pincée jusqu'au 2026-11-27 : la forme
// fermée doit tomber sur la même racine, sans quoi la corde changerait de son.
import { describe, expect, it } from "vitest";
import { coefficientPasseTout, pasPasseTout, retardDuPasseTout } from "./passe-tout";

/** La dichotomie de la corde pincée d'avant, soixante pas sur [−0,999 ; 0,999]. */
function dichotomieHistorique(fraction: number, w: number): number {
  let bas = -0.999, haut = 0.999;
  for (let k = 0; k < 60; k++) {
    const milieu = (bas + haut) / 2;
    if (retardDuPasseTout(milieu, w) > fraction) bas = milieu;
    else haut = milieu;
  }
  return (bas + haut) / 2;
}

const PULSATIONS = [0.005, 0.05, 0.2, 0.6, 1.0, 1.6, 2.4];
const FRACTIONS = [0.1, 0.25, 0.5, 0.75, 1.0, 1.099];

describe("le passe-tout d'accord", () => {
  it("RETARDE LA PULSATION DEMANDÉE DE LA FRACTION DEMANDÉE, à 10⁻¹² échantillon près", () => {
    for (const w of PULSATIONS) {
      for (const d of FRACTIONS) {
        expect(Math.abs(retardDuPasseTout(coefficientPasseTout(d, w), w) - d), `ω ${w}, d ${d}`).toBeLessThan(1e-12);
      }
    }
  });

  it("TOMBE SUR LA RACINE QUE TROUVAIT LA DICHOTOMIE DE LA CORDE PINCÉE", () => {
    for (const w of PULSATIONS) {
      for (const d of FRACTIONS) {
        expect(Math.abs(coefficientPasseTout(d, w) - dichotomieHistorique(d, w)), `ω ${w}, d ${d}`).toBeLessThan(1e-13);
      }
    }
  });

  it("REJOINT L'APPROXIMATION DE THIRAN AU CONTINU, ET S'EN ÉCARTE DANS L'AIGU", () => {
    const thiran = (d: number) => (1 - d) / (1 + d);
    expect(coefficientPasseTout(0.5, 0)).toBe(thiran(0.5));
    expect(Math.abs(coefficientPasseTout(0.5, 0.005) - thiran(0.5))).toBeLessThan(1e-5);
    // À 6 kHz sous 44,1 kHz, une période de 7,35 échantillons : Thiran retarde de 0,37 au lieu de
    // 0,35, soit une boucle 0,27 % trop longue, près de cinq cents trop bas.
    const w = (2 * Math.PI * 6000) / 44100;
    expect(retardDuPasseTout(thiran(0.35), w) - 0.35).toBeGreaterThan(0.015);
  });

  it("A UN GAIN DE UN : l'énergie de sa réponse impulsionnelle vaut un", () => {
    for (const eta of [-0.6, 0, 0.3, 0.9]) {
      let xAvant = 0, yAvant = 0, energie = 0;
      for (let n = 0; n < 20_000; n++) {
        const x = n === 0 ? 1 : 0;
        const y = pasPasseTout(eta, x, xAvant, yAvant);
        xAvant = x; yAvant = y; energie += y * y;
      }
      expect(Math.abs(energie - 1), `η ${eta}`).toBeLessThan(1e-9);
    }
  });

  it("reste dans le cercle unité quoi qu'on lui demande", () => {
    for (const w of [0.001, 1, 3]) for (const d of [-5, 0, 0.1, 1.1, 5]) {
      expect(Math.abs(coefficientPasseTout(d, w))).toBeLessThanOrEqual(0.999);
    }
  });
});
