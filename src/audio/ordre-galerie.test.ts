// audio/ordre-galerie.test.ts — L'ordre d'accrochage suit-il vraiment les coordonnées ?
import { describe, expect, it } from "vitest";
import { lirePoints, ordonnerParCoordonnees, type PointClasse } from "./ordre-galerie";

const f = (nom: string, chemin = `C:/mus/${nom}`) => ({ nom, chemin });
const p = (nom: string, x: number, y: number, chemin = `C:/mus/${nom}`): PointClasse => ({ nom, chemin, x, y });

describe("lirePoints", () => {
  it("lit la sortie de la classification", () => {
    const pts = lirePoints(JSON.stringify([{ nom: "a.mp3", chemin: "C:/mus/a.mp3", x: 1.5, y: -2 }]));
    expect(pts).toEqual([{ nom: "a.mp3", chemin: "C:/mus/a.mp3", x: 1.5, y: -2 }]);
  });

  it("ne rend rien plutôt que de lever, sur une entrée qui n'est pas ce qu'on attend", () => {
    // Une entrée facultative mal remplie ne doit pas emp\u00eacher la galerie de se construire.
    for (const mauvais of ["", "   ", "pas du json", "{}", "42", "[1, 2, 3]", null, undefined]) {
      expect(lirePoints(mauvais as string)).toEqual([]);
    }
  });

  it("\u00e9carte les points dont les coordonn\u00e9es ne sont pas des nombres", () => {
    const pts = lirePoints(JSON.stringify([
      { nom: "bon.mp3", chemin: "x", x: 0, y: 0 },
      { nom: "sans.mp3", chemin: "y" },
      { nom: "nan.mp3", chemin: "z", x: "haut", y: 3 },
    ]));
    expect(pts.map((q) => q.nom)).toEqual(["bon.mp3"]);
  });
});

describe("ordonnerParCoordonnees", () => {
  const fichiers = [f("c.mp3"), f("a.mp3"), f("b.mp3")];

  it("sans coordonn\u00e9es, ou en mode dossier, l'ordre du dossier est gard\u00e9", () => {
    expect(ordonnerParCoordonnees(fichiers, [], "xy").pistes.map((x) => x.nom))
      .toEqual(["c.mp3", "a.mp3", "b.mp3"]);
    const pts = [p("a.mp3", 0, 0), p("b.mp3", 1, 1), p("c.mp3", 2, 2)];
    expect(ordonnerParCoordonnees(fichiers, pts, "dossier").pistes.map((x) => x.nom))
      .toEqual(["c.mp3", "a.mp3", "b.mp3"]);
  });

  it("range par X, puis par Y", () => {
    const pts = [p("c.mp3", 3, 0), p("a.mp3", 1, 9), p("b.mp3", 2, 5)];
    const r = ordonnerParCoordonnees(fichiers, pts, "xy");
    expect(r.pistes.map((x) => x.nom)).toEqual(["a.mp3", "b.mp3", "c.mp3"]);
    expect(r).toMatchObject({ placees: 3, restantes: 0 });
  });

  it("range par Y, puis par X \u2014 l'autre axe m\u00e8ne", () => {
    const pts = [p("c.mp3", 3, 0), p("a.mp3", 1, 9), p("b.mp3", 2, 5)];
    expect(ordonnerParCoordonnees(fichiers, pts, "yx").pistes.map((x) => x.nom))
      .toEqual(["c.mp3", "b.mp3", "a.mp3"]);
  });

  it("le second axe d\u00e9partage les ex \u00e6quo du premier", () => {
    const trois = [f("x.mp3"), f("y.mp3"), f("z.mp3")];
    const pts = [p("x.mp3", 1, 30), p("y.mp3", 1, 10), p("z.mp3", 1, 20)];
    expect(ordonnerParCoordonnees(trois, pts, "xy").pistes.map((x) => x.nom))
      .toEqual(["y.mp3", "z.mp3", "x.mp3"]);
  });

  it("\u00e0 coordonn\u00e9es rigoureusement \u00e9gales, l'ordre du dossier tranche", () => {
    // Sans cela, deux ex\u00e9cutions pourraient accrocher la m\u00eame collection dans deux ordres.
    const trois = [f("premier.mp3"), f("second.mp3"), f("tiers.mp3")];
    const pts = [p("tiers.mp3", 0, 0), p("second.mp3", 0, 0), p("premier.mp3", 0, 0)];
    expect(ordonnerParCoordonnees(trois, pts, "xy").pistes.map((x) => x.nom))
      .toEqual(["premier.mp3", "second.mp3", "tiers.mp3"]);
  });

  it("UNE PISTE SANS COORDONN\u00c9ES N'EST PAS PERDUE : elle passe \u00e0 la fin", () => {
    // Une galerie amput\u00e9e de ce que la classification n'a pas vu serait le pire des r\u00e9sultats,
    // puisque rien \u00e0 l'\u00e9cran ne dirait qu'il en manque.
    const quatre = [f("c.mp3"), f("inconnue.mp3"), f("a.mp3"), f("autre.mp3")];
    const pts = [p("a.mp3", 1, 0), p("c.mp3", 2, 0)];
    const r = ordonnerParCoordonnees(quatre, pts, "xy");
    expect(r.pistes.map((x) => x.nom)).toEqual(["a.mp3", "c.mp3", "inconnue.mp3", "autre.mp3"]);
    expect(r).toMatchObject({ placees: 2, restantes: 2 });
  });

  it("apparie sur le chemin, et se rabat sur le nom", () => {
    // La classification a pu travailler sur une copie du dossier, \u00e0 un autre endroit du disque.
    const ailleurs = [p("a.mp3", 5, 0, "D:/copie/a.mp3"), p("b.mp3", 1, 0, "D:/copie/b.mp3")];
    const deux = [f("a.mp3"), f("b.mp3")];
    expect(ordonnerParCoordonnees(deux, ailleurs, "xy").pistes.map((x) => x.nom))
      .toEqual(["b.mp3", "a.mp3"]);
  });

  it("les s\u00e9parateurs de chemin ne d\u00e9cident de rien", () => {
    const deux = [{ nom: "a.mp3", chemin: "C:\\mus\\a.mp3" }, { nom: "b.mp3", chemin: "C:\\mus\\b.mp3" }];
    const pts = [p("b.mp3", 1, 0, "C:/mus/b.mp3"), p("a.mp3", 2, 0, "C:/mus/a.mp3")];
    const r = ordonnerParCoordonnees(deux, pts, "xy");
    expect(r.pistes.map((x) => x.nom)).toEqual(["b.mp3", "a.mp3"]);
    expect(r.placees).toBe(2);
  });

  it("ne perd ni ne duplique aucune piste, quel que soit le sens", () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) => f(`p${i}.mp3`));
    const pts = beaucoup.slice(0, 20).map((x, i) => p(x.nom, (i * 7) % 20, (i * 3) % 20));
    for (const sens of ["dossier", "xy", "yx"] as const) {
      const r = ordonnerParCoordonnees(beaucoup, pts, sens);
      expect(r.pistes).toHaveLength(30);
      expect(new Set(r.pistes.map((x) => x.nom)).size).toBe(30);
    }
  });
});
