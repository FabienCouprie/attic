// audio/cercle-film.test.ts — L'état de l'image à un instant.
//
// CE QUI EST TENU ICI. Que l'état ne dépende QUE des pulsations et de l'instant : c'est ce qui
// permet de rendre le film par tranches et de reprendre un rendu, et c'est donc la propriété dont
// tout le reste dépend. Puis que l'enveloppe se comporte comme une frappe, et que la figure dise
// bien la tonalité.
import { describe, expect, it } from "vitest";

import { enveloppe, etatALInstant, OPTIONS_FILM, type OptionsFilm } from "./cercle-film";
import type { Pulsation } from "./cercle-pulsant";

const pulse = (temps: number, teinte = 120, rayon = 0.8): Pulsation =>
  ({ temps, rayon, teinte, saturation: 0.7, clarte: 0.5 });

const P: Pulsation[] = [pulse(0), pulse(1, 150), pulse(2, 210), pulse(3.5, 300)];
const O: OptionsFilm = { ...OPTIONS_FILM, dureeSec: 5 };

describe("l'état d'une image", () => {
  it("IL NE DÉPEND QUE DE L'INSTANT, ce qui autorise le rendu par tranches", () => {
    // Deux calculs du même instant, dans deux ordres différents, doivent coïncider.
    const a = etatALInstant(P, 2.4, O);
    for (const t of [0.3, 3.9, 1.1, 2.4]) etatALInstant(P, t, O);
    const b = etatALInstant(P, 2.4, O);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("avant la première frappe, le noyau est au repos et rien ne traîne", () => {
    const e = etatALInstant(P, -0.5, O);
    expect(e.noyau).toBeLessThan(O.creux);
    expect(e.anneaux).toEqual([]);
    expect(e.particules).toEqual([]);
  });

  it("UNE FRAPPE MONTE PUIS RETOMBE, et ne redescend jamais sous le creux", () => {
    const juste = etatALInstant(P, 1.02, O).noyau;
    const apres = etatALInstant(P, 1.5, O).noyau;
    const loin = etatALInstant(P, 1.95, O).noyau;
    expect(juste).toBeGreaterThan(apres);
    expect(apres).toBeGreaterThan(loin);
    expect(loin).toBeGreaterThanOrEqual(O.creux * 0.8 * 0.99);
  });

  it("l'enveloppe attaque en vingt millisecondes et retombe vers le creux", () => {
    expect(enveloppe(0, 0.2)).toBeCloseTo(0.2, 6);
    expect(enveloppe(0.02, 0.2)).toBeCloseTo(1, 6);
    expect(enveloppe(0.01, 0.2)).toBeCloseTo(0.6, 6);
    expect(enveloppe(10, 0.2)).toBeCloseTo(0.2, 3);
    expect(enveloppe(-1, 0.2)).toBe(0.2);
  });

  it("UN ANNEAU S'OUVRE ET S'ÉTEINT, et disparaît passé sa vie", () => {
    const tot = etatALInstant(P, 1.05, O).anneaux.find((a) => Math.abs(a.teinte - 150) < 1)!;
    const tard = etatALInstant(P, 2.5, O).anneaux.find((a) => Math.abs(a.teinte - 150) < 1)!;
    expect(tot.rayon).toBeLessThan(tard.rayon);
    expect(tot.opacite).toBeGreaterThan(tard.opacite);
    // Au-delà de sa vie, il n'est plus là du tout.
    expect(etatALInstant(P, 1 + O.vieAnneau + 0.1, O).anneaux.some((a) => Math.abs(a.teinte - 150) < 1)).toBe(false);
  });

  it("chaque frappe lance son compte de particules, et zéro n'en lance aucune", () => {
    const e = etatALInstant(P, 1.05, O);
    // Deux frappes sont encore vivantes à 1,05 s : celle de 0 s est passée (vie 1,1 s), celle de 1 s aussi.
    expect(e.particules.length % O.particules).toBe(0);
    expect(e.particules.length).toBeGreaterThanOrEqual(O.particules);
    expect(etatALInstant(P, 1.05, { ...O, particules: 0 }).particules).toEqual([]);
  });

  it("une particule reste dans le disque et s'efface", () => {
    for (const t of [1.02, 1.4, 1.9]) {
      for (const q of etatALInstant(P, t, O).particules) {
        expect(Math.hypot(q.x, q.y)).toBeLessThanOrEqual(1);
        expect(q.opacite).toBeGreaterThanOrEqual(0);
        expect(q.opacite).toBeLessThanOrEqual(1);
      }
    }
  });

  it("LE POLYGONE DIT LA TONALITÉ : la teinte change, le nombre de sommets change", () => {
    // Le code Camelot va de 1 à 12 par secteurs de trente degrés ; les sommets suivent.
    const a = etatALInstant([pulse(0, 10)], 0.5, O).sommets;
    const b = etatALInstant([pulse(0, 190)], 0.5, O).sommets;
    expect(a).not.toBe(b);
    for (const teinte of [0, 45, 100, 200, 359]) {
      const s = etatALInstant([pulse(0, teinte)], 0.5, O).sommets;
      expect(s).toBeGreaterThanOrEqual(3);
      expect(s).toBeLessThanOrEqual(14);
    }
  });

  it("sans aucune pulsation, il rend quand même un état dessinable", () => {
    const e = etatALInstant([], 1, O);
    expect(Number.isFinite(e.noyau)).toBe(true);
    expect(e.anneaux).toEqual([]);
    expect(e.sommets).toBeGreaterThanOrEqual(3);
  });
});
