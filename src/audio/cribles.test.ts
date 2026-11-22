// audio/cribles.test.ts — Un crible est une structure arithmétique : ses
// résultats sont donc exactement prédictibles, et c'est ce qu'on vérifie. Le
// test le plus parlant est celui de la gamme majeure, dont la décomposition a
// été trouvée par recherche exhaustive et non reprise de mémoire — une première
// version en affirmait une qui donnait trois degrés étrangers à la gamme.
import { describe, it, expect } from "vitest";
import {
  appliquerCrible, periodeCrible, criblesVersNotes, criblesVersRythme,
  CRIBLE_GAMME_MAJEURE, lireCrible, ecrireCrible,
} from "./cribles";

describe("periodeCrible", () => {
  it("vaut le PPCM des modules", () => {
    expect(periodeCrible([{ module: 3, residu: 0 }, { module: 4, residu: 0 }])).toBe(12);
    expect(periodeCrible([{ module: 6, residu: 0 }, { module: 4, residu: 0 }])).toBe(12);
  });

  it("explose avec des modules premiers entre eux — c'est l'intérêt du procédé", () => {
    // Xenakis choisissait ses modules pour cela : une période de 385 met la
    // répétition hors de portée de l'oreille, sans pour autant faire du hasard.
    expect(periodeCrible([{ module: 5, residu: 0 }, { module: 7, residu: 0 }, { module: 11, residu: 0 }])).toBe(385);
  });

  it("un crible vide a une période de 1", () => {
    expect(periodeCrible([])).toBe(1);
  });
});

describe("appliquerCrible", () => {
  it("une classe seule donne une grille régulière", () => {
    expect(appliquerCrible({ classes: [{ module: 3, residu: 0 }], operation: "union", etendue: 12 }))
      .toEqual([0, 3, 6, 9]);
    expect(appliquerCrible({ classes: [{ module: 3, residu: 1 }], operation: "union", etendue: 12 }))
      .toEqual([1, 4, 7, 10]);
  });

  it("la réunion produit des écarts irréguliers là où chaque classe est régulière", () => {
    // C'est tout le procédé : deux régularités superposées cessent d'en être une.
    const r = appliquerCrible({
      classes: [{ module: 3, residu: 0 }, { module: 4, residu: 0 }],
      operation: "union", etendue: 12,
    });
    expect(r).toEqual([0, 3, 4, 6, 8, 9]);
    const ecarts = r.slice(1).map((v, i) => v - r[i]);
    expect(new Set(ecarts).size).toBeGreaterThan(1);   // les écarts ne sont pas tous égaux
  });

  it("l'intersection ne garde que ce qui appartient à toutes les classes", () => {
    expect(appliquerCrible({
      classes: [{ module: 3, residu: 0 }, { module: 4, residu: 0 }],
      operation: "intersection", etendue: 24,
    })).toEqual([0, 12]);
  });

  it("la différence creuse des trous dans une grille régulière", () => {
    // Ce qu'une réunion ne sait pas faire : retirer des degrés plutôt qu'en ajouter.
    expect(appliquerCrible({
      classes: [{ module: 2, residu: 0 }, { module: 6, residu: 0 }],
      operation: "difference", etendue: 12,
    })).toEqual([2, 4, 8, 10]);
  });

  it("accepte un résidu négatif ou supérieur au module", () => {
    const a = appliquerCrible({ classes: [{ module: 5, residu: -2 }], operation: "union", etendue: 15 });
    const b = appliquerCrible({ classes: [{ module: 5, residu: 3 }], operation: "union", etendue: 15 });
    expect(a).toEqual(b);
    const c = appliquerCrible({ classes: [{ module: 5, residu: 8 }], operation: "union", etendue: 15 });
    expect(c).toEqual(b);
  });

  it("un crible vide ne retient rien", () => {
    expect(appliquerCrible({ classes: [], operation: "union", etendue: 12 })).toEqual([]);
  });
});

