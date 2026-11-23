// audio/guitare-doigte.test.ts — Où la guitare joue chaque note : des cas dont la réponse se calcule à
// la main, sur le manche d'une guitare réelle.
//
// La corde 1 est la plus aiguë. Une case se lit hauteur − corde à vide − capodastre. Accordage
// standard : mi 2 (40), la 2 (45), ré 3 (50), sol 3 (55), si 3 (59), mi 4 (64).
import { describe, expect, it } from "vitest";
import {
  ACCORDAGES, accordageDe, candidats, cordesMidi, fautesDeDoigte, placer, type NoteAPlacer, type Place, type ReglagesDoigte,
} from "./guitare-doigte";

const STANDARD: ReglagesDoigte = { cordes: cordesMidi(accordageDe("standard")), capo: 0, derniereCase: 20, ecart: 4 };
/** Une suite de notes d'une noire chacune, une par mesure de quatre. */
const melodie = (...midis: number[]): NoteAPlacer[] =>
  midis.map((midi, i) => ({ ids: [`n${i}`], midi, debut: i, fin: i + 1, mesure: Math.floor(i / 4) + 1, nom: `m${midi}` }));
const accord = (debut: number, ...midis: number[]): NoteAPlacer[] =>
  midis.map((midi, i) => ({ ids: [`a${debut}-${i}`], midi, debut, fin: debut + 1, mesure: 1, nom: `m${midi}` }));
function places(notes: NoteAPlacer[], r: ReglagesDoigte = STANDARD): Place[] {
  const p = placer(notes, r);
  if ("fautes" in p) throw new Error(JSON.stringify(p.fautes));
  return notes.map((n) => p.places.get(n.ids[0])!);
}
const cc = (...paires: [number, number][]) => paires.map(([corde, frette]) => ({ corde, frette }));

describe("les cordes de chaque accordage", () => {
  it.each([
    ["standard", [40, 45, 50, 55, 59, 64]],
    ["drop-d", [38, 45, 50, 55, 59, 64]],
    ["dadgad", [38, 45, 50, 55, 57, 62]],
    ["open-g", [38, 43, 50, 55, 59, 62]],
    ["open-d", [38, 45, 50, 54, 57, 62]],
    ["demi-ton", [39, 44, 49, 54, 58, 63]],
    ["standard-7", [35, 40, 45, 50, 55, 59, 64]],
  ])("%s", (id, attendu) => {
    expect(cordesMidi(accordageDe(id))).toEqual(attendu);
  });

  it("chaque accordage offert est dans ce relevé, et un identifiant inconnu rend le standard", () => {
    expect(ACCORDAGES.map((a) => a.id)).toEqual(["standard", "drop-d", "dadgad", "open-g", "open-d", "demi-ton", "standard-7"]);
    expect(accordageDe("inconnu").id).toBe("standard");
  });
});

describe("les places d'une hauteur", () => {
  it("le mi 4 : première corde à vide, deuxième case 5, troisième case 9, quatrième 14, cinquième 19", () => {
    expect(candidats(64, STANDARD)).toEqual(cc([1, 0], [2, 5], [3, 9], [4, 14], [5, 19]));
  });
  it("la dernière case borne le manche : le mi 4 en sixième corde exigerait la case 24", () => {
    expect(candidats(64, { ...STANDARD, derniereCase: 24 })).toContainEqual({ corde: 6, frette: 24 });
  });
  it("sous un capodastre en case 2, le fa dièse 4 est la première corde à vide, et les cases se comptent depuis lui", () => {
    expect(candidats(66, { ...STANDARD, capo: 2 })[0]).toEqual({ corde: 1, frette: 0 });
    expect(candidats(64, { ...STANDARD, capo: 2 })).toEqual(cc([2, 3], [3, 7], [4, 12], [5, 17]));
  });
  it("le ré 2 est la sixième corde à vide en Drop D, et hors du manche en standard", () => {
    expect(candidats(38, { ...STANDARD, cordes: cordesMidi(accordageDe("drop-d")) })).toEqual(cc([6, 0]));
    expect(candidats(38, STANDARD)).toEqual([]);
  });
  it("le si 1 est la septième corde à vide sur une sept cordes", () => {
    expect(candidats(35, { ...STANDARD, cordes: cordesMidi(accordageDe("standard-7")) })).toEqual(cc([7, 0]));
  });
});

