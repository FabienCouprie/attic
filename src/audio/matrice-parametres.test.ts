// audio/matrice-parametres.test.ts — Une ligne par paramètre, cent événements d'un coup.
//
// CE QUI SE VÉRIFIE ICI EST UNE RÈGLE DE COMPLÉTION, et c'est tout l'objet de la structure. Écrire
// trois fréquences pour cent partiels doit en donner cent, et la façon dont les quatre-vingt-dix-
// sept manquantes sont trouvées décide de ce qu'on entend : répéter la dernière ne dit rien de plus
// que ce qui a été écrit, boucler la liste fabriquerait une périodicité que personne n'a demandée.
import { describe, expect, it } from "vitest";

import {
  combienDEvenements, construireMatrice, deployer, etendre, lireChamp, matriceVersPartition,
  type Colonne,
} from "./matrice-parametres";

describe("la complétion d'une liste", () => {
  it("RÉPÈTE LA DERNIÈRE VALEUR, elle ne boucle pas", () => {
    expect(etendre([1, 2, 3], 6)).toEqual([1, 2, 3, 3, 3, 3]);
  });

  it("TRONQUE CE QUI DÉPASSE, pour que toutes les lignes aient la même longueur", () => {
    expect(etendre([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3]);
  });

  it("une seule valeur vaut pour tous", () => {
    expect(etendre([440], 4)).toEqual([440, 440, 440, 440]);
  });

  it("une liste vide donne des zéros plutôt que rien", () => {
    expect(etendre([], 3)).toEqual([0, 0, 0]);
  });

  it("zéro événement ne donne rien", () => {
    expect(etendre([1, 2], 0)).toEqual([]);
  });
});

describe("les trois façons d'écrire un champ", () => {
  it("UN NOMBRE SEUL VAUT POUR TOUS", () => {
    expect(lireChamp("440")).toEqual({ forme: "liste", valeurs: [440] });
    expect(deployer(lireChamp("440")!, 3)).toEqual([440, 440, 440]);
  });

  it("UNE SUITE DONNE SES VALEURS, puis se complète", () => {
    expect(deployer(lireChamp("440 550 660")!, 5)).toEqual([440, 550, 660, 660, 660]);
  });

  it("DEUX NOMBRES SÉPARÉS PAR DEUX POINTS FONT UNE RAMPE", () => {
    expect(deployer(lireChamp("100:500")!, 5)).toEqual([100, 200, 300, 400, 500]);
  });

  it("LA RAMPE ATTEINT SON ARRIVÉE, et ne s'arrête pas avant", () => {
    const v = deployer(lireChamp("0:1")!, 4);
    expect(v[0]).toBe(0);
    expect(v[v.length - 1]).toBe(1);
  });

  it("à un seul événement, la rampe vaut son départ", () => {
    expect(deployer(lireChamp("100:500")!, 1)).toEqual([100]);
  });

  it("une rampe descendante descend", () => {
    expect(deployer(lireChamp("500:100")!, 3)).toEqual([500, 300, 100]);
  });

  it("les séparateurs ordinaires sont admis", () => {
    expect(lireChamp("1, 2; 3")).toEqual({ forme: "liste", valeurs: [1, 2, 3] });
  });

  it("UN CHAMP VIDE OU ILLISIBLE N'EST PAS UN ZÉRO, et se distingue", () => {
    expect(lireChamp("")).toBeNull();
    expect(lireChamp("   ")).toBeNull();
    expect(lireChamp("abc")).toBeNull();
    expect(lireChamp("0")).toEqual({ forme: "liste", valeurs: [0] });
  });
});

describe("le nombre d'événements", () => {
  it("EST CELUI DE LA PLUS LONGUE LISTE", () => {
    expect(combienDEvenements([lireChamp("1"), lireChamp("1 2 3 4"), lireChamp("1 2")])).toBe(4);
  });

  it("NE SE DÉDUIT PAS D'UNE RAMPE, qui s'étire à toute longueur", () => {
    expect(combienDEvenements([lireChamp("0:1")])).toBe(0);
  });

  it("est nul quand tout est constante : la matrice ne l'invente pas", () => {
    expect(combienDEvenements([lireChamp("440"), lireChamp("0.5")])).toBe(1);
    expect(combienDEvenements([])).toBe(0);
  });
});

describe("la matrice", () => {
  const colonnes: Colonne[] = [
    { rang: 5, nom: "fréquence", champ: lireChamp("100:400")! },
    { rang: 4, nom: "amplitude", champ: lireChamp("0.5 0.25")! },
  ];

  it("RANGE LES COLONNES PAR LEUR RANG, non par l'ordre où on les a écrites", () => {
    const m = construireMatrice(colonnes, 4);
    expect(m.rangs).toEqual([4, 5]);
    // p4 d'abord, l'amplitude, puis p5, la fréquence.
    expect(m.lignes[0]).toEqual([0.5, 100]);
    expect(m.lignes[3]).toEqual([0.25, 400]);
  });

  it("UNE LIGNE PAR ÉVÉNEMENT, toutes de même longueur", () => {
    const m = construireMatrice(colonnes, 7);
    expect(m.lignes).toHaveLength(7);
    for (const l of m.lignes) expect(l).toHaveLength(2);
  });

  it("sans colonne, il reste les événements et pas de champ", () => {
    const m = construireMatrice([], 3);
    expect(m.combien).toBe(3);
    expect(m.lignes).toEqual([[], [], []]);
  });
});

describe("la partition écrite", () => {
  it("SUIT LE FORMAT DE CSOUND : instrument, départ, durée, puis les champs", () => {
    const m = construireMatrice([{ rang: 4, nom: "amp", champ: lireChamp("0.5")! }], 2);
    const texte = matriceVersPartition([0, 1], [0.5, 0.5], m, { instrument: 3, decimales: 2 });
    expect(texte.split("\n")).toEqual(["i3 0.00 0.50 0.50", "i3 1.00 0.50 0.50"]);
  });

  it("L'EN-TÊTE EST MISE EN COMMENTAIRE, pour que Csound la lise sans broncher", () => {
    const m = construireMatrice([], 1);
    const texte = matriceVersPartition([0], [1], m, { entete: ["200 partiels"] });
    expect(texte.split("\n")[0]).toBe("; 200 partiels");
  });

  it("un départ ou une durée manquants valent zéro plutôt que de casser la ligne", () => {
    const m = construireMatrice([], 2);
    expect(matriceVersPartition([0], [], m, { decimales: 1 }).split("\n"))
      .toEqual(["i1 0.0 0.0", "i1 0.0 0.0"]);
  });

  it("CENT ÉVÉNEMENTS S'ÉCRIVENT DE TROIS CHAMPS, ce qui est tout l'intérêt", () => {
    const colonnes: Colonne[] = [
      { rang: 4, nom: "amp", champ: lireChamp("0.3")! },
      { rang: 5, nom: "freq", champ: lireChamp("100:5000")! },
    ];
    const m = construireMatrice(colonnes, 100);
    const debuts = Array.from({ length: 100 }, (_, i) => i * 0.01);
    const texte = matriceVersPartition(debuts, new Array(100).fill(2), m, { decimales: 3 });
    const lignes = texte.split("\n");
    expect(lignes).toHaveLength(100);
    expect(lignes[0]).toBe("i1 0.000 2.000 0.300 100.000");
    expect(lignes[99]).toBe("i1 0.990 2.000 0.300 5000.000");
  });
});
