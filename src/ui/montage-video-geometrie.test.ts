// ui/montage-video-geometrie.test.ts — Un son posé à côté du plan n'a pas d'autre garde-fou.
import { describe, it, expect } from "vitest";
import {
  formatTemps, imageApresDeplacement, imageDepuisSecondesCalee, rectDeBande, secondesDepuisX,
} from "./montage-video-geometrie";

const X0 = 30;
const LARGEUR = 400;
const FILM = 100; // secondes

describe("place d'une bande sur l'axe du film", () => {
  it("une bande qui commence au début part de l'origine de l'axe", () => {
    expect(rectDeBande({ debutSec: 0, dureeSec: 50 }, FILM, X0, LARGEUR))
      .toEqual({ x: 30, largeur: 200, deborde: false });
  });

  it("une bande posée au milieu commence au milieu", () => {
    expect(rectDeBande({ debutSec: 50, dureeSec: 25 }, FILM, X0, LARGEUR))
      .toEqual({ x: 230, largeur: 100, deborde: false });
  });

  it("une bande qui dépasse la fin est coupée à la fin, et le dit", () => {
    const r = rectDeBande({ debutSec: 90, dureeSec: 30 }, FILM, X0, LARGEUR);
    expect(r.x).toBe(390);
    expect(r.x + r.largeur).toBe(X0 + LARGEUR);
    expect(r.deborde).toBe(true);
  });

  it("une bande d'une durée nulle garde un pixel, sinon elle disparaîtrait", () => {
    expect(rectDeBande({ debutSec: 10, dureeSec: 0 }, FILM, X0, LARGEUR).largeur).toBe(1);
  });

  it("une piste de durée inconnue devient un repère assez large pour être pris", () => {
    // Avant la première exécution, la durée d'une piste n'est pas connue : sans largeur minimale,
    // sa bande ferait un pixel et ne se déplacerait jamais à la souris.
    expect(rectDeBande({ debutSec: 10, dureeSec: 0 }, FILM, X0, LARGEUR, 10).largeur).toBe(10);
    // Une piste connue n'est pas élargie pour autant : sa durée reste sa durée.
    expect(rectDeBande({ debutSec: 10, dureeSec: 50 }, FILM, X0, LARGEUR, 10).largeur).toBe(200);
  });
});

describe("lecture inverse : de l'abscisse à l'instant", () => {
  it("le milieu de l'axe est le milieu du film", () => {
    expect(secondesDepuisX(X0 + LARGEUR / 2, X0, LARGEUR, FILM)).toBe(50);
  });

  it("à gauche de l'axe et à droite, on reste dans le film", () => {
    expect(secondesDepuisX(0, X0, LARGEUR, FILM)).toBe(0);
    expect(secondesDepuisX(10_000, X0, LARGEUR, FILM)).toBe(FILM);
  });
});

describe("instant vers image", () => {
  it("une image n'est pas un trentième de seconde", () => {
    // À 30000/1001, l'image mille tombe à 33,3667 s : c'est l'écart que le composant existe pour
    // ne pas commettre.
    expect(imageDepuisSecondesCalee(33.3667, 30000 / 1001, 600)).toBe(1000);
    expect(imageDepuisSecondesCalee(33.3667, 30, 600)).toBe(1001);
  });

  it("l'arrondi va à l'image la plus proche, et non vers le bas", () => {
    expect(imageDepuisSecondesCalee(0.51 / 25 + 10 / 25, 25, 600)).toBe(11);
  });

  it("on ne pose rien avant le début ni après la dernière image", () => {
    expect(imageDepuisSecondesCalee(-5, 25, 100)).toBe(0);
    expect(imageDepuisSecondesCalee(500, 25, 100)).toBe(2500);
  });
});

describe("déplacement d'une bande", () => {
  it("la bande suit le curseur, et non son propre début", () => {
    // Bande commençant à 20 s, prise à 60 s (en son milieu), relâchée 40 s plus loin.
    const xPrise = X0 + (60 / FILM) * LARGEUR;
    const xLache = X0 + (80 / FILM) * LARGEUR;
    expect(imageApresDeplacement(20, xPrise, xLache, X0, LARGEUR, FILM, 25)).toBe(40 * 25);
  });

  it("une bande tirée vers la gauche s'arrête au début du film", () => {
    const xPrise = X0 + (10 / FILM) * LARGEUR;
    expect(imageApresDeplacement(5, xPrise, 0, X0, LARGEUR, FILM, 25)).toBe(0);
  });
});

describe("temps affiché", () => {
  it("se lit en minutes, secondes et centièmes", () => {
    expect(formatTemps(0)).toBe("0:00.00");
    expect(formatTemps(9.5)).toBe("0:09.50");
    expect(formatTemps(75.25)).toBe("1:15.25");
    expect(formatTemps(-1)).toBe("0:00.00");
  });
});