describe("le moindre déplacement de la main", () => {
  it("la gamme de do, de do 3 à do 4, se joue en première position, sans déplacer la main", () => {
    expect(places(melodie(48, 50, 52, 53, 55, 57, 59, 60)))
      .toEqual(cc([5, 3], [4, 0], [4, 2], [4, 3], [3, 0], [3, 2], [2, 0], [2, 1]));
  });
  it("si 4, ré 4, sol 4 se jouent en septième position, que la main tient sans bouger", () => {
    // La case la plus basse sauterait en case 3 pour le ré et le sol ; la plus basse case appuyée,
    // prise pour la position de la main, monterait en case 12 sur trois cordes.
    expect(places(melodie(71, 62, 67))).toEqual(cc([1, 7], [3, 7], [2, 8]));
  });
  it("une corde à vide ne déplace pas la main", () => {
    // mi 4 à vide entre deux notes en cinquième position.
    expect(places(melodie(69, 64, 72))).toEqual(cc([1, 5], [1, 0], [1, 8]));
  });
  it("le calcul est global : il ne s'enferme pas dans la position que le premier pas préférerait", () => {
    // Pris seul, le la 3 irait à la troisième corde case 2 ; la suite, de la case 7 à la case 10 sur la
    // première corde, le fait prendre en quatrième corde case 7, et la main reste en septième position.
    expect(places(melodie(57, 73, 71, 74))).toEqual(cc([4, 7], [1, 9], [1, 7], [1, 10]));
  });
  it("le résultat ne dépend que des notes et des réglages", () => {
    const notes = melodie(60, 64, 67, 72, 76, 79, 84, 79, 76, 72);
    expect(places(notes)).toEqual(places(notes));
  });
});

describe("les notes qui sonnent ensemble", () => {
  it("un accord de do en première position : do 3, mi 3, sol 3, do 4, mi 4", () => {
    expect(places(accord(0, 48, 52, 55, 60, 64))).toEqual(cc([5, 3], [4, 2], [3, 0], [2, 1], [1, 0]));
  });
  it("une note tenue garde sa corde, et la note attaquée pendant qu'elle sonne en prend une autre", () => {
    const tenue: NoteAPlacer = { ids: ["basse"], midi: 45, debut: 0, fin: 4, mesure: 1, nom: "A2" };
    const notes = [tenue, ...melodie(47, 49, 50, 52).map((n) => ({ ...n, debut: n.debut + 0.5, fin: n.fin + 0.5 }))];
    const p = placer(notes, STANDARD);
    if ("fautes" in p) throw new Error("refusé");
    const basse = p.places.get("basse")!;
    for (const n of notes.slice(1)) expect(p.places.get(n.ids[0])!.corde).not.toBe(basse.corde);
    for (const n of notes) {
      const pl = p.places.get(n.ids[0])!;
      expect(STANDARD.cordes[6 - pl.corde] + pl.frette).toBe(n.midi);
    }
  });
  it("les suites d'une note liée prennent la place de sa première attaque", () => {
    const p = placer([{ ids: ["debut", "suite"], midi: 69, debut: 0, fin: 4, mesure: 1, nom: "A4" }], STANDARD);
    if ("fautes" in p) throw new Error("refusé");
    expect(p.places.get("suite")).toEqual(p.places.get("debut"));
  });
});

describe("ce qui ne se joue pas est refusé, nommé avec sa mesure", () => {
  it("une note sous la corde la plus grave, et une au-delà de la dernière case", () => {
    expect(fautesDeDoigte(melodie(36, 60, 60, 60, 85), STANDARD)).toEqual([
      { raison: "tessiture", notes: ["m36"], mesure: 1 },
      { raison: "tessiture", notes: ["m85"], mesure: 2 },
    ]);
  });
  it("sept notes ensemble sur six cordes", () => {
    expect(fautesDeDoigte(accord(0, 40, 45, 50, 55, 59, 64, 67), STANDARD)[0].raison).toBe("nombre");
  });
  it("mi 2 et fa 2 ensemble : tous deux n'ont que la sixième corde", () => {
    expect(fautesDeDoigte(accord(0, 40, 41), STANDARD)).toEqual([{ raison: "corde", notes: ["m40", "m41"], mesure: 1 }]);
  });
  it("sol 2 et do dièse 5 ensemble : sept cases au moins entre eux, plus que l'écart", () => {
    expect(fautesDeDoigte(accord(0, 43, 73), STANDARD)).toEqual([{ raison: "ecart", notes: ["m43", "m73"], mesure: 1 }]);
    expect(fautesDeDoigte(accord(0, 43, 73), { ...STANDARD, ecart: 6 })[0].raison).toBe("ecart");
  });
  it("sol 2 et si 4 ensemble, cases 3 et 7 au plus près : refusés sous un écart de 4, joués sous un écart de 5", () => {
    // Le sol 2 n'a que la sixième corde case 3, le si 4 au plus bas la première corde case 7.
    expect(fautesDeDoigte(accord(0, 43, 71), STANDARD)).toEqual([{ raison: "ecart", notes: ["m43", "m71"], mesure: 1 }]);
    expect(places(accord(0, 43, 71), { ...STANDARD, ecart: 5 })).toEqual(cc([6, 3], [1, 7]));
  });
  it("sol 2, ré 3, ré 4 ensemble tiennent dans l'écart : sixième corde case 3, quatrième à vide, deuxième case 3", () => {
    expect(places(accord(0, 43, 50, 62))).toEqual(cc([6, 3], [4, 0], [2, 3]));
  });
  it("placer rend les fautes au lieu des places", () => {
    expect(placer(melodie(36), STANDARD)).toEqual({ fautes: [{ raison: "tessiture", notes: ["m36"], mesure: 1 }] });
  });
});
