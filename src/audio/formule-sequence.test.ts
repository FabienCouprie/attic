// audio/formule-sequence.test.ts — Une fonction écrite, appliquée à chaque note.
//
// CE QUI SE VÉRIFIE ICI TIENT EN TROIS POINTS. Que la règle écrite s'applique à chacune, avec les
// variables annoncées. Qu'une formule fautive ne détruise pas la pièce, ce qui est le vrai risque :
// sur trois cents notes, une erreur de frappe qui ferait tout disparaître se chercherait longtemps.
// Et que toutes les formules lisent la note D'ORIGINE, faute de quoi l'ordre dans lequel on écrit
// les champs déciderait du résultat sans que rien ne le dise.
import { describe, expect, it } from "vitest";

import type { Note } from "./note";
import { appliquerFormules, VARIABLES } from "./formule-sequence";

const n = (hauteur: number, debut: number, duree = 1, velocite = 90): Note =>
  ({ note: hauteur, velocite, debut, fin: debut + duree });

const suite = (): Note[] => [n(60, 0), n(64, 1), n(67, 2), n(72, 3)];

describe("la transformation", () => {
  it("UNE FORMULE S'APPLIQUE À CHAQUE NOTE", () => {
    const r = appliquerFormules(suite(), { formules: { note: "note + 12" } });
    expect(r.notes.map((x) => x.note)).toEqual([72, 76, 79, 84]);
    expect(r.erreurs).toEqual([]);
  });

  it("LE RANG ET LE COMPTE SONT LISIBLES : une transposition qui monte en chemin", () => {
    const r = appliquerFormules(suite(), { formules: { note: "note + i" } });
    expect(r.notes.map((x) => x.note)).toEqual([60, 65, 69, 75]);
  });

  it("LA PLACE DANS LA PIÈCE EST LISIBLE, de zéro à un", () => {
    const r = appliquerFormules(suite(), { formules: { velocite: "20 + 100 * t" } });
    const v = r.notes.map((x) => Math.round(x.velocite));
    expect(v[0]).toBe(20);
    expect(v[v.length - 1]).toBe(95);
  });

  it("UN QUART DE TON S'ÉCRIT, la hauteur n'étant pas arrondie", () => {
    const r = appliquerFormules(suite(), { formules: { note: "note + 0.5" } });
    expect(r.notes.map((x) => x.note)).toEqual([60.5, 64.5, 67.5, 72.5]);
  });

  it("LA DURÉE SE RÉÉCRIT SANS DÉPLACER LE DÉBUT", () => {
    const r = appliquerFormules(suite(), { formules: { duree: "duree / 2" } });
    expect(r.notes.map((x) => [x.debut, x.fin - x.debut])).toEqual([[0, 0.5], [1, 0.5], [2, 0.5], [3, 0.5]]);
  });

  it("LE DÉBUT SE RÉÉCRIT SANS CHANGER LA DURÉE", () => {
    const r = appliquerFormules(suite(), { formules: { debut: "debut * 2" } });
    expect(r.notes.map((x) => [x.debut, x.fin - x.debut])).toEqual([[0, 1], [2, 1], [4, 1], [6, 1]]);
  });

  it("LA NUANCE EST BORNÉE À CE QUE MIDI ADMET", () => {
    const r = appliquerFormules(suite(), { formules: { velocite: "1000" } });
    expect(r.notes.every((x) => x.velocite === 127)).toBe(true);
    const bas = appliquerFormules(suite(), { formules: { velocite: "-50" } });
    expect(bas.notes.every((x) => x.velocite === 0)).toBe(true);
  });

  it("TOUTES LES FORMULES LISENT LA NOTE D'ORIGINE, non le résultat des précédentes", () => {
    // Si `duree` lisait la hauteur déjà doublée, elle vaudrait 120 et non 60.
    const r = appliquerFormules([n(60, 0, 1)], {
      formules: { note: "note * 2", duree: "note / 60" },
    });
    expect(r.notes[0].note).toBe(120);
    expect(r.notes[0].fin - r.notes[0].debut).toBe(1);
  });

  it("« note = » devant la formule est admis, par habitude", () => {
    const r = appliquerFormules(suite(), { formules: { note: "note = note + 12" } });
    expect(r.notes[0].note).toBe(72);
  });

  it("un champ vide ne touche à rien", () => {
    const r = appliquerFormules(suite(), { formules: { note: "", duree: "   " } });
    expect(r.notes).toEqual(suite());
  });
});