describe("la gamme majeure comme crible", () => {
  it("donne exactement do ré mi fa sol la si", () => {
    // Une échelle qu'on croit naturelle s'écrit comme une structure arithmétique
    // parmi d'autres — ce qui autorise à en fabriquer de nouvelles.
    expect(appliquerCrible({ classes: CRIBLE_GAMME_MAJEURE, operation: "union", etendue: 12 }))
      .toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it("n'est pas périodique à l'octave, le module 7 ne divisant pas 12", () => {
    // Précision volontaire : ce crible décrit exactement les douze premiers
    // degrés, ce qui suffit ici, mais ne se prolonge pas de lui-même.
    expect(periodeCrible(CRIBLE_GAMME_MAJEURE)).toBe(7);
  });

  it("les intervalles sont ceux du mode majeur : 2 2 1 2 2 2", () => {
    const r = appliquerCrible({ classes: CRIBLE_GAMME_MAJEURE, operation: "union", etendue: 12 });
    expect(r.slice(1).map((v, i) => v - r[i])).toEqual([2, 2, 1, 2, 2, 2]);
  });
});

describe("conversions", () => {
  it("vers des hauteurs MIDI, à partir d'une note de base", () => {
    expect(criblesVersNotes([0, 2, 4, 5, 7, 9, 11], 60)).toEqual([60, 62, 64, 65, 67, 69, 71]);
  });

  it("vers des instants, un entier valant une subdivision", () => {
    // La même structure lue sur l'axe du temps : la dualité que Xenakis
    // revendiquait explicitement.
    expect(criblesVersRythme([0, 3, 4, 6], 0.25)).toEqual([0, 0.75, 1, 1.5]);
  });
});

describe("lireCrible", () => {
  const lu = (texte: string, operation: "union" | "intersection" | "difference" = "union") => lireCrible(texte, operation);
  const a = { classe: { module: 3, residu: 0 } }, b = { classe: { module: 4, residu: 1 } };

  it("lit la notation de Xenakis, une liste que l'opération combine", () => {
    expect(lu("3@0 4@1")).toEqual({ expression: { ou: [a, b] } });
    expect(lu("3@0 4@1", "intersection")).toEqual({ expression: { et: [a, b] } });
  });

  it("accepte virgules et points-virgules entre les classes d'une liste", () => {
    for (const forme of ["3@0, 4@1", "3@0;4@1"]) expect(lu(forme), forme).toEqual({ expression: { ou: [a, b] } });
  });

  it("lit « ∪ » et « | » comme la réunion, quelle que soit l'opération", () => {
    for (const forme of ["3@0 ∪ 4@1", "3@0|4@1"]) expect(lu(forme, "intersection"), forme).toEqual({ expression: { ou: [a, b] } });
  });

  it("accepte un résidu négatif", () => {
    expect(lu("5@-2")).toEqual({ expression: { classe: { module: 5, residu: -2 } } });
  });

  it("refuse un fragment invalide, et le nomme", () => {
    // Ce test tenait le contraire : « 3@0 pouet 4@ @2 0@1 4@1 » gardait ses deux classes valides. Mais le
    // crible joué n'était plus celui qu'on avait écrit, sans un mot. Décision de Fabien du 2026-11-22,
    // « Refuse it, named », revue des notations en texte.
    expect(lu("3@0 pouet 4@ @2 0@1 4@1")).toEqual({ refus: { genre: "fragment", texte: "pouet" } });
    expect(lu("3@0 4@ 4@1")).toEqual({ refus: { genre: "fragment", texte: "4@" } });
  });

  it("refuse une expression vide", () => {
    expect(lu("")).toEqual({ refus: { genre: "vide", texte: "" } });
    expect(lu("   ")).toEqual({ refus: { genre: "vide", texte: "" } });
  });

  it("ecrireCrible est la réciproque de lireCrible", () => {
    for (const texte of ["3@0 ∪ 4@1 ∪ 5@-2", "3@0 ∪ (4@1 ∩ 5@2)", "−(2@0 ∪ 3@0) ∩ 5@1"]) {
      const l = lu(texte);
      expect("expression" in l && ecrireCrible(l.expression), texte).toBe(texte);
    }
  });
});
