// audio/csound-partition.test.ts — Les conventions de hauteur, éprouvées sur des valeurs connues.
//
// CE QUI SE JOUE ICI n'est pas du formatage : c'est la seule chose qui décide qu'un orchestre sonne
// ou reste muet. Csound a quatre conventions de hauteur, et un orchestre écrit pour l'une ne
// fonctionne pas avec une autre — nourri en hertz là où il attend du `pch`, `cpspch(440)` donne une
// fréquence absurde, sans une ligne d'erreur. Les valeurs de référence viennent donc des fonctions de
// conversion de Csound lui-même : `cpspch(8.00)` = 261,63 Hz, `cpsoct(8.75)` = 440 Hz.
import { describe, expect, it } from "vitest";
import {
  construirePartition, hzDepuisNote, instrumentsParCanal, octDepuisNote, pchDepuisNote,
  rapportLisible, valeurCourbeAuTemps, valeurHauteur, type NoteAvecCanal,
} from "./csound-partition";
import { constante } from "./courbe";

const note = (n: number, debut: number, fin: number, canal = 0, velocite = 100): NoteAvecCanal =>
  ({ note: n, debut, fin, velocite, canal });

describe("les quatre conventions de hauteur", () => {
  it("cps : le la3 vaut 440 Hz, le do central 261,63", () => {
    expect(hzDepuisNote(69)).toBeCloseTo(440, 6);
    expect(hzDepuisNote(60)).toBeCloseTo(261.626, 3);
  });

  it("pch : 8.00 est le do central, 8.09 le la au-dessus, 9.00 l'octave suivante", () => {
    expect(pchDepuisNote(60)).toBeCloseTo(8.0, 6);
    expect(pchDepuisNote(69)).toBeCloseTo(8.09, 6);
    expect(pchDepuisNote(71)).toBeCloseTo(8.11, 6);
    expect(pchDepuisNote(72)).toBeCloseTo(9.0, 6);
    // Et vers le grave : le do en dessous est 7.00, le si d'avant 7.11.
    expect(pchDepuisNote(48)).toBeCloseTo(7.0, 6);
    expect(pchDepuisNote(59)).toBeCloseTo(7.11, 6);
  });

  it("pch n'est PAS un nombre décimal : 8.11 est suivi de 9.00, et rien entre les deux", () => {
    // La différence entre deux demi-tons vaut un centième, mais celle entre 8.11 et 9.00 vaut 0,89.
    expect(pchDepuisNote(72) - pchDepuisNote(71)).toBeCloseTo(0.89, 6);
    // Aucune note ne tombe donc entre 8.11 et 9.00.
    for (let n = 21; n <= 108; n++) {
      const centiemes = Math.round((pchDepuisNote(n) % 1) * 100);
      expect(centiemes, `note ${n}`).toBeLessThan(12);
    }
  });

  it("oct : 8,0 est le do central, 8,75 le la au-dessus — neuf demi-tons sur douze", () => {
    expect(octDepuisNote(60)).toBeCloseTo(8, 6);
    expect(octDepuisNote(69)).toBeCloseTo(8.75, 6);
    expect(octDepuisNote(72)).toBeCloseTo(9, 6);
    // Sa propriété utile : transposer d'une octave, c'est ajouter un.
    expect(octDepuisNote(81) - octDepuisNote(69)).toBeCloseTo(1, 6);
  });

  it("oct et pch décrivent la même note, et se recoupent par la formule de Csound", () => {
    // `cpsoct(o)` = 1,02197 × 2^o, donc cpsoct(8,75) doit valoir 440 Hz.
    const cpsoct = (o: number) => 1.021975 * Math.pow(2, o);
    for (const n of [48, 60, 69, 84, 108]) {
      expect(cpsoct(octDepuisNote(n))).toBeCloseTo(hzDepuisNote(n), 1);
    }
  });

  it("midi : le numéro tel quel", () => {
    expect(valeurHauteur(69, "midi")).toBe(69);
    expect(valeurHauteur(69, "cps")).toBeCloseTo(440, 6);
  });
});

