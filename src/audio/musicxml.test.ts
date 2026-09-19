// audio/musicxml.test.ts — Une partition qu'un autre logiciel puisse ouvrir.
//
// MusicXML n'est utile que s'il est correct : MuseScore refuse un fichier dont les durées
// ne remplissent pas la mesure, et affiche n'importe quoi si les hauteurs sont mal
// nommées. Ces tests tiennent donc la structure ET l'invariant qui compte — chaque mesure
// est pleine, ni plus ni moins.
import { describe, expect, it } from "vitest";
import { evenementsDepuisNotes, nomMusicXML, notesVersMusicXML, valeurNote } from "./musicxml";

const noire = (note: number, debut: number, tempo = 120) => ({
  note, debut, fin: debut + 60 / tempo,
});

describe("nom des hauteurs", () => {
  it("nomme les notes naturelles et leur octave", () => {
    expect(nomMusicXML(60)).toEqual({ pas: "C", alter: 0, octave: 4 });
    expect(nomMusicXML(69)).toEqual({ pas: "A", alter: 0, octave: 4 });
    expect(nomMusicXML(21)).toEqual({ pas: "A", alter: 0, octave: 0 });
  });

  it("écrit les altérations, dièse ou bémol selon l'usage", () => {
    expect(nomMusicXML(61)).toEqual({ pas: "C", alter: 1, octave: 4 });
    expect(nomMusicXML(63)).toEqual({ pas: "E", alter: -1, octave: 4 });
    expect(nomMusicXML(70)).toEqual({ pas: "B", alter: -1, octave: 4 });
  });

  it("borne les valeurs impossibles plutôt que d'écrire une octave absurde", () => {
    expect(nomMusicXML(-5).octave).toBeGreaterThanOrEqual(-1);
    expect(nomMusicXML(200).octave).toBeLessThanOrEqual(9);
  });
});

describe("valeurs de note", () => {
  it("nomme les durées usuelles, en unités de double-croche", () => {
    expect(valeurNote(16)).toEqual({ nom: "whole", points: 0 });
    expect(valeurNote(8)).toEqual({ nom: "half", points: 0 });
    expect(valeurNote(4)).toEqual({ nom: "quarter", points: 0 });
    expect(valeurNote(2)).toEqual({ nom: "eighth", points: 0 });
    expect(valeurNote(1)).toEqual({ nom: "16th", points: 0 });
  });

  it("pointe ce qui doit l'être : trois unités font une croche pointée", () => {
    expect(valeurNote(3)).toEqual({ nom: "eighth", points: 1 });
    expect(valeurNote(6)).toEqual({ nom: "quarter", points: 1 });
    expect(valeurNote(12)).toEqual({ nom: "half", points: 1 });
  });
});

describe("regroupement en événements", () => {
  it("réunit en un accord les notes qui commencent ensemble", () => {
    const ev = evenementsDepuisNotes([noire(60, 0), noire(64, 0), noire(67, 0)], 120, 16);
    expect(ev.length).toBe(1);
    expect(ev[0].notes).toEqual([60, 64, 67]);
  });

  it("garde l'ordre chronologique", () => {
    const ev = evenementsDepuisNotes([noire(67, 1), noire(60, 0), noire(64, 0.5)], 120, 16);
    expect(ev.map((e) => e.notes[0])).toEqual([60, 64, 67]);
  });

  it("quantifie : une note jouée à 0,503 s tombe sur la grille", () => {
    const ev = evenementsDepuisNotes([{ note: 60, debut: 0.503, fin: 1.0 }], 120, 16);
    expect(ev[0].debut).toBe(4); // une noire à 120 BPM = 4 doubles-croches
  });

  it("ne produit jamais une durée nulle : une partition n'a pas de note sans valeur", () => {
    const ev = evenementsDepuisNotes([{ note: 60, debut: 0, fin: 0.001 }], 120, 16);
    expect(ev[0].duree).toBeGreaterThanOrEqual(1);
  });
});

