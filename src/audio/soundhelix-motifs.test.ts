// audio/soundhelix-motifs.test.ts — La grammaire des motifs, sur les cas que SoundHelix publie.
//
// LES VECTEURS EUCLIDIENS sont ceux de la table d'essai du générateur de SoundHelix (3,8), (5,8),
// (7,12) et (5,16). L'EXEMPLE DE TRANSPOSITION est celui de son journal des versions, 0.9 :
// « 2/2,(1/2,2/2,-1/2,4/2)+2 » s'écrit « 2/2,3/2,4/2,1/2,6/2 ».

import { describe, expect, it } from "vitest";
import { deplierMotif, evaluerFonctions, lireMotif, ticsDuMotif, transposerMotif } from "./soundhelix-motifs";

const enTexte = (s: string) => s.split(",").map((e) => (e === "x" ? "x" : ".")).join("");

describe("les fonctions du motif", () => {
  it.each([
    [3, 8, "x..x..x."], [5, 8, "x.xx.xx."], [7, 12, "x.xx.x.xx.x."], [5, 16, "x..x..x..x..x..."],
  ])("E(%i,%i) rend le rythme de Bjorklund de SoundHelix", (p, s, attendu) => {
    expect(enTexte(evaluerFonctions(`E(${p},${s},x,-)`))).toBe(attendu);
  });

  it("pose la note et le silence écrits, vélocité et durée comprises", () => {
    expect(evaluerFonctions("E(3,8,0:800,-)")).toBe("0:800,-,-,0:800,-,-,0:800,-");
    expect(evaluerFonctions("-/2,E(1,2,7/2,-/2),3")).toBe("-/2,7/2,-/2,3");
  });

  it("laisse une fonction inconnue telle quelle, et refuse un E mal formé", () => {
    expect(evaluerFonctions("F(1,2)")).toBe("F(1,2)");
    expect(() => evaluerFonctions("E(3,8,0)")).toThrow(/quatre/);
    expect(() => evaluerFonctions("E(9,8,0,-)")).toThrow(/répartissent/);
  });
});

describe("les groupes du motif", () => {
  it("transpose le premier nombre de chaque entrée, comme le journal de SoundHelix l'écrit", () => {
    expect(deplierMotif("2/2,(1/2,2/2,-1/2,4/2)+2")).toBe("2/2,3/2,4/2,1/2,6/2");
    expect(deplierMotif("(0,-,1~/2:500,+)-3")).toBe("-3,-,-2~/2:500,+");
    expect(transposerMotif("0/4:800,12", 0)).toBe("0/4:800,12");
  });

  it("répète, du groupe le plus intérieur au plus extérieur", () => {
    expect(deplierMotif("(Am/4,F/4)*3,G/4,C/4")).toBe("Am/4,F/4,Am/4,F/4,Am/4,F/4,G/4,C/4");
    expect(deplierMotif("((0,1)*2,2)+12")).toBe("12,13,12,13,14");
  });

  it("refuse une parenthèse qui ne forme pas de groupe", () => {
    expect(() => deplierMotif("(0,1)")).toThrow(/parenthèse/);
    expect(() => deplierMotif("0,(1")).toThrow(/parenthèse/);
  });
});

describe("les entrées du motif", () => {
  const o = { velociteMax: 1000, ticsParTemps: 4 };

  it("lit décalage, liaison, durée et vélocité, la vélocité en dernier", () => {
    expect(lireMotif("0/2:600,-/3,-1~,+", { ...o, jokers: "+" })).toEqual([
      { decalage: 0, joker: null, silence: false, tics: 2, velocite: 600, lie: false },
      { decalage: null, joker: null, silence: true, tics: 3, velocite: 1000, lie: false },
      { decalage: -1, joker: null, silence: false, tics: 1, velocite: 1000, lie: true },
      { decalage: null, joker: "+", silence: false, tics: 1, velocite: 1000, lie: false },
    ]);
    expect(() => lireMotif("0:600/2", o)).toThrow(/illisible/);
    expect(() => lireMotif("+", o)).toThrow(/illisible/);
  });

  it("évalue E, puis les groupes, puis les entrées", () => {
    const m = lireMotif("(E(1,2,0:500,-))*2", o);
    expect(m.map((e) => e.decalage)).toEqual([0, null, 0, null]);
    expect(ticsDuMotif(m)).toBe(4);
  });

  it("met à l'échelle un motif écrit dans une autre résolution, et refuse ce qui ne tombe pas juste", () => {
    expect(lireMotif("0/2,-,3", { ...o, ticsParTemps: 12, ticsParTempsMotif: 4 }).map((e) => e.tics)).toEqual([6, 3, 3]);
    expect(lireMotif("0/2,-/4", { ...o, ticsParTemps: 4, ticsParTempsMotif: 2 }).map((e) => e.tics)).toEqual([4, 8]);
    expect(() => lireMotif("0,1", { ...o, ticsParTemps: 4, ticsParTempsMotif: 3 })).toThrow(/grille/);
  });

  it("un motif vide n'a aucune entrée", () => {
    expect(lireMotif("  ", o)).toEqual([]);
  });
});
