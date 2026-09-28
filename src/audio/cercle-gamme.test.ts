// audio/cercle-gamme.test.ts — Une gamme sur un cercle, et ce que le microton y devient.
//
// CE QUE CES CAS TIENNENT. D'abord que les deux tables se rejoignent sans se mélanger : un
// identifiant ne peut pas désigner deux gammes, et les cents deviennent des demi-tons à virgule
// sans perte. Ensuite que le microton survit jusqu'au sommet, puisque c'est la raison d'être de ce
// module : un degré à cent cinquante cents doit ressortir à un demi-ton et demi, et non arrondi.
// Enfin que l'octave étirée du gamelan n'est pas jetée quand on la demande, elle est ce que ces
// gammes ont de plus notable.
import { describe, expect, it } from "vitest";
import { GAMMES } from "./gammes";
import { GAMMES as GAMMES_MONDE } from "./gammes-monde";
import { cercleDeGamme } from "./cercle-gamme";
import {
  GAMMES_REUNIES, degresDUneOctave, degresEnDemiTons, estTemperee,
} from "./gammes-reunies";
import { estCercle } from "./cercle";

const DO4 = 60;

describe("les deux tables réunies", () => {
  it("AUCUN IDENTIFIANT N'EST DANS LES DEUX, sans quoi un choix désignerait deux gammes", () => {
    const temperees = new Set(GAMMES.flatMap((g) => [g.id, ...(g.alias ?? [])]));
    const doubles = GAMMES_MONDE.filter((g) => temperees.has(g.id)).map((g) => g.id);
    expect(doubles).toEqual([]);
  });

  it("LA LISTE OFFERTE PORTE LES DEUX, les tempérées d'abord", () => {
    expect(GAMMES_REUNIES.length).toBe(GAMMES.length + GAMMES_MONDE.length);
    expect(GAMMES_REUNIES.slice(0, GAMMES.length).every((g) => g.temperee)).toBe(true);
    expect(GAMMES_REUNIES.slice(GAMMES.length).some((g) => g.temperee)).toBe(false);
    // L'ordre de chaque moitié est celui de sa table : c'est ce qui rend la résolution par rang sûre.
    expect(GAMMES_REUNIES[0].id).toBe(GAMMES[0].id);
    expect(GAMMES_REUNIES[GAMMES.length].id).toBe(GAMMES_MONDE[0].id);
  });

  it("LES CENTS DEVIENNENT DES DEMI-TONS À VIRGULE, sans arrondi", () => {
    // Le maqam Bayati a sa seconde à cent cinquante cents, entre les deux touches du clavier.
    expect(degresEnDemiTons("bayati")).toEqual([0, 1.5, 3, 5, 7, 8, 10, 12]);
    // Et la tierce du Bhairav est la tierce pure, 386 cents, et non les 400 du piano.
    expect(degresEnDemiTons("bhairav")![2]).toBeCloseTo(3.86, 10);
  });

  it("LES DEGRÉS TEMPÉRÉS SONT CEUX DE LA TABLE COMMUNE, inchangés", () => {
    for (const g of GAMMES) expect(degresEnDemiTons(g.id), g.id).toEqual(g.degres);
    expect(estTemperee("majeur")).toBe(true);
    expect(estTemperee("slendro")).toBe(false);
    expect(degresEnDemiTons("gamme-qui-n-existe-pas")).toBeUndefined();
  });
});

describe("l'octave de fermeture", () => {
  it("SE JETTE PAR DÉFAUT, la place zéro la redisant", () => {
    expect(degresDUneOctave("rast", false)!.length).toBe(7);
    expect(degresDUneOctave("rast", true)!.length).toBe(8);
  });

  it("NE TOUCHE À AUCUNE GAMME TEMPÉRÉE, dont les degrés n'atteignent jamais l'octave", () => {
    for (const g of GAMMES) {
      expect(degresDUneOctave(g.id, false), g.id).toEqual(g.degres);
      expect(degresDUneOctave(g.id, true), g.id).toEqual(g.degres);
    }
  });

  it("GARDÉE, ELLE GARDE L'OCTAVE ÉTIRÉE DU GAMELAN, qui ne vaut pas douze demi-tons", () => {
    const slendro = degresDUneOctave("slendro", true)!;
    expect(slendro[slendro.length - 1]).toBeCloseTo(12.08, 10);
    expect(degresDUneOctave("pelog", true)!.slice(-1)[0]).toBeCloseTo(12.06, 10);
    // Et jetée, elle l'est bien : elle atteint l'octave.
    expect(degresDUneOctave("slendro", false)!.length).toBe(5);
  });
});