describe("partition écrite", () => {
  const xml = notesVersMusicXML([noire(60, 0), noire(62, 0.5), noire(64, 1), noire(65, 1.5)], { titre: "Essai" });

  it("est un document MusicXML partwise en bonne et due forme", () => {
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml).toContain("<!DOCTYPE score-partwise");
    expect(xml).toContain('<score-partwise version="4.0">');
    expect(xml).toContain('<part id="P1">');
    expect(xml.trimEnd().endsWith("</score-partwise>")).toBe(true);
  });

  it("porte le titre, la métrique, la clé et le tempo", () => {
    expect(xml).toContain("<work-title>Essai</work-title>");
    expect(xml).toContain("<beats>4</beats>");
    expect(xml).toContain("<sign>G</sign>");
    expect(xml).toContain('<sound tempo="120"/>');
  });

  it("écrit les hauteurs attendues", () => {
    expect(xml).toContain("<step>C</step>");
    expect(xml).toContain("<step>F</step>");
    expect(xml).toContain("<octave>4</octave>");
  });

  it("échappe ce qui casserait le XML", () => {
    const x = notesVersMusicXML([noire(60, 0)], { titre: 'Un <titre> & "guillemets"' });
    expect(x).toContain("&lt;titre&gt;");
    expect(x).toContain("&amp;");
    expect(x).not.toMatch(/<work-title>[^<]*<titre>/);
  });

  it("marque les accords : seule la première note d'un accord porte sa durée seule", () => {
    const x = notesVersMusicXML([noire(60, 0), noire(64, 0), noire(67, 0)]);
    expect((x.match(/<chord\/>/g) ?? []).length).toBe(2);
  });

  // L'invariant qui compte : MuseScore refuse une mesure qui ne tombe pas juste.
  it("remplit chaque mesure exactement, silences compris", () => {
    const cas = [
      [noire(60, 0)],                                   // une seule note, le reste en silence
      [noire(60, 0), noire(62, 1.5)],                   // un trou au milieu
      [noire(60, 0), noire(64, 0), noire(67, 2)],       // un accord, puis une note
      [{ note: 60, debut: 0, fin: 4 }],                 // une note plus longue qu'une mesure
      [noire(60, 3.5), noire(62, 7)],                   // sur plusieurs mesures
    ];
    for (const notes of cas) {
      const x = notesVersMusicXML(notes as any, { tempo: 120 });
      for (const mesure of x.split("<measure ").slice(1)) {
        // Les durées des notes d'accord ne comptent pas : elles se superposent.
        const blocs = mesure.split("<note>").slice(1);
        let total = 0;
        for (const b of blocs) {
          if (b.includes("<chord/>")) continue;
          total += Number(b.match(/<duration>(\d+)<\/duration>/)?.[1] ?? 0);
        }
        expect(total, `mesure incomplète : ${total}/16`).toBe(16);
      }
    }
  });

  it("compte les mesures qu'il faut, et pas une de plus", () => {
    const deuxMesures = notesVersMusicXML([noire(60, 0), noire(62, 2.5)], { tempo: 120 });
    expect((deuxMesures.match(/<measure /g) ?? []).length).toBe(2);
  });

  it("écrit une mesure de silence pour une partition vide, plutôt qu'un document vide", () => {
    const x = notesVersMusicXML([]);
    expect((x.match(/<measure /g) ?? []).length).toBe(1);
    expect(x).toContain("<rest/>");
  });

  it("suit la métrique demandée", () => {
    const troisQuatre = notesVersMusicXML([noire(60, 0)], { metrique: [3, 4] });
    expect(troisQuatre).toContain("<beats>3</beats>");
    const mesure = troisQuatre.split("<measure ")[1];
    const total = mesure.split("<note>").slice(1)
      .filter((b) => !b.includes("<chord/>"))
      .reduce((s, b) => s + Number(b.match(/<duration>(\d+)<\/duration>/)?.[1] ?? 0), 0);
    expect(total).toBe(12); // trois noires de quatre unités
  });
});
