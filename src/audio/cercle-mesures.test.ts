// audio/cercle-mesures.test.ts — Les mesures rendent-elles les chiffres publiés ?
//
// CE QUI SE VÉRIFIE ICI. Une mesure de rythme n'a pas de résultat « plausible » : elle rend un
// nombre, et ce nombre est juste ou faux. Là où la littérature en donne un, c'est lui qu'on exige ;
// là où elle n'en donne pas, on tient les invariants qui ne peuvent pas mentir — le maximum atteint
// par le polygone régulier, l'équilibre parfait d'un motif dont le centre de gravité est au centre.
//
// LE CONTRÔLE LE PLUS PARLANT EST CELUI DES QUARANTE-HUIT. Toussaint établit que la somme des arcs
// ne distingue pas les six patrons de clave en quatre temps : tous valent 48. Reproduire ce chiffre
// sur les six, puis montrer que les cordes les séparent, vérifie d'un coup l'implémentation et la
// raison du choix.
import { describe, expect, it } from "vitest";

import type { Cercle } from "./cercle";
import {
  airePolygone, axesDeSymetrie, contretemps, equilibre, grilleCommune, impariteRythmique,
  mesurer, pairesOpposees, periode, regularite, sommeDesArcs,
} from "./cercle-mesures";

/** Un cercle de percussion à partir de ses places. La valeur ne sert à aucune mesure. */
const cercle = (positions: number, places: number[]): Cercle => ({
  positions, sorte: "percussion", sommets: places.map((position) => ({ position, valeur: 38 })),
});

/** Les six patrons fondamentaux en quatre temps, tels que Toussaint les range. */
const CLAVES: Record<string, number[]> = {
  shiko: [0, 4, 6, 10, 12],
  son: [0, 3, 6, 10, 12],
  soukous: [0, 3, 6, 10, 11],
  rumba: [0, 3, 7, 10, 12],
  bossa: [0, 3, 6, 10, 13],
  gahu: [0, 3, 6, 10, 14],
};

/** Le motif aka, exemple canonique de l'imparité rythmique : durées 3 2 2 2 2 3 2 2 2 2 2. */
const AKA = [0, 3, 5, 7, 9, 11, 14, 16, 18, 20, 22];

describe("la régularité", () => {
  it("LES SIX CLAVES DONNENT TOUTES QUARANTE-HUIT EN ARCS, ce qui est le chiffre publié", () => {
    for (const [nom, places] of Object.entries(CLAVES)) {
      expect(sommeDesArcs(places, 16), nom).toBe(48);
    }
  });

  it("ET LES CORDES LES SÉPARENT : c'est pour cela qu'on les emploie", () => {
    const valeurs = Object.values(CLAVES).map((p) => regularite(p, 16));
    expect(new Set(valeurs.map((v) => v.toFixed(6))).size).toBeGreaterThan(1);
  });

  it("LE POLYGONE RÉGULIER VAUT UN, et c'est la définition du maximum", () => {
    expect(regularite([0, 4, 8], 12)).toBeCloseTo(1, 10);
    expect(regularite([0, 4, 8, 12], 16)).toBeCloseTo(1, 10);
    expect(regularite([0, 6], 12)).toBeCloseTo(1, 10);
  });

  it("un motif tassé d'un côté est moins régulier qu'un motif étalé", () => {
    expect(regularite([0, 1, 2, 3], 16)).toBeLessThan(regularite([0, 4, 8, 12], 16));
  });

  it("moins de deux attaques n'ont pas de régularité, et ne font pas diviser par zéro", () => {
    expect(regularite([], 16)).toBe(0);
    expect(regularite([5], 16)).toBe(0);
  });
});

describe("l'équilibre", () => {
  it("UN POLYGONE RÉGULIER EST PARFAITEMENT ÉQUILIBRÉ", () => {
    expect(equilibre([0, 4, 8], 12)).toBeCloseTo(1, 10);
    expect(equilibre([0, 8], 16)).toBeCloseTo(1, 10);
  });

  it("LA SOMME DE DEUX POLYGONES RÉGULIERS L'EST AUSSI, et c'est le théorème de Milne", () => {
    // Un triangle et une paire, posés sur le même cycle de douze : chacun a son centre de gravité
    // au centre, donc leur réunion aussi. Ce motif est équilibré sans être régulier.
    const motif = [0, 4, 8, 1, 7];
    expect(equilibre(motif, 12)).toBeCloseTo(1, 10);
    expect(regularite(motif, 12)).toBeLessThan(0.99);
  });

  it("une attaque seule est le pire déséquilibre", () => {
    expect(equilibre([3], 16)).toBeCloseTo(0, 10);
  });

  it("deux attaques voisines sont moins équilibrées que deux opposées", () => {
    expect(equilibre([0, 1], 16)).toBeLessThan(equilibre([0, 8], 16));
  });
});

