// audio/accordage.test.ts — Un accordage rend-il les hauteurs qu'il promet ?
//
// LE CAS QUI COMPTE LE PLUS EST LE PREMIER : le tempérament égal à douze degrés doit rendre
// EXACTEMENT les demi-tons entiers. C'est la condition pour que ce module puisse entrer dans le
// catalogue sans rien déplacer — « Étaler sur le clavier », l'export SFZ et les claviers travaillent
// en demi-tons, et un accordage à douze qui rendrait 60,000000001 ferait dériver leurs empreintes.
import { describe, expect, it } from "vitest";

import {
  CENTS_PAR_OCTAVE, accordageDepuisCents, accordageEgal, decrireAccordage, degrePlusProche,
  degresParPeriode, hauteurDuDegre, rangsDemandes,
} from "./accordage";

describe("le tempérament égal", () => {
  it("À DOUZE DEGRÉS REND LES DEMI-TONS ENTIERS, exactement", () => {
    const a = accordageEgal(12);
    // `toBe` et non `toBeCloseTo` : l'égalité exacte est ce qui est exigé, et la mesure doit le dire.
    for (let i = -24; i <= 24; i++) expect(hauteurDuDegre(a, i)).toBe(60 + i);
  });

  it("rend sa tonique à la référence, quelle qu'elle soit", () => {
    expect(hauteurDuDegre(accordageEgal(12, CENTS_PAR_OCTAVE, 69), 0)).toBe(69);
    expect(hauteurDuDegre(accordageEgal(31, CENTS_PAR_OCTAVE, 69), 0)).toBe(69);
  });

  it("À TRENTE ET UN DEGRÉS, un degré vaut moins d'un demi-ton", () => {
    const a = accordageEgal(31);
    expect(degresParPeriode(a)).toBe(31);
    // 1200 / 31 = 38,7 cents, soit 0,387 demi-ton.
    expect(hauteurDuDegre(a, 1) - 60).toBeCloseTo(0.3871, 4);
    // Et l'octave retombe juste : trente et un degrés font exactement douze demi-tons.
    expect(hauteurDuDegre(a, 31)).toBeCloseTo(72, 10);
  });

  it("LA PÉRIODE N'EST PAS TOUJOURS L'OCTAVE : Bohlen-Pierce répète à la douzième", () => {
    // Treize degrés égaux dans une tritave de 1901,955 cents, d'après Bohlen.
    const bp = accordageEgal(13, 1901.955);
    expect(hauteurDuDegre(bp, 13) - 60).toBeCloseTo(19.01955, 5);
    // Son « octave » n'existe pas : le degré le plus proche de douze demi-tons n'y tombe pas juste.
    const { ecartCents } = degrePlusProche(bp, 72);
    expect(Math.abs(ecartCents)).toBeGreaterThan(5);
  });

  it("refuse un nombre de degrés qui n'est pas un entier positif", () => {
    expect(() => accordageEgal(0)).toThrow(/au moins un degré/);
    expect(() => accordageEgal(-3)).toThrow(/au moins un degré/);
    expect(() => accordageEgal(12.5)).toThrow(/entier/);
  });
});

describe("un accordage depuis une liste de cents", () => {
  it("TRIE, DÉDOUBLONNE, ET RETIRE LA PÉRIODE, qui est la tonique du tour suivant", () => {
    // L'ordre d'arrivée des creux d'une courbe de dissonance n'est pas garanti, et l'octave y est
    // toujours — c'est le creux le plus franc. La garder ferait deux toniques dans une période.
    const a = accordageDepuisCents([702, 0, 1200, 498, 702, 386]);
    expect(a.degres).toEqual([0, 386, 498, 702]);
    expect(hauteurDuDegre(a, 4)).toBeCloseTo(72, 10);
  });

  it("POSE LA TONIQUE MÊME QUAND LA LISTE NE LA PORTE PAS", () => {
    // Une échelle qui commencerait à son second degré n'aurait pas de point d'ancrage.
    expect(accordageDepuisCents([386, 702]).degres).toEqual([0, 386, 702]);
  });

  it("refuse une liste vide, et un degré hors de la période", () => {
    expect(() => accordageDepuisCents([])).toThrow(/au moins un degré/);
    expect(() => accordageDepuisCents([1200])).toThrow(/au moins un degré/);
    expect(() => accordageDepuisCents([0, 1300])).toThrow(/hors de la période/);
    expect(() => accordageDepuisCents([0, -50])).toThrow(/hors de la période/);
  });

  it("l'intonation juste d'un timbre harmonique s'y écrit telle que Sethares la trouve", () => {
    // Les creux que la notice de « Courbe de dissonance » annonce pour un son harmonique.
    const juste = accordageDepuisCents([0, 316, 386, 498, 702, 1200], CENTS_PAR_OCTAVE, 60, "harmonique");
    expect(juste.degres).toEqual([0, 316, 386, 498, 702]);
    // La quinte juste, 3/2, vaut 701,955 cents : à 702 elle est à 45 millièmes de cent près.
    expect(hauteurDuDegre(juste, 4)).toBeCloseTo(60 + 7.02, 10);
    expect(decrireAccordage(juste)).toBe("5 degrés par octave · harmonique");
  });
});

