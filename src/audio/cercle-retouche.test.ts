// audio/cercle-retouche.test.ts — Le masque posé sur un cercle reçu.
//
// CE QUE CES CAS TIENNENT. D'abord qu'un masque vide ne touche à rien : c'est l'état d'un composant
// que personne n'a cliqué, et il doit laisser passer son entrée sans la modifier. Ensuite que le
// masque est bien un MASQUE et non une copie : le cercle reçu peut changer en amont, et la retouche
// doit se reporter dessus plutôt que de figer ce qui était là au moment du clic. Enfin qu'une place
// rallumée hérite d'une hauteur écrite quelque part, et jamais d'une hauteur inventée.
import { describe, expect, it } from "vitest";
import { estCercle, type Cercle } from "./cercle";
import {
  cercleRetouche, differenceDeRetouche, masqueAjuste, masqueDuCercle,
} from "./cercle-retouche";

const melo = (positions: number, paires: [number, number][]): Cercle => ({
  positions, sorte: "hauteur", sommets: paires.map(([position, valeur]) => ({ position, valeur })),
});
const perc = (positions: number, places: number[], note = 36): Cercle => ({
  positions, sorte: "percussion", sommets: places.map((position) => ({ position, valeur: note })),
});

describe("le masque d'un cercle", () => {
  it("SE LIT SUR SES PLACES QUI SONNENT", () => {
    expect(masqueDuCercle(perc(8, [0, 3, 6]))).toBe("10010010");
    expect(masqueDuCercle(perc(4, []))).toBe("0000");
  });

  it("SE RAMÈNE AU NOMBRE DE PLACES DU CERCLE REÇU", () => {
    const c = perc(8, [0, 4]);
    expect(masqueDuCercle(c)).toBe("10001000");
    // Trop court : les places manquantes prennent celles du cercle, ici la place 4.
    expect(masqueAjuste("101", c)).toBe("10101000");
    // Trop long : le reste est laissé.
    expect(masqueAjuste("1111111111", c)).toBe("11111111");
    // Vide : le cercle passe tel quel.
    expect(masqueAjuste("", c)).toBe(masqueDuCercle(c));
  });
});

describe("le cercle retouché", () => {
  it("UN MASQUE VIDE NE TOUCHE À RIEN, et c'est l'état d'un composant qu'on n'a pas cliqué", () => {
    const c = melo(7, [[0, 60], [2, 64], [4, 67]]);
    expect(cercleRetouche(c, "")).toBe(c);
  });

  it("ÉTEINDRE UNE PLACE LUI RETIRE SON ATTAQUE, et ne touche pas aux autres", () => {
    const c = melo(4, [[0, 60], [1, 62], [2, 64], [3, 65]]);
    const r = cercleRetouche(c, "1011");
    expect(r.positions).toBe(4);
    expect(r.sorte).toBe("hauteur");
    expect(r.sommets).toEqual([{ position: 0, valeur: 60 }, { position: 2, valeur: 64 }, { position: 3, valeur: 65 }]);
  });

  it("UNE PLACE RALLUMÉE HÉRITE DE L'ATTAQUE QUI LA PRÉCÈDE, et d'aucune hauteur inventée", () => {
    const c = melo(4, [[0, 60], [2, 67]]);
    const r = cercleRetouche(c, "1111");
    expect(r.sommets.map((s) => s.valeur)).toEqual([60, 60, 67, 67]);
    // Le tour se referme : une place avant la première attaque prend la dernière du cercle.
    const tardif = melo(4, [[2, 67]]);
    expect(cercleRetouche(tardif, "1010").sommets).toEqual([{ position: 0, valeur: 67 }, { position: 2, valeur: 67 }]);
  });

  it("SUR UNE PERCUSSION, TOUTE PLACE PEUT S'ALLUMER, le son étant le même partout", () => {
    const r = cercleRetouche(perc(8, [0], 42), "11111111");
    expect(r.sommets.length).toBe(8);
    expect(r.sommets.every((s) => s.valeur === 42)).toBe(true);
    expect(r.sorte).toBe("percussion");
  });

  it("LE MASQUE SE REPORTE SUR UN CERCLE QUI A CHANGÉ EN AMONT, et ne fige pas l'entrée", () => {
    // La main éteint la place 1 d'un cercle de quatre.
    const masque = "1011";
    // En amont, le cercle tourne : ses hauteurs ne sont plus les mêmes.
    const tourne = melo(4, [[0, 65], [1, 60], [2, 62], [3, 64]]);
    const r = cercleRetouche(tourne, masque);
    expect(r.sommets.map((s) => s.position)).toEqual([0, 2, 3]);
    expect(r.sommets.map((s) => s.valeur)).toEqual([65, 62, 64]);
  });

  it("UN CERCLE PLUS GRAND EN AMONT GARDE SES PLACES NEUVES, que le masque ne connaît pas", () => {
    const grand = melo(8, [[0, 60], [1, 62], [2, 64], [3, 65], [4, 67], [5, 69], [6, 71], [7, 72]]);
    const r = cercleRetouche(grand, "1011");
    expect(r.positions).toBe(8);
    // Les quatre premières suivent le masque, les quatre suivantes restent ce que le cercle porte.
    expect(r.sommets.map((s) => s.position)).toEqual([0, 2, 3, 4, 5, 6, 7]);
  });

  it("TOUT ÉTEINDRE DONNE UN CERCLE SANS ATTAQUE, qui reste un cercle", () => {
    const r = cercleRetouche(melo(4, [[0, 60], [2, 64]]), "0000");
    expect(estCercle(r)).toBe(true);
    expect(r.sommets).toEqual([]);
    // Et un cercle sans attaque ne fabrique aucune hauteur quand on le rallume.
    expect(cercleRetouche(r, "1111").sommets).toEqual([]);
  });

  it("le compte des places changées est celui qu'un message dirait", () => {
    const c = melo(4, [[0, 60], [2, 64]]);
    expect(differenceDeRetouche(c, "")).toEqual({ eteintes: 0, allumees: 0 });
    expect(differenceDeRetouche(c, "1010")).toEqual({ eteintes: 0, allumees: 0 });
    expect(differenceDeRetouche(c, "0111")).toEqual({ eteintes: 1, allumees: 2 });
  });
});
