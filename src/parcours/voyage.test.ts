// parcours/voyage.test.ts — La mémoire du voyage, et l'ordre proposé.
//
// LE TEST QUI COMPTE EST CELUI DU CHAMP ABÎMÉ. Ce qui est accompli vit dans un champ de texte que
// l'utilisateur peut ouvrir, modifier, vider ou remplir de n'importe quoi — c'est le prix d'un
// état sauvegardé avec le projet. La lecture doit donc encaisser les espaces, les points-virgules
// et les lignes vides sans jamais faire lever, sous peine de rendre un projet impossible à rouvrir
// à cause d'une virgule.
//
// LE SECOND : LE VOYAGE TERMINÉ NE MONTRE PAS UN ÉCRAN VIDE. Le rang courant rend le dernier
// exercice quand tout est accompli, et non « rien » — un écran blanc au bout d'un parcours
// ressemble à une panne, pas à une fin.
import { describe, expect, it } from "vitest";
import { bilan, chapitresDu, ecrireProgres, exercicesDu, lireProgres, noter, oublier, prochainTitre, rangCourant, titreGagne, TITRES } from "./voyage";
import type { Chapitre, Exercice } from "./types";

const CHAPITRES: Chapitre[] = [
  { id: "un", titre: "Un", titreEn: "One", promesse: "p", promesseEn: "p" },
  { id: "deux", titre: "Deux", titreEn: "Two", promesse: "p", promesseEn: "p" },
  { id: "jamais", titre: "Jamais", titreEn: "Never", promesse: "p", promesseEn: "p" },
];

const x = (id: string, chapitre: string, epreuve?: true): Exercice =>
  ({ id, chapitre, titre: id, titreEn: id, enonce: "e", enonceEn: "e", indice: "i", indiceEn: "i", lecon: "l", leconEn: "l", epreuve });

const EXERCICES: Exercice[] = [x("a", "un"), x("b", "un"), x("c", "un", true), x("d", "deux"), x("e", "deux", true)];

describe("ce qui est accompli", () => {
  it("se relit tel qu'il a été écrit", () => {
    expect(lireProgres(ecrireProgres(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("ENCAISSE UN CHAMP ABÎMÉ SANS SE PLAINDRE", () => {
    expect(lireProgres("a, b ;c\n\nd")).toEqual(["a", "b", "c", "d"]);
    expect(lireProgres("")).toEqual([]);
    expect(lireProgres(null)).toEqual([]);
    expect(lireProgres("   ")).toEqual([]);
  });

  it("ne garde pas deux fois le même accomplissement", () => {
    expect(lireProgres(noter(noter("", "a"), "a"))).toEqual(["a"]);
  });

  it("s'oublie, parce qu'on doit pouvoir refaire un exercice", () => {
    expect(lireProgres(oublier("a,b,c", "b"))).toEqual(["a", "c"]);
  });
});

describe("l'ordre du voyage", () => {
  it("les chapitres viennent dans l'ordre où les exercices les rencontrent", () => {
    expect(chapitresDu(EXERCICES, CHAPITRES).map((c) => c.id)).toEqual(["un", "deux"]);
  });

  it("un chapitre sans exercice n'est pas montré", () => {
    expect(chapitresDu(EXERCICES, CHAPITRES).some((c) => c.id === "jamais")).toBe(false);
  });

  it("un chapitre choisi ne montre que ses exercices", () => {
    expect(exercicesDu(EXERCICES, "deux").map((e) => e.id)).toEqual(["d", "e"]);
    expect(exercicesDu(EXERCICES)).toHaveLength(5);
  });

  it("le rang courant est le premier non accompli, quel que soit l'ordre des accomplissements", () => {
    expect(rangCourant(EXERCICES, [])).toBe(0);
    expect(rangCourant(EXERCICES, ["a", "b"])).toBe(2);
    expect(rangCourant(EXERCICES, ["b", "a"])).toBe(2);
    expect(rangCourant(EXERCICES, ["a", "c"])).toBe(1);
  });

  it("TOUT ACCOMPLI RESTE SUR LE DERNIER, et ne rend pas un écran vide", () => {
    expect(rangCourant(EXERCICES, ["a", "b", "c", "d", "e"])).toBe(4);
    expect(rangCourant([], [])).toBe(0);
  });
});

describe("le bilan", () => {
  const b = bilan(EXERCICES, CHAPITRES, ["a", "b", "c", "d"]);

  it("compte ce qui est fait, en tout et par chapitre", () => {
    expect(b.accomplis).toBe(4);
    expect(b.total).toBe(5);
    expect(b.parChapitre).toEqual([
      { chapitre: "un", accomplis: 3, total: 3 },
      { chapitre: "deux", accomplis: 1, total: 2 },
    ]);
  });

  it("compte les épreuves à part : ce sont elles qui prouvent quelque chose", () => {
    expect(b.epreuvesTotal).toBe(2);
    expect(b.epreuvesReussies).toBe(1);
  });

  it("un accomplissement inconnu ne compte pour rien", () => {
    expect(bilan(EXERCICES, CHAPITRES, ["inconnu"]).accomplis).toBe(0);
  });
});

describe("les titres", () => {
  it("ne se donnent pas pour rien", () => {
    expect(titreGagne(0, false)).toBe("");
    expect(titreGagne(1, false)).toBe(TITRES[0].fr);
  });

  it("le dernier gagné est celui qu'on porte", () => {
    expect(titreGagne(3, false)).toBe(TITRES[2].fr);
    expect(titreGagne(99, true)).toBe(TITRES[TITRES.length - 1].en);
  });

  it("le prochain titre dit ce qu'il reste à faire, et se tait à la fin", () => {
    expect(prochainTitre(0, false)).toEqual({ titre: TITRES[0].fr, reste: 1 });
    expect(prochainTitre(TITRES.length, false)).toBeNull();
  });
});