describe("le degré le plus proche d'une hauteur", () => {
  it("retrouve le rang en tempérament égal, et un écart nul", () => {
    const a = accordageEgal(12);
    for (const n of [60, 61, 72, 48, 69]) {
      const { rang, ecartCents } = degrePlusProche(a, n);
      expect(hauteurDuDegre(a, rang)).toBe(n);
      expect(ecartCents).toBe(0);
    }
  });

  it("DIT DE COMBIEN UNE HAUTEUR S'ÉCARTE DU DEGRÉ QU'ELLE APPROCHE, signé", () => {
    const a = accordageEgal(12);
    expect(degrePlusProche(a, 60.2).ecartCents).toBeCloseTo(20, 6);
    expect(degrePlusProche(a, 59.8).ecartCents).toBeCloseTo(-20, 6);
  });

  it("CHOISIT LA TONIQUE D'AU-DESSUS quand la hauteur est juste sous la période", () => {
    // Sans le degré de rang `n` parmi les candidats, 71,9 serait rapporté au onzième degré, à
    // quatre-vingt-dix cents, au lieu de la tonique d'au-dessus, à dix.
    const a = accordageEgal(12);
    const { rang, ecartCents } = degrePlusProche(a, 71.9);
    expect(rang).toBe(12);
    expect(ecartCents).toBeCloseTo(-10, 6);
  });

  it("travaille aussi sous la référence, où les tours sont négatifs", () => {
    const a = accordageEgal(12);
    expect(degrePlusProche(a, 48).rang).toBe(-12);
    expect(degrePlusProche(a, 47.8).rang).toBe(-12);
    expect(degrePlusProche(a, 47.8).ecartCents).toBeCloseTo(-20, 6);
  });

  it("À ÉGALITÉ EXACTE, LE DEGRÉ LE PLUS BAS GAGNE, et l'écart est donc positif", () => {
    // Un quart de ton tombe pile entre deux degrés d'un tempérament à douze. L'un ou l'autre ferait
    // l'affaire ; ce cas existe pour que le choix soit déclaré et non découvert. C'est lui qui a
    // relevé que mon attente était fausse et non le calcul.
    const a = accordageEgal(12);
    expect(degrePlusProche(a, 60.5)).toEqual({ rang: 60 - 60, ecartCents: 50 });
    expect(degrePlusProche(a, 47.5).rang).toBe(-13);
    expect(degrePlusProche(a, 47.5).ecartCents).toBeCloseTo(50, 6);
  });
});

describe("les rangs qu'un texte désigne", () => {
  it("UN TEXTE VIDE DEMANDE UN TOUR COMPLET, dans l'ordre croissant", () => {
    expect(rangsDemandes("", 5)).toEqual([0, 1, 2, 3, 4]);
    expect(rangsDemandes("   ", 3)).toEqual([0, 1, 2]);
    expect(rangsDemandes("rien de lisible", 2)).toEqual([0, 1]);
  });

  it("lit les rangs quelle que soit la séparation", () => {
    expect(rangsDemandes("0 4 7", 12)).toEqual([0, 4, 7]);
    expect(rangsDemandes("0,4,7", 12)).toEqual([0, 4, 7]);
    expect(rangsDemandes("0\n4\n7", 12)).toEqual([0, 4, 7]);
  });

  it("LAISSE PASSER LES RANGS HORS DE LA PÉRIODE, qui sont le sens de l'affaire", () => {
    // Le rang 12 d'un accordage à douze degrés est la tonique du tour suivant ; le rang -1 descend.
    expect(rangsDemandes("0 12 -1", 12)).toEqual([0, 12, -1]);
    expect(hauteurDuDegre(accordageEgal(12), 12)).toBe(72);
  });

  it("écarte le moins seul, qui ne désigne aucun rang", () => {
    // Sans ce filtre, `Number("-")` rendrait NaN et une note sans hauteur partirait sur la sortie.
    expect(rangsDemandes("0 - 4", 12)).toEqual([0, 4]);
    expect(rangsDemandes("-", 12).every(Number.isFinite)).toBe(true);
  });
});

describe("la phrase qui décrit un accordage", () => {
  it("dit la période SEULEMENT quand elle n'est pas l'octave", () => {
    expect(decrireAccordage(accordageEgal(12))).toBe("12 degrés par octave");
    expect(decrireAccordage(accordageEgal(13, 1901.955))).toBe("13 degrés par période de 1902 cents");
  });

  it("se dit dans les deux langues", () => {
    expect(decrireAccordage(accordageEgal(19), true)).toBe("19 degrees per octave");
    expect(decrireAccordage(accordageEgal(13, 1901.955), true)).toBe("13 degrees per 1902 cents");
  });
});
