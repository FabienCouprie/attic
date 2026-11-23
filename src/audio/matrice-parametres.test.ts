// audio/matrice-parametres.test.ts — Une ligne par paramètre, cent événements d'un coup.
//
// CE QUI SE VÉRIFIE ICI EST UNE RÈGLE DE COMPLÉTION, et c'est tout l'objet de la structure. Écrire
// trois fréquences pour cent partiels doit en donner cent, et la façon dont les quatre-vingt-dix-
// sept manquantes sont trouvées décide de ce qu'on entend : répéter la dernière ne dit rien de plus
// que ce qui a été écrit, boucler la liste fabriquerait une périodicité que personne n'a demandée.
import { describe, expect, it } from "vitest";

import {
  combienDEvenements, construireMatrice, deployer, etendre, lireChamp, matriceVersPartition,
  type Champ, type Colonne,
} from "./matrice-parametres";

/** La forme d'un champ qui se lit ; un refus fait tomber le test qui l'écrit. */
function champ(texte: string): Champ | null {
  const l = lireChamp(texte);
  if ("refus" in l) throw new Error(`« ${texte} » refusé sur « ${l.refus} »`);
  return l.champ;
}

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
    expect(champ("440")).toEqual({ forme: "liste", valeurs: [440] });
    expect(deployer(champ("440")!, 3)).toEqual([440, 440, 440]);
  });

  it("UNE SUITE DONNE SES VALEURS, puis se complète", () => {
    expect(deployer(champ("440 550 660")!, 5)).toEqual([440, 550, 660, 660, 660]);
  });

  it("DEUX NOMBRES SÉPARÉS PAR DEUX POINTS FONT UNE RAMPE", () => {
    expect(deployer(champ("100:500")!, 5)).toEqual([100, 200, 300, 400, 500]);
  });

  it("LA RAMPE ATTEINT SON ARRIVÉE, et ne s'arrête pas avant", () => {
    const v = deployer(champ("0:1")!, 4);
    expect(v[0]).toBe(0);
    expect(v[v.length - 1]).toBe(1);
  });

  it("à un seul événement, la rampe vaut son départ", () => {
    expect(deployer(champ("100:500")!, 1)).toEqual([100]);
  });

  it("une rampe descendante descend", () => {
    expect(deployer(champ("500:100")!, 3)).toEqual([500, 300, 100]);
  });

  it("les séparateurs ordinaires sont admis", () => {
    expect(champ("1, 2; 3")).toEqual({ forme: "liste", valeurs: [1, 2, 3] });
  });

  it("UN CHAMP VIDE N'EST PAS UN ZÉRO, et se distingue", () => {
    expect(champ("")).toBeNull();
    expect(champ("   ")).toBeNull();
    expect(champ("0")).toEqual({ forme: "liste", valeurs: [0] });
  });

  it("UN CHAMP ILLISIBLE EST REFUSÉ, et le refus nomme ce qui ne se lit pas", () => {
    // Ce test tenait le contraire : « abc » rendait `null`, comme un champ vide, et la Matrice n'écrivait
    // pas le champ, sans un mot. Décision de Fabien du 2026-11-22, « Refuse it, named », revue des
    // notations en texte.
    expect(lireChamp("abc")).toEqual({ refus: "abc" });
    expect(lireChamp("200 abc 300")).toEqual({ refus: "abc" });
    expect(lireChamp("0x10")).toEqual({ refus: "0x10" });
    expect(lireChamp("200~2000")).toEqual({ refus: "200~2000" });
    expect(lireChamp("1:2:3")).toEqual({ refus: "1:2:3" });
  });
});

describe("le nombre d'événements", () => {
  it("EST CELUI DE LA PLUS LONGUE LISTE", () => {
    expect(combienDEvenements([champ("1"), champ("1 2 3 4"), champ("1 2")])).toBe(4);
  });

  it("NE SE DÉDUIT PAS D'UNE RAMPE, qui s'étire à toute longueur", () => {
    expect(combienDEvenements([champ("0:1")])).toBe(0);
  });

  it("est nul quand tout est constante : la matrice ne l'invente pas", () => {
    expect(combienDEvenements([champ("440"), champ("0.5")])).toBe(1);
    expect(combienDEvenements([])).toBe(0);
  });
});

describe("la matrice", () => {
  const colonnes: Colonne[] = [
    { rang: 5, nom: "fréquence", champ: champ("100:400")! },
    { rang: 4, nom: "amplitude", champ: champ("0.5 0.25")! },
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
    const m = construireMatrice([{ rang: 4, nom: "amp", champ: champ("0.5")! }], 2);
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
      { rang: 4, nom: "amp", champ: champ("0.3")! },
      { rang: 5, nom: "freq", champ: champ("100:5000")! },
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
