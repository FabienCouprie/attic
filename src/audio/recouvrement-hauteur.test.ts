// audio/recouvrement-hauteur.test.ts — Deux notes de même hauteur qui se recouvrent.
//
// CE QUE CES CAS ATTRAPENT. Le silence, d'abord : un lecteur conforme relance la note au second
// `noteOn` et le PREMIER `noteOff` éteint tout, si bien qu'une note peut tomber à durée nulle sans
// que rien ne le dise. Puis la confusion des deux cas : deux notes qui commencent ensemble sont une
// seule note écrite deux fois, deux notes qui se chevauchent sont deux notes distinctes, et les
// traiter pareil raccourcirait l'une ou doublerait l'autre.
import { describe, expect, it } from "vitest";
import { resoudre, sansRecouvrementDeHauteur } from "./recouvrement-hauteur";

const n = (note: number, debut: number, fin: number, canal = 0) => ({ note, debut, fin, canal });

describe("la résolution des recouvrements de hauteur", () => {
  it("laisse intacte une suite qui n'en a aucun", () => {
    const suite = [n(60, 0, 1), n(62, 1, 2), n(60, 2, 3)];
    expect(sansRecouvrementDeHauteur(suite)).toEqual(suite);
  });

  it("ARRÊTE LA PREMIÈRE LÀ OÙ LA SECONDE COMMENCE", () => {
    // Le cas mesuré : la seconde relance la note, et le premier note-off éteint tout.
    const r = resoudre([n(60, 0, 3), n(60, 1, 4)]);
    expect(r.notes).toEqual([n(60, 0, 1), n(60, 1, 4)]);
    expect(r.tronquees).toBe(1);
    expect(r.fondues).toBe(0);
  });

  it("RÉUNIT DEUX NOTES ÉCRITES AU MÊME INSTANT, jusqu'à la plus lointaine des fins", () => {
    const r = resoudre([n(60, 0, 2), n(60, 0, 5)]);
    expect(r.notes).toEqual([n(60, 0, 5)]);
    expect(r.fondues).toBe(1);
  });

  it("ne touche pas deux hauteurs différentes au même instant", () => {
    const accord = [n(60, 0, 2), n(64, 0, 2), n(67, 0, 2)];
    expect(sansRecouvrementDeHauteur(accord)).toEqual(accord);
  });

  it("NE CONFOND PAS DEUX CANAUX : une voix, c'est une hauteur SUR UN CANAL", () => {
    const suite = [n(60, 0, 3, 0), n(60, 1, 4, 1)];
    expect(sansRecouvrementDeHauteur(suite)).toEqual(suite);
  });

  it("enchaîne trois notes qui se recouvrent toutes", () => {
    const r = resoudre([n(60, 0, 5), n(60, 1, 6), n(60, 2, 7)]);
    expect(r.notes).toEqual([n(60, 0, 1), n(60, 1, 2), n(60, 2, 7)]);
    expect(r.tronquees).toBe(2);
  });

  it("GARDE L'ORDRE D'ENTRÉE, même quand les notes arrivent en désordre", () => {
    // Plusieurs composants associent à la place d'une note autre chose, une voix gravée ou une
    // couleur : un tri qui sortirait d'ici les désaccorderait.
    const r = sansRecouvrementDeHauteur([n(64, 2, 3), n(60, 0, 3), n(60, 1, 4)]);
    expect(r.map((x) => x.note)).toEqual([64, 60, 60]);
    expect(r[1].fin).toBe(1);
  });

  it("garde les champs que la note portait en plus", () => {
    const avec = [{ ...n(60, 0, 3), velocite: 90, voix: 2 }, { ...n(60, 1, 4), velocite: 70, voix: 2 }];
    const r = sansRecouvrementDeHauteur(avec);
    expect(r[0]).toEqual({ ...n(60, 0, 1), velocite: 90, voix: 2 });
    expect(r[1].velocite).toBe(70);
  });

  it("AUCUNE NOTE NE TOMBE À DURÉE NULLE OU NÉGATIVE", () => {
    // C'est le défaut que le banc a chiffré : neuf des trente-six notes d'un composant tombaient à
    // durée nulle chez un lecteur conforme.
    const dense = Array.from({ length: 40 }, (_, i) => n(60, i * 0.1, i * 0.1 + 2));
    for (const x of sansRecouvrementDeHauteur(dense)) expect(x.fin).toBeGreaterThan(x.debut);
  });

  it("une suite vide ne pose pas de question", () => {
    expect(sansRecouvrementDeHauteur([])).toEqual([]);
  });
});
