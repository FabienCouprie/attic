// ui/axe-temps.test.ts — Les règles de l'axe de temps, sur des nombres.
//
// CE QUI NE SE VÉRIFIE PAS À L'ŒIL. Qu'une tête de lecture soit ramenée dans la vue au bon moment et
// au bon endroit ne se voit pas sur un enregistrement de cinquante secondes : on voit qu'elle
// revient, pas qu'elle revient juste. Ces règles sont donc éprouvées ici, et le dessin ailleurs.
import { describe, expect, it } from "vitest";
import {
  ZOOM_MAX, ZOOM_MIN, defilementAncre, defilementPourSuivre, fenetre, tempsDepuisX,
  xDepuisTemps, zoomAjuste, zoomBorne, zoomMolette,
} from "./axe-temps";

describe("le zoom", () => {
  it("a cent pour cent, tout tient dans la largeur", () => {
    expect(zoomAjuste(600, 60, 100)).toBe(10);          // 600 px pour 60 s
    const f = fenetre(600, zoomAjuste(600, 60, 100), 60, 0);
    expect(f.largeurVisible).toBeCloseTo(60, 6);
    expect(f.maxDefilement).toBe(0);                     // rien a faire defiler
  });

  it("a mille pour cent, on voit le dixieme", () => {
    const z = zoomAjuste(600, 60, 1000);
    expect(fenetre(600, z, 60, 0).largeurVisible).toBeCloseTo(6, 6);
  });

  it("ne sort pas de ses bornes, et la molette non plus", () => {
    expect(zoomBorne(10)).toBe(ZOOM_MIN);
    expect(zoomBorne(1e9)).toBe(ZOOM_MAX);
    expect(zoomMolette(100, -1)).toBe(130);              // vers le haut : on rapproche
    expect(zoomMolette(130, 1)).toBe(100);               // et retour
    expect(zoomMolette(ZOOM_MIN, 1)).toBe(ZOOM_MIN);     // on ne va pas sous l'ajustement
    expect(zoomMolette(ZOOM_MAX, -1)).toBe(ZOOM_MAX);
  });

  it("ne rend pas un zoom absurde sur une duree ou une largeur nulle", () => {
    expect(zoomAjuste(0, 60, 100)).toBe(1);
    expect(zoomAjuste(600, 0, 100)).toBe(1);
  });
});

describe("la fenetre visible", () => {
  it("ramene un defilement hors bornes", () => {
    const z = zoomAjuste(600, 60, 200);                  // on voit 30 s
    expect(fenetre(600, z, 60, -5).debutVisible).toBe(0);
    expect(fenetre(600, z, 60, 999).debutVisible).toBeCloseTo(30, 6);
  });

  it("ne montre jamais de vide apres la fin", () => {
    const z = zoomAjuste(600, 60, 200);
    const f = fenetre(600, z, 60, 999);
    expect(f.finVisible).toBeCloseTo(60, 6);
  });
});

describe("l'abscisse et l'instant sont reciproques", () => {
  it("l'un rend l'autre", () => {
    const z = zoomAjuste(600, 60, 400);
    const f = fenetre(600, z, 60, 12);
    for (const s of [12, 13.37, 20, 24]) {
      expect(tempsDepuisX(xDepuisTemps(s, f.debutVisible, z), f.debutVisible, z)).toBeCloseTo(s, 9);
    }
  });
});

describe("le suivi de la tete de lecture", () => {
  const z = zoomAjuste(600, 60, 600);                    // on voit 10 s
  const f = (defilement: number) => fenetre(600, z, 60, defilement);

  it("ne bouge pas tant que la tete est au large du bord", () => {
    expect(defilementPourSuivre(3, f(0))).toBeNull();
    expect(defilementPourSuivre(9.4, f(0))).toBeNull();
  });

  it("rattrape un demi-seconde AVANT le bord droit, pas au bord", () => {
    // La fenetre va de 0 a 10 s : le declenchement est a 9,5 s.
    expect(defilementPourSuivre(9.49, f(0))).toBeNull();
    expect(defilementPourSuivre(9.51, f(0))).not.toBeNull();
  });

  it("ramene la tete a trois dixiemes de la largeur, pas au centre", () => {
    // Tete a 12 s, fenetre de 10 s : le nouveau debut vaut 12 - 3 = 9 s, donc la tete est au tiers.
    expect(defilementPourSuivre(12, f(0))).toBeCloseTo(9, 6);
  });

  it("rattrape aussi vers l'arriere, quand on s'est deplace avant la vue", () => {
    expect(defilementPourSuivre(2, f(20))).toBeCloseTo(0, 6);
  });

  it("ne defile pas au-dela de la fin", () => {
    expect(defilementPourSuivre(59.9, f(0))).toBeCloseTo(50, 6);   // 60 - 10
  });
});

describe("le zoom ancre sur le pointeur", () => {
  it("garde sous le pointeur l'instant qu'on y visait", () => {
    // Vue de 0 a 30 s sur 600 px : le pointeur a 300 px vise 15 s. On grossit au double.
    const avant = zoomAjuste(600, 60, 200);
    const vise = tempsDepuisX(300, 0, avant);
    expect(vise).toBeCloseTo(15, 6);
    const apres = zoomAjuste(600, 60, 400);
    const d = defilementAncre(vise, 300, apres, 600, 60);
    expect(tempsDepuisX(300, d, apres)).toBeCloseTo(15, 6);
  });

  it("ne sort pas des bornes quand on vise le tout debut ou la toute fin", () => {
    const apres = zoomAjuste(600, 60, 400);              // on voit 15 s
    expect(defilementAncre(0.2, 300, apres, 600, 60)).toBe(0);
    expect(defilementAncre(59.8, 300, apres, 600, 60)).toBeCloseTo(45, 6);
  });
});