describe("le cercle d'une gamme", () => {
  it("UNE PLACE PAR DEGRÉ, ET TOUTES SONNENT", () => {
    const c = cercleDeGamme("majeur", DO4)!;
    expect(estCercle(c)).toBe(true);
    expect(c.positions).toBe(7);
    expect(c.sorte).toBe("hauteur");
    expect(c.sommets.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(c.sommets.map((s) => s.valeur)).toEqual([60, 62, 64, 65, 67, 69, 71]);
  });

  it("LE MICROTON ARRIVE JUSQU'AU SOMMET, et c'est la raison d'être de ce module", () => {
    const c = cercleDeGamme("bayati", DO4)!;
    expect(c.sommets[1].valeur).toBe(61.5);
    expect(Number.isInteger(c.sommets[1].valeur)).toBe(false);
    // Le slendro n'a aucun degré sur une touche, hormis sa tonique.
    const s = cercleDeGamme("slendro", DO4)!;
    expect(s.sommets.filter((x) => Number.isInteger(x.valeur)).length).toBe(1);
  });

  it("LA FONDAMENTALE DÉPLACE TOUT LE CERCLE, et rien d'autre", () => {
    const bas = cercleDeGamme("hijaz", 48)!;
    const haut = cercleDeGamme("hijaz", 60)!;
    expect(haut.sommets.map((s) => s.valeur)).toEqual(bas.sommets.map((s) => s.valeur + 12));
    expect(haut.sommets.map((s) => s.position)).toEqual(bas.sommets.map((s) => s.position));
  });

  it("LES DOUZE DEMI-TONS DESSINENT LA FORME DE LA GAMME", () => {
    const c = cercleDeGamme("majeur", DO4, "chromatique")!;
    expect(c.positions).toBe(12);
    expect(c.sommets.map((s) => s.position)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    // La pentatonique n'allume que cinq places sur les douze : c'est cela, sa forme.
    expect(cercleDeGamme("pentatonique-majeure", DO4, "chromatique")!.sommets.length).toBe(5);
  });

  it("UNE GAMME EN CENTS RETOMBE SUR UNE PLACE PAR DEGRÉ, deux degrés ne pouvant partager une place", () => {
    const c = cercleDeGamme("bayati", DO4, "chromatique")!;
    expect(c.positions).toBe(7);
    expect(new Set(c.sommets.map((s) => s.position)).size).toBe(c.sommets.length);
    expect(estTemperee("bayati")).toBe(false);
  });

  it("CHAQUE GAMME OFFERTE FAIT UN CERCLE VALIDE, dans les deux façons de placer", () => {
    for (const g of GAMMES_REUNIES) {
      for (const places of ["degre", "chromatique"] as const) {
        for (const fermeture of [false, true]) {
          const c = cercleDeGamme(g.id, DO4, places, fermeture);
          expect(estCercle(c), `${g.id} · ${places} · fermeture ${fermeture}`).toBe(true);
          expect(c!.sommets.every((s) => s.position < c!.positions), g.id).toBe(true);
        }
      }
    }
  });

  it("LES VINGT-DEUX SHRUTIS TIENNENT, le cercle en acceptant jusqu'à quarante-huit", () => {
    const c = cercleDeGamme("shruti22", DO4)!;
    expect(c.positions).toBe(22);
    expect(c.sommets.length).toBe(22);
  });

  it("une gamme inconnue ne fabrique pas de cercle", () => {
    expect(cercleDeGamme("gamme-qui-n-existe-pas", DO4)).toBeUndefined();
  });
});
