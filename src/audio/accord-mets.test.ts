// audio/accord-mets.test.ts — Un profil de dégustation tombe-t-il où il doit dans l'espace des goûts ?
import { describe, expect, it } from "vitest";
import { goutDominant, instrumentPublie, pointDepuisDegustation, type ProfilDegustation } from "./accord-mets";
import { REGIONS, profil, type Gout } from "./gout";

const p = (sucre: number, acide: number, amer: number, sale: number): ProfilDegustation =>
  ({ "sucré": sucre, acide, amer, "salé": sale });

describe("pointDepuisDegustation", () => {
  it("un profil qui n'a qu'un goût tombe EXACTEMENT sur sa région", () => {
    // C'est la propriété qui rend le nœud vérifiable : demander le sucré seul, c'est viser le point
    // que la littérature donne pour le sucré, sans intermédiaire.
    for (const gout of ["sucré", "acide", "amer", "salé"] as Gout[]) {
      const profilUnique = p(0, 0, 0, 0);
      profilUnique[gout] = 100;
      expect(pointDepuisDegustation(profilUnique)).toEqual(REGIONS[gout]);
    }
  });

  it("et son profil de goût met bien ce goût-là en premier", () => {
    for (const gout of ["sucré", "acide", "amer", "salé"] as Gout[]) {
      const profilUnique = p(0, 0, 0, 0);
      profilUnique[gout] = 100;
      const parts = profil(pointDepuisDegustation(profilUnique)!);
      expect(parts[0].gout, gout).toBe(gout);
    }
  });

  it("un profil mélangé tombe entre les régions, et n'appartient donc à aucune", () => {
    const milieu = pointDepuisDegustation(p(50, 50, 50, 50))!;
    for (const gout of ["sucré", "acide", "amer", "salé"] as Gout[]) {
      expect(milieu).not.toEqual(REGIONS[gout]);
    }
    // Les quatre parts sont alors proches les unes des autres : la musique est neutre, et le nœud
    // n'a pas à prétendre le contraire.
    const parts = profil(milieu).map((x) => x.part);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThan(0.35);
  });

  it("l'échelle des intensités ne change rien, seules leurs proportions comptent", () => {
    expect(pointDepuisDegustation(p(80, 20, 0, 0))).toEqual(pointDepuisDegustation(p(8, 2, 0, 0)));
  });

  it("deux goûts à parts égales donnent le milieu de leurs deux régions", () => {
    const point = pointDepuisDegustation(p(100, 0, 100, 0))!;
    expect(point.hauteur).toBeCloseTo((REGIONS["sucré"].hauteur + REGIONS["amer"].hauteur) / 2, 10);
  });

  it("rien à goûter, rien à accorder", () => {
    expect(pointDepuisDegustation(p(0, 0, 0, 0))).toBeNull();
    expect(pointDepuisDegustation(p(-5, 0, 0, 0))).toBeNull(); // une valeur négative ne compte pas
  });
});

describe("goutDominant", () => {
  it("nomme le goût le plus intense et sa part du profil", () => {
    expect(goutDominant(p(60, 20, 20, 0))).toEqual({ gout: "sucré", part: 0.6 });
    expect(goutDominant(p(10, 10, 80, 0))?.gout).toBe("amer");
  });

  it("rend null sur un profil vide", () => {
    expect(goutDominant(p(0, 0, 0, 0))).toBeNull();
  });
});

describe("instrumentPublie", () => {
  it("donne ce que la littérature donne : le piano au sucré, le trombone à l'amer et à l'acide", () => {
    expect(instrumentPublie("sucré")).toMatchObject({ nom: "piano", publie: true });
    expect(instrumentPublie("amer")).toMatchObject({ nom: "trombone", publie: true });
    expect(instrumentPublie("acide")).toMatchObject({ nom: "trombone", publie: true });
  });

  it("et avoue que pour le salé elle ne donne rien", () => {
    expect(instrumentPublie("salé").publie).toBe(false);
  });

  it("tous les programmes sont des programmes General MIDI valides", () => {
    for (const gout of ["sucré", "acide", "amer", "salé"] as Gout[]) {
      const i = instrumentPublie(gout);
      expect(i.programme).toBeGreaterThanOrEqual(0);
      expect(i.programme).toBeLessThanOrEqual(127);
    }
  });
});
