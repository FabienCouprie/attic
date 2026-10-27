// audio/silences-pauses.test.ts — Raccourcir les silences sans hacher, et recoller sans clic.
//
// « Rogner les silences », en portée « Partout », supprimait chaque silence intérieur et recollait
// les morceaux bout à bout. Deux réglages s'y ajoutent le 2026-10-27, et ces cas tiennent les fautes
// que chacun peut commettre :
//
//   · « Pause gardée » : une pause de la mauvaise longueur, prise ailleurs que dans le silence
//     lui-même, ou qui avale un silence déjà plus court qu'elle ;
//   · « Fondu » : un raccord qui saute encore, un creux de puissance au milieu du fondu, un fondu
//     qui avale un morceau trop court, deux canaux recollés à des endroits différents.
import { describe, expect, it } from "vitest";
import { appliquerRognage, garderDesPauses, recollerEnFondu } from "./silences";
import { creerAleatoire } from "../core/hasard";

describe("la pause gardée", () => {
  it("RAMÈNE UN SILENCE À LA PAUSE DEMANDÉE, moitié de chaque côté", () => {
    // Deux morceaux, 1000 échantillons de silence entre eux, une pause de 300.
    const g = garderDesPauses([{ debut: 0, fin: 500 }, { debut: 1500, fin: 2000 }], 300);
    expect(g).toEqual([{ debut: 0, fin: 650 }, { debut: 1350, fin: 2000 }]);
    const trouRestant = (g[0].fin - 500) + (1500 - g[1].debut);
    expect(trouRestant, "la pause gardée n'a pas la longueur demandée").toBe(300);
  });

  it("LA PAUSE EST PRISE DANS LE SILENCE ENTRE LES DEUX MORCEAUX, et nulle part ailleurs", () => {
    const g = garderDesPauses([{ debut: 0, fin: 500 }, { debut: 1500, fin: 2000 }], 300);
    expect(g[0].fin).toBeLessThanOrEqual(1500);
    expect(g[1].debut).toBeGreaterThanOrEqual(500);
  });

  it("UN SILENCE PLUS COURT QUE LA PAUSE EST GARDÉ ENTIER, et les deux morceaux n'en font qu'un", () => {
    expect(garderDesPauses([{ debut: 0, fin: 500 }, { debut: 700, fin: 900 }], 300)).toEqual([{ debut: 0, fin: 900 }]);
  });

  it("À ZÉRO, LE SILENCE EST SUPPRIMÉ comme avant : les morceaux ne bougent pas", () => {
    const gardes = [{ debut: 0, fin: 500 }, { debut: 1500, fin: 2000 }];
    expect(garderDesPauses(gardes, 0)).toEqual(gardes);
  });

  it("chaque silence d'une prise à plusieurs coupes reçoit la même pause", () => {
    const g = garderDesPauses([{ debut: 0, fin: 100 }, { debut: 1000, fin: 1100 }, { debut: 3000, fin: 3100 }], 200);
    const sortie = g.reduce((n, s) => n + (s.fin - s.debut), 0);
    expect(sortie).toBe(300 + 2 * 200);
  });
});

describe("le fondu aux raccords", () => {
  it("LA SORTIE RACCOURCIT D'UN FONDU PAR RACCORD, les deux bords se recouvrant", () => {
    const x = new Float32Array(3000);
    const [out] = recollerEnFondu([x], [{ debut: 0, fin: 1000 }, { debut: 1500, fin: 2500 }], 100);
    expect(out.length).toBe(2000 - 100);
  });

  it("LE RACCORD NE SAUTE PLUS : bout à bout la forme d'onde fait une marche, en fondu non", () => {
    // Un niveau constant de 0,5 puis de −0,5 : recollés bout à bout, un saut de 1,0 d'un échantillon
    // au suivant, c'est-à-dire un clic.
    const x = Float32Array.from({ length: 2000 }, (_, i) => (i < 1000 ? 0.5 : -0.5));
    const gardes = [{ debut: 0, fin: 1000 }, { debut: 1000, fin: 2000 }];
    const sautMax = (y: Float32Array) => { let m = 0; for (let i = 1; i < y.length; i++) m = Math.max(m, Math.abs(y[i] - y[i - 1])); return m; };
    expect(sautMax(appliquerRognage([x], gardes)[0]), "le témoin bout à bout devait sauter").toBeCloseTo(1, 6);
    expect(sautMax(recollerEnFondu([x], gardes, 200)[0]), "le raccord en fondu saute encore").toBeLessThan(0.02);
  });

  it("À PUISSANCE CONSTANTE : deux souffles sans rapport gardent leur niveau à travers le raccord", () => {
    // Deux bruits indépendants de même niveau. Un fondu linéaire creuserait trois décibels au
    // milieu du raccord ; à puissance constante, le niveau ne bouge pas.
    const alea = creerAleatoire(4242);
    const n = 40000, f = 4000;
    const x = Float32Array.from({ length: n }, () => (alea() * 2 - 1) * 0.3);
    const [out] = recollerEnFondu([x], [{ debut: 0, fin: 20000 }, { debut: 20000, fin: n }], f);
    const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    const dehors = rms(out.subarray(0, 15000));
    const milieu = rms(out.subarray(20000 - f + f / 4, 20000 - f / 4));
    const ecartDb = 20 * Math.log10(milieu / dehors);
    expect(Math.abs(ecartDb), `le niveau bouge de ${ecartDb.toFixed(2)} dB au raccord`).toBeLessThan(0.5);
  });

  it("LE FONDU EST BORNÉ PAR LA MOITIÉ DES MORCEAUX VOISINS : un morceau court n'est pas avalé", () => {
    const x = Float32Array.from({ length: 3000 }, (_, i) => i);
    const [out] = recollerEnFondu([x], [{ debut: 0, fin: 1000 }, { debut: 1200, fin: 1240 }, { debut: 2000, fin: 3000 }], 500);
    // Le morceau du milieu fait 40 échantillons : ses deux fondus valent au plus 20 chacun.
    expect(out.length).toBe(1000 + 40 + 1000 - 20 - 20);
  });

  it("LES DEUX CANAUX SONT RECOLLÉS AU MÊME ENDROIT, et un seul morceau n'a pas de raccord", () => {
    const g = Float32Array.from({ length: 2000 }, (_, i) => Math.sin(i / 7));
    const d = Float32Array.from({ length: 2000 }, (_, i) => Math.cos(i / 9));
    const [rg, rd] = recollerEnFondu([g, d], [{ debut: 0, fin: 800 }, { debut: 1200, fin: 2000 }], 64);
    expect(rg.length).toBe(rd.length);
    const [seul] = recollerEnFondu([g], [{ debut: 100, fin: 600 }], 64);
    expect([...seul]).toEqual([...g.subarray(100, 600)]);
  });

  it("À ZÉRO, LE RECOLLAGE EST CELUI D'AVANT, bout à bout", () => {
    const x = Float32Array.from({ length: 100 }, (_, i) => i);
    const gardes = [{ debut: 10, fin: 20 }, { debut: 50, fin: 55 }];
    expect([...recollerEnFondu([x], gardes, 0)[0]]).toEqual([...appliquerRognage([x], gardes)[0]]);
  });
});