describe("l'imparité rythmique", () => {
  it("LE MOTIF AKA L'A, et c'est l'exemple canonique d'Arom", () => {
    expect(impariteRythmique(AKA, 24)).toBe(true);
    expect(pairesOpposees(AKA, 24)).toBe(0);
  });

  it("le son l'a aussi", () => {
    expect(impariteRythmique(CLAVES.son, 16)).toBe(true);
  });

  it("UNE PAIRE OPPOSÉE SUFFIT À LA PERDRE", () => {
    expect(impariteRythmique([0, 3, 8], 16)).toBe(false);
    expect(pairesOpposees([0, 3, 8], 16)).toBe(1);
  });

  it("sur un cycle impair elle tient toujours, faute d'opposées", () => {
    expect(impariteRythmique([0, 1, 2], 7)).toBe(true);
    expect(pairesOpposees([0, 1, 2], 7)).toBe(0);
  });
});

describe("les contretemps", () => {
  it("SUR SEIZE, CE SONT LES PLACES IMPAIRES", () => {
    expect(contretemps([1, 3, 5], 16)).toBe(3);
    expect(contretemps([0, 2, 4, 8], 16)).toBe(0);
  });

  it("sur douze, ce sont 1, 5, 7 et 11", () => {
    expect(contretemps([1, 5, 7, 11], 12)).toBe(4);
    expect(contretemps([0, 2, 3, 4, 6, 8, 9, 10], 12)).toBe(0);
  });

  it("la place zéro n'est jamais à contretemps", () => {
    expect(contretemps([0], 16)).toBe(0);
  });
});

describe("l'aire du polygone", () => {
  it("LE POLYGONE RÉGULIER VAUT UN", () => {
    expect(airePolygone([0, 4, 8], 12)).toBeCloseTo(1, 10);
    expect(airePolygone([0, 4, 8, 12], 16)).toBeCloseTo(1, 10);
  });

  it("un polygone aplati a une aire presque nulle", () => {
    expect(airePolygone([0, 1, 2], 48)).toBeLessThan(0.02);
  });

  it("moins de trois sommets ne font pas de polygone", () => {
    expect(airePolygone([0, 8], 16)).toBe(0);
    expect(airePolygone([], 16)).toBe(0);
  });
});

describe("les symétries et la période", () => {
  it("UN POLYGONE RÉGULIER A AUTANT D'AXES QUE DE SOMMETS", () => {
    expect(axesDeSymetrie([0, 4, 8], 12)).toHaveLength(3);
    expect(axesDeSymetrie([0, 6], 12)).toHaveLength(2);
  });

  it("un motif quelconque peut n'en avoir aucun", () => {
    expect(axesDeSymetrie([0, 1, 5], 16)).toHaveLength(0);
  });

  it("LA PÉRIODE DIT QU'UN MOTIF SE RÉPÈTE À L'INTÉRIEUR DE SON CYCLE", () => {
    // Quatre contre deux n'est pas plus riche que deux contre un : c'est le même, deux fois.
    expect(periode([0, 4, 8, 12], 16)).toBe(4);
    expect(periode([0, 8], 16)).toBe(8);
  });

  it("un motif qui ne se répète pas a pour période son cycle entier", () => {
    expect(periode(CLAVES.son, 16)).toBe(16);
    expect(periode(AKA, 24)).toBe(24);
  });
});

describe("le relevé complet", () => {
  it("rend toutes les mesures d'un coup, et des nombres finis", () => {
    const m = mesurer(cercle(16, CLAVES.son));
    expect(m.positions).toBe(16);
    expect(m.attaques).toBe(5);
    expect(m.sommeDesArcs).toBe(48);
    expect(m.imparite).toBe(true);
    for (const v of [m.regularite, m.equilibre, m.aire]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("UN CERCLE VIDE NE PRODUIT AUCUN NOMBRE INVALIDE", () => {
    const m = mesurer(cercle(16, []));
    for (const v of [m.regularite, m.equilibre, m.aire]) expect(Number.isFinite(v)).toBe(true);
    expect(m.attaques).toBe(0);
  });

  it("les doublons de place ne comptent qu'une fois", () => {
    const double: Cercle = {
      positions: 8, sorte: "percussion",
      sommets: [0, 0, 3, 3, 6].map((position) => ({ position, valeur: 38 })),
    };
    expect(mesurer(double).attaques).toBe(3);
  });
});

describe("la grille commune", () => {
  it("SEIZE ET DOUZE DONNENT QUARANTE-HUIT, et les places s'y projettent", () => {
    const g = grilleCommune([cercle(16, [0, 8]), cercle(12, [0, 6])]);
    expect(g!.positions).toBe(48);
    // 0 et 8 sur seize deviennent 0 et 24 ; 0 et 6 sur douze deviennent 0 et 24 aussi.
    expect(g!.places).toEqual([0, 24]);
  });

  it("les deux cercles se mêlent sans doublon", () => {
    const g = grilleCommune([cercle(4, [0, 1]), cercle(2, [1])]);
    expect(g!.positions).toBe(4);
    expect(g!.places).toEqual([0, 1, 2]);
  });

  it("ELLE REFUSE PLUTÔT QUE DE FAIRE ATTENDRE quand le produit explose", () => {
    expect(grilleCommune([cercle(47, [0]), cercle(43, [0]), cercle(41, [0])])).toBeNull();
  });

  it("sans cercle valide, il n'y a pas de grille", () => {
    expect(grilleCommune([])).toBeNull();
  });
});
