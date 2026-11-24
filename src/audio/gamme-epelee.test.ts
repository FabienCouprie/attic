// audio/gamme-epelee.test.ts — Chaque gamme de la table a son écriture, et elle tombe sur ses degrés.
import { describe, expect, it } from "vitest";
import { Note } from "tonal";
import { GAMMES } from "./gammes";
import { intervallesDeGamme, notesDeGamme } from "./gamme-epelee";

describe("l'écriture des gammes de la table", () => {
  it("chaque gamme de la table trouve son écriture chez Tonal, par sa suite de demi-tons", () => {
    const sans = GAMMES.filter((g) => !intervallesDeGamme(g.id)).map((g) => g.id);
    expect(sans).toEqual([]);
    expect(GAMMES.length).toBeGreaterThanOrEqual(25);
  });

  it("sur les douze toniques, chaque note tombe sur son degré, et une gamme de sept degrés écrit sept lettres", () => {
    const fautes: string[] = [];
    for (const g of GAMMES) {
      for (const tonique of ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"]) {
        const notes = notesDeGamme(tonique, g.id) ?? [];
        const t = Note.chroma(tonique)!;
        const attendu = g.degres.map((d) => (d + t) % 12);
        const lu = notes.map((n) => Note.chroma(n));
        const lettres = new Set(notes.map((n) => n[0])).size;
        if (JSON.stringify(lu) !== JSON.stringify(attendu) || (g.degres.length === 7 && lettres !== 7)) {
          fautes.push(`${tonique} ${g.id} : ${notes.join(" ")}`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });

  it("une tonique illisible ou une gamme inconnue rend null, et non une liste amputée", () => {
    expect(notesDeGamme("H", "majeur")).toBeNull();
    expect(notesDeGamme("C", "major")).toBeNull();
    expect(notesDeGamme("D", "dorien")).toEqual(["D", "E", "F", "G", "A", "B", "C"]);
  });
});