describe("l'écriture de la partition", () => {
  const troisNotes = [note(69, 0, 1), note(60, 1, 2), note(72, 2, 2.5)];

  it("écrit une ligne par note, triée dans le temps, avec f0 et e", () => {
    const { texte } = construirePartition(troisNotes, { margeFinale: 0.5 });
    const lignes = texte.split("\n");
    expect(lignes[0]).toBe("i1 0.0000 1.0000 440.000 0.7874 69");
    expect(lignes[1]).toBe("i1 1.0000 1.0000 261.626 0.7874 60");
    expect(lignes[2]).toBe("i1 2.0000 0.5000 523.251 0.7874 72");
    expect(lignes[3]).toBe("f0 3.0000");
    expect(lignes[4]).toBe("e");
  });

  it("écrit le `pch` à deux décimales, parce que ses centièmes sont une classe de hauteur", () => {
    const { texte } = construirePartition([note(69, 0, 1)], { convention: "pch" });
    expect(texte.split("\n")[0]).toBe("i1 0.0000 1.0000 8.09 0.7874 69");
  });

  it("obéit à l'ordre des p-fields demandé, et sait laisser un champ vide", () => {
    const { texte } = construirePartition([note(69, 0, 1, 0, 64)], {
      champs: ["amplitude", "hauteur", "rien", "duree"],
    });
    expect(texte.split("\n")[0]).toBe("i1 0.0000 1.0000 0.5039 440.000 1.0000");
  });

  it("met une constante et une valeur de courbe là où on le demande", () => {
    const courbe = constante(0.25, 3, 100);
    const { texte } = construirePartition([note(69, 0, 1), note(69, 2, 3)], {
      champs: ["hauteur", "constante", "courbe"], constante: 7,
    });
    expect(texte.split("\n")[0]).toBe("i1 0.0000 1.0000 440.000 7.0000 0.0000");
    const avec = construirePartition([note(69, 0, 1)], {
      champs: ["courbe"], courbe,
    });
    expect(avec.texte.split("\n")[0]).toBe("i1 0.0000 1.0000 0.2500");
  });

  it("UN INSTRUMENT PAR CANAL : les canaux présents, numérotés à la suite", () => {
    // Un MIDI sur les canaux 1, 2 et 10 donne les instruments 1, 2 et 3 — et non 1, 2 et 10 : c'est
    // ce qu'attend un orchestre dont les instruments se suivent.
    const notes = [note(60, 0, 1, 0), note(64, 0, 1, 1), note(36, 0, 0.2, 9)];
    const { texte, rapport } = construirePartition(notes, { parCanal: true });
    const numeros = texte.split("\n").filter((l) => l.startsWith("i")).map((l) => l.slice(1, 2));
    expect(new Set(numeros)).toEqual(new Set(["1", "2", "3"]));
    expect(rapport.instruments).toEqual([
      { numero: 1, canal: 1, notes: 1 },
      { numero: 2, canal: 2, notes: 1 },
      { numero: 3, canal: 10, notes: 1 },
    ]);
  });

  it("compte à partir du numéro demandé", () => {
    const notes = [note(60, 0, 1, 0), note(64, 0, 1, 3)];
    const { rapport } = construirePartition(notes, { parCanal: true, instrument: 10 });
    expect(rapport.instruments.map((i) => i.numero)).toEqual([10, 11]);
  });

  it("sans « par canal », tout part sur le même instrument — et le rapport ne prétend pas l'inverse", () => {
    const notes = [note(60, 0, 1, 0), note(64, 0, 1, 1), note(36, 0, 0.2, 9)];
    const { texte, rapport } = construirePartition(notes);
    expect(texte.split("\n").every((l) => !l.startsWith("i") || l.startsWith("i1 "))).toBe(true);
    expect(rapport.instruments).toEqual([{ numero: 1, canal: 1, notes: 3 }]);
  });

  it("une note de durée nulle garde une durée jouable", () => {
    const { texte } = construirePartition([note(60, 1, 1)]);
    expect(texte.split("\n")[0]).toContain("0.0010");
  });

  it("une partition vide n'est pas une partition cassée : juste un `e`", () => {
    const { texte, rapport } = construirePartition([]);
    expect(texte).toBe("e");
    expect(rapport.evenements).toBe(0);
    expect(rapport.instruments).toEqual([]);
  });

  it("le rapport dit la correspondance qu'il faut pour écrire l'orchestre", () => {
    const notes = [note(60, 0, 1, 0), note(64, 0, 1, 1)];
    const { rapport } = construirePartition(notes, { parCanal: true, convention: "pch" });
    const texte = rapportLisible(rapport);
    expect(texte).toContain("2 événements");
    expect(texte).toContain("pch");
    expect(texte).toContain("i1 | 1 | 1");
    expect(texte).toContain("i2 | 2 | 1");
  });
});

describe("les à-côtés", () => {
  it("attribue les instruments sans se soucier des canaux absents", () => {
    expect([...instrumentsParCanal([note(60, 0, 1, 5), note(60, 0, 1, 2)], 1).entries()])
      .toEqual([[2, 1], [5, 2]]);
  });

  it("lit une courbe au bon instant, et ne sort pas de ses bornes", () => {
    const c = { valeurs: Float32Array.from([0, 0.5, 1]), cadence: 1 };
    expect(valeurCourbeAuTemps(c, 0)).toBe(0);
    expect(valeurCourbeAuTemps(c, 1)).toBe(0.5);
    expect(valeurCourbeAuTemps(c, 2)).toBe(1);
    expect(valeurCourbeAuTemps(c, 99)).toBe(1);
    expect(valeurCourbeAuTemps({ valeurs: new Float32Array(0), cadence: 1 }, 0)).toBe(0);
  });
});