describe("les variables annoncées", () => {
  // CE TEST EXISTE PARCE QU'UN SEUL NOM MAL CHOISI CASSE TOUT. `end` est un mot réservé de
  // l'évaluateur : sa seule présence dans la portée faisait échouer CHAQUE formule, y compris
  // celles qui ne le nommaient pas, et les notes ressortaient inchangées sans que rien d'autre
  // qu'un message ne le dise. Le nom est devenu `offset`, qui fait paire avec `onset` ; ce test
  // éprouve désormais chaque variable annoncée, pour qu'un tel ajout se voie aussitôt.
  for (const langue of ["fr", "en"] as const) {
    it(`CHACUNE SE LIT DANS UNE FORMULE, côté ${langue}`, () => {
      for (const v of VARIABLES[langue]) {
        const r = appliquerFormules([n(60, 0)], { formules: { note: `60 + 0 * ${v}` } });
        expect(r.erreurs, `${v} : ${r.erreurs.join(" ")}`).toEqual([]);
        expect(r.notes[0].note, v).toBe(60);
      }
    });
  }

  it("LES DEUX JEUX DE NOMS DONNENT LE MÊME RÉSULTAT", () => {
    const fr = appliquerFormules(suite(), { formules: { note: "note + duree * 10", velocite: "velocite / 2" } });
    const en = appliquerFormules(suite(), { formules: { note: "pitch + length * 10", velocite: "velocity / 2" } });
    expect(en.notes).toEqual(fr.notes);
  });

  it("ET ILS SE MÊLENT dans une même formule", () => {
    const r = appliquerFormules([n(60, 0, 2)], { formules: { note: "pitch + duree" } });
    expect(r.erreurs).toEqual([]);
    expect(r.notes[0].note).toBe(62);
  });
});

describe("le filtre", () => {
  it("NE GARDE QUE CE QUI RÉPOND À LA CONDITION", () => {
    const r = appliquerFormules(suite(), { condition: "note >= 67" });
    expect(r.notes.map((x) => x.note)).toEqual([67, 72]);
    expect(r.ecartees).toBe(2);
  });

  it("LA CONDITION LIT LES MÊMES VARIABLES QUE LES FORMULES", () => {
    const r = appliquerFormules(suite(), { condition: "mod(i, 2) == 0" });
    expect(r.notes.map((x) => x.note)).toEqual([60, 67]);
  });

  it("ELLE S'APPLIQUE AVANT LA TRANSFORMATION, sur la note reçue", () => {
    const r = appliquerFormules(suite(), { condition: "note < 67", formules: { note: "note + 24" } });
    expect(r.notes.map((x) => x.note)).toEqual([84, 88]);
  });

  it("une condition vide garde tout", () => {
    expect(appliquerFormules(suite(), { condition: "" }).notes).toHaveLength(4);
  });
});

describe("ce qu'une faute ne doit pas casser", () => {
  it("UNE FORMULE ILLISIBLE LAISSE LES NOTES TELLES QUELLES, et se plaint", () => {
    const r = appliquerFormules(suite(), { formules: { note: "note +" } });
    expect(r.notes.map((x) => x.note)).toEqual([60, 64, 67, 72]);
    expect(r.erreurs).toHaveLength(1);
    expect(r.erreurs[0]).toContain("note");
  });

  it("UNE VARIABLE INCONNUE EST DITE UNE FOIS, non une fois par note", () => {
    const r = appliquerFormules(suite(), { formules: { note: "note + inconnue" } });
    expect(r.notes).toHaveLength(4);
    expect(r.erreurs).toHaveLength(1);
  });

  it("UNE FORMULE QUI NE REND PAS UN NOMBRE N'ÉCRIT RIEN", () => {
    const r = appliquerFormules(suite(), { formules: { note: "note / 0" } });
    expect(r.notes.map((x) => x.note)).toEqual([60, 64, 67, 72]);
  });

  it("une condition fautive garde la note plutôt que de la perdre", () => {
    const r = appliquerFormules(suite(), { condition: "note >" });
    expect(r.notes).toHaveLength(4);
    expect(r.erreurs).toHaveLength(1);
  });

  it("une suite vide ne casse rien", () => {
    const r = appliquerFormules([], { formules: { note: "note + 1" } });
    expect(r.notes).toEqual([]);
    expect(r.ecartees).toBe(0);
  });
});

describe("l'ordre", () => {
  it("LES NOTES SONT REMISES DANS L'ORDRE DES DÉPARTS, qu'une formule a pu défaire", () => {
    const r = appliquerFormules(suite(), { formules: { debut: "10 - debut" } });
    expect(r.notes.map((x) => x.debut)).toEqual([7, 8, 9, 10]);
  });

  it("on peut demander qu'elles restent dans l'ordre reçu", () => {
    const r = appliquerFormules(suite(), { formules: { debut: "10 - debut" }, trier: false });
    expect(r.notes.map((x) => x.debut)).toEqual([10, 9, 8, 7]);
  });
});
