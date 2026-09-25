// plugins/bruitage-ia.test.ts — La mise à niveau d'un bruitage engendré.
//
// POURQUOI CE CALCUL EST TESTÉ ET PAS LE RESTE DU NŒUD. Le reste appelle un modèle et rend ce qu'il
// donne ; c'est la mise à niveau qui est écrite ici, et c'est elle qui peut abîmer un son. Deux
// façons de l'abîmer : traiter les canaux séparément, ce qui déplace l'image stéréo, et diviser par
// la crête d'un silence, ce qui envoie le gain à l'infini.
import { describe, expect, it } from "vitest";
import { mettreAuNiveau } from "./bruitage-ia";

const dbfs = (v: number) => 20 * Math.log10(v);

describe("la mise au niveau d'un bruitage", () => {
  it("porte la crête au niveau demandé", () => {
    const g = Float32Array.from([0.1, -0.05, 0.02]);
    mettreAuNiveau([g], -6);
    let crete = 0;
    for (const v of g) crete = Math.max(crete, Math.abs(v));
    expect(dbfs(crete)).toBeCloseTo(-6, 4);
  });

  it("LES DEUX CANAUX PRENNENT LE MÊME GAIN : l'image stéréo ne bouge pas", () => {
    // Le droit est deux fois plus fort que le gauche ; il doit le rester après la mise à niveau.
    const g = Float32Array.from([0.1, -0.05]);
    const d = Float32Array.from([0.2, -0.1]);
    mettreAuNiveau([g, d], -3);
    expect(d[0] / g[0]).toBeCloseTo(2, 6);
    expect(d[1] / g[1]).toBeCloseTo(2, 6);
    // Et c'est la crête des DEUX canaux qui atteint la cible, non celle de chacun.
    expect(dbfs(Math.abs(d[0]))).toBeCloseTo(-3, 4);
    expect(Math.abs(g[0])).toBeLessThan(Math.abs(d[0]));
  });

  it("UN SILENCE RESTE UN SILENCE, au lieu d'un gain infini", () => {
    const g = new Float32Array(8);
    expect(mettreAuNiveau([g], -1)).toBe(0);
    expect([...g]).toEqual(new Array(8).fill(0));
  });

  it("monte un son faible autant qu'elle descend un son fort", () => {
    // Le cas mesuré : les bruitages sortent du modèle bien plus bas que la musique.
    const faible = Float32Array.from([0.018]);
    const fort = Float32Array.from([0.99]);
    const gainFaible = mettreAuNiveau([faible], -1);
    const gainFort = mettreAuNiveau([fort], -1);
    expect(gainFaible).toBeGreaterThan(1);
    expect(gainFort).toBeLessThan(1);
    expect(dbfs(Math.abs(faible[0]))).toBeCloseTo(dbfs(Math.abs(fort[0])), 4);
  });

  it("une cible de zéro décibel porte la crête à la pleine échelle, sans la dépasser", () => {
    const g = Float32Array.from([0.3, -0.7]);
    mettreAuNiveau([g], 0);
    expect(Math.max(...[...g].map(Math.abs))).toBeCloseTo(1, 6);
    expect([...g].every((v) => Math.abs(v) <= 1.000001)).toBe(true);
  });
});
