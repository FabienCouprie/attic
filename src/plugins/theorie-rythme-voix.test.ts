// plugins/theorie-rythme-voix.test.ts — La lecture des entrées écrites à la main.
//
// CE QUE CES TESTS GARDENT, et pourquoi ils existent séparément de ceux des modules. Le calcul est
// éprouvé ailleurs ; ici on tient la LECTURE, c'est-à-dire l'endroit où un rythme tapé au clavier
// devient un objet. C'est là qu'une faute passe inaperçue : le nœud rend un chiffre, il est
// plausible, et personne ne voit qu'il porte sur autre chose que ce qui était écrit. C'est
// exactement ce qui est arrivé — `Number("")` vaut zéro, et l'espace suivant une barre verticale
// ajoutait un do à chaque accord.
import { describe, expect, it } from "vitest";
import { accordsSuccessifs, lireAccords, lireMotif, motifDepuisNotes } from "./theorie-rythme-voix";
import { enCases } from "../audio/rythme-analyse";

describe("lire un motif rythmique", () => {
  it("en cases, la longueur écrite fait le cycle", () => {
    const r = lireMotif("x..x..x.", 16);
    expect(r.pas).toBe(8);
    expect(r.positions).toEqual([0, 3, 6]);
  });

  it("les espaces dans un motif en cases ne comptent pas comme des cases", () => {
    expect(enCases(lireMotif("x..x ..x.", 16))).toBe("x..x..x.");
  });

  it("en un et zéro aussi", () => {
    expect(lireMotif("10010010", 16).positions).toEqual([0, 3, 6]);
  });

  it("en positions, le cycle vient du réglage", () => {
    const r = lireMotif("0 3 6 10 12", 16);
    expect(r.pas).toBe(16);
    expect(r.positions).toEqual([0, 3, 6, 10, 12]);
  });

  it("UNE ESPACE EN TÊTE N'AJOUTE PAS DE FRAPPE : `Number(\"\")` vaut zéro, pas NaN", () => {
    expect(lireMotif("  3 6 9", 12).positions).toEqual([3, 6, 9]);
  });

  it("les virgules et points-virgules séparent aussi", () => {
    expect(lireMotif("0, 3; 6", 8).positions).toEqual([0, 3, 6]);
  });

  it("un texte vide ne donne aucune frappe", () => {
    expect(lireMotif("", 16).positions).toEqual([]);
  });
});

describe("lire une suite d'accords", () => {
  it("les barres verticales séparent les accords", () => {
    expect(lireAccords("0 4 7 | 9 0 4")).toEqual([[0, 4, 7], [9, 0, 4]]);
  });

  it("LES ESPACES AUTOUR DES BARRES N'AJOUTENT PAS DE NOTE", () => {
    // Le défaut trouvé dans l'application : « 6 10 1 » était lu [0, 6, 10, 1], donc à quatre
    // notes, donc non appariable à un accord de trois — et la progression rendait zéro.
    expect(lireAccords("0 4 7 | 6 10 1")).toEqual([[0, 4, 7], [6, 10, 1]]);
    expect(lireAccords("0 4 7 | 6 10 1").every((a) => a.length === 3)).toBe(true);
  });

  it("les retours à la ligne et les points-virgules séparent aussi", () => {
    expect(lireAccords("0 4 7\n9 0 4;5 9 0")).toEqual([[0, 4, 7], [9, 0, 4], [5, 9, 0]]);
  });

  it("les accords vides sont écartés, pas rendus vides", () => {
    expect(lireAccords("0 4 7 ||  | 9 0 4")).toEqual([[0, 4, 7], [9, 0, 4]]);
  });

  it("un texte vide ne donne aucun accord", () => {
    expect(lireAccords("   ")).toEqual([]);
  });
});

describe("quantifier un MIDI", () => {
  const notes = (debuts: number[]) => debuts.map((debut) => ({ note: 60, debut, fin: debut + 0.1 }));

  it("place les attaques sur la grille demandée", () => {
    expect(motifDepuisNotes(notes([0, 0.5, 1]), 8, 2).positions).toEqual([0, 2, 4]);
  });

  it("ce qui dépasse le cycle revient au début", () => {
    expect(motifDepuisNotes(notes([0, 2]), 8, 2).positions).toEqual([0]);
  });

  it("deux attaques qui tombent sur la même case n'en font qu'une", () => {
    expect(motifDepuisNotes(notes([0, 0.01]), 8, 2).positions).toEqual([0]);
  });
});

describe("grouper un MIDI en accords", () => {
  const n = (note: number, debut: number) => ({ note, debut, fin: debut + 1 });

  it("les notes qui commencent ensemble font un accord", () => {
    expect(accordsSuccessifs([n(0, 0), n(4, 0.01), n(7, 0.02), n(9, 1)], 0.05))
      .toEqual([[0, 4, 7], [9]]);
  });

  it("la tolérance décide : plus large, tout se fond en un seul accord", () => {
    expect(accordsSuccessifs([n(0, 0), n(4, 0.3), n(7, 0.6)], 1)).toEqual([[0, 4, 7]]);
  });

  it("l'ordre d'arrivée ne change rien : les notes sont triées d'abord", () => {
    expect(accordsSuccessifs([n(7, 0.02), n(0, 0), n(4, 0.01)], 0.05)).toEqual([[0, 4, 7]]);
  });

  it("aucune note ne donne aucun accord", () => {
    expect(accordsSuccessifs([], 0.05)).toEqual([]);
  });
});
