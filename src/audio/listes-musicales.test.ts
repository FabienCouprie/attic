// audio/listes-musicales.test.ts — Le seul lecteur des listes de hauteurs, de classes, d'intervalles et de rangs.
import { describe, expect, it } from "vitest";
import { lireListe, type GenreDeListe } from "./listes-musicales";

const lu = (texte: string, genre: GenreDeListe, videPermis = false) => lireListe(texte, genre, "Réglage", { videPermis });
const valeurs = (texte: string, genre: GenreDeListe) => {
  const r = lu(texte, genre);
  return "valeurs" in r ? r.valeurs : r.refus;
};

describe("lireListe", () => {
  it("sépare par espaces, virgules, points-virgules et retours à la ligne, sans rien ajouter en tête ni en fin", () => {
    for (const t of ["60 62 64", "60,62,64", "60;62;64", "60\n62\n64", " 60 62 64", "60 62 64\n", "60, 62 ;64"]) {
      expect(valeurs(t, "hauteurs"), JSON.stringify(t)).toEqual([60, 62, 64]);
    }
  });

  it.each<[GenreDeListe, string, number[]]>([
    ["hauteurs", "60.5 0 127", [60.5, 0, 127]],
    ["hauteurs", "C4 Do4 Sib2 E#4", [60, 60, 46, 65]],
    ["classes", "0 4.5 11.5", [0, 4.5, 11.5]],
    ["classes", "C E G Sib", [0, 4, 7, 10]],
    ["classes", "C4 G2", [0, 7]],
    ["intervalles", "-96 0 3.5 96", [-96, 0, 3.5, 96]],
    ["degres", "-1 0 12 25", [-1, 0, 12, 25]],
    ["rangs", "1 2 100 1000", [1, 2, 100, 1000]],
  ])("%s : « %s »", (genre, texte, attendu) => {
    expect(valeurs(texte, genre)).toEqual(attendu);
  });

  it.each<[GenreDeListe, string, string[]]>([
    ["hauteurs", "60 x 64", ["« x » illisible"]],
    ["hauteurs", "60 200 -1", ["« 200 », « -1 » hors de 0 à 127"]],
    ["hauteurs", "C E G", ["« C », « E », « G » sans octave"]],
    ["hauteurs", "A9 60", ["« A9 » hors de 0 à 127"]],
    ["classes", "0 12 16", ["« 12 », « 16 » hors de 0 à 11"]],
    ["classes", "0 H", ["« H » illisible"]],
    ["intervalles", "0 100 -97", ["« 100 », « -97 » hors de -96 à 96"]],
    ["intervalles", "0 C4", ["« C4 » illisible"]],
    ["degres", "1.5 2", ["« 1.5 » n'est pas un nombre entier"]],
    ["degres", "C4", ["« C4 » illisible"]],
    ["rangs", "0 2.5 3", ["« 0 » hors de 1 et au-delà", "« 2.5 » n'est pas un nombre entier"]],
  ])("%s : « %s » est refusé, et le message nomme chaque jeton", (genre, texte, fautes) => {
    const r = lu(texte, genre);
    expect("refus" in r && r.refus).toMatch(/^« Réglage » ne se lit pas : /);
    for (const f of fautes) expect("refus" in r && r.refus).toContain(f);
  });

  it("une liste vide est refusée, sauf quand sa documentation dit ce que le vide veut dire", () => {
    for (const t of ["", "   ", "\n", ",", " ; "]) {
      expect(lu(t, "hauteurs")).toEqual({ refus: expect.stringMatching(/^« Réglage » est vide\. Attendu /) });
      expect(lu(t, "hauteurs", true)).toEqual({ valeurs: [] });
    }
  });

  it("au-delà de trois jetons fautifs, le message en cite trois et le dit", () => {
    const r = lu("x y w v u", "hauteurs");
    expect("refus" in r && r.refus).toContain("« x », « y », « w », … illisible");
  });
});
