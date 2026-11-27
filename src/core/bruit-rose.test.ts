// core/bruit-rose.test.ts — Le bruit rose commun rend, au bit près, ce que rendaient ses copies.
//
// LE TÉMOIN GARDE LA COPIE HISTORIQUE, recollée ici telle qu'elle vivait dans les quatre modules
// avant le 2026-11-27, et c'est sa raison d'être : sans elle, rien ne prouverait qu'un graphe
// enregistré garde son son. `docs/bruit-rose-unique.test.ts` l'exempte nommément.
import { describe, expect, it } from "vitest";
import { creerAleatoire } from "./hasard";
import { bruitRoseKellet } from "./bruit-rose";

/** La copie d'avant, à l'identique : source blanche, gain, et le régime de la corde pincée. */
function copieHistorique(n: number, blanc: () => number, gain: number, regime: number): Float32Array {
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = -regime; i < n; i++) {
    const w = blanc();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    if (i >= 0) x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * gain;
    b6 = w * 0.115926;
  }
  return x;
}

const uniforme = (graine: number) => { const a = creerAleatoire(graine); return () => a() * 2 - 1; };
const gaussien = (graine: number) => {
  const a = creerAleatoire(graine);
  return () => Math.sqrt(-2 * Math.log(a() + 1e-12)) * Math.cos(2 * Math.PI * a());
};

/** Le premier rang où deux suites diffèrent, ou −1. */
const premierEcart = (a: Float32Array, b: Float32Array) => {
  if (a.length !== b.length) return 0;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return i;
  return -1;
};

describe("le bruit rose de Kellet, écrit une fois", () => {
  // Les quatre emplois d'avant : le générateur de bruit et le frottement du pointeur (gain 0,11, à
  // froid), la corde pincée (gain 0,11, 4 096 échantillons de régime), le son d'essai de l'écart à
  // la référence (gain 0,02, source gaussienne).
  const CAS = [
    { nom: "générateur et pointeur", blanc: uniforme, gain: 0.11, regime: 0 },
    { nom: "corde pincée", blanc: uniforme, gain: 0.11, regime: 4096 },
    { nom: "son d'essai de l'écart", blanc: gaussien, gain: 0.02, regime: 0 },
  ];

  for (const c of CAS) {
    it(`REND LA COPIE D'AVANT AU BIT PRÈS : ${c.nom}, sur trois graines`, () => {
      for (const graine of [1, 7, 4242]) {
        const attendu = copieHistorique(20_000, c.blanc(graine), c.gain, c.regime);
        const obtenu = bruitRoseKellet(20_000, c.blanc(graine), { gain: c.gain, regime: c.regime });
        expect(premierEcart(attendu, obtenu), `${c.nom}, graine ${graine}`).toBe(-1);
      }
    });
  }

  it("TIRE AUTANT QU'IL GARDE, PLUS SON RÉGIME : la suite du générateur reste celle d'avant", () => {
    let tires = 0;
    const blanc = () => { tires++; return 0; };
    bruitRoseKellet(100, blanc, { regime: 50 });
    expect(tires).toBe(150);
  });

  it("une longueur nulle rend un tampon vide, sans tirer", () => {
    let tires = 0;
    expect(bruitRoseKellet(0, () => { tires++; return 1; }).length).toBe(0);
    expect(tires).toBe(0);
  });
});
