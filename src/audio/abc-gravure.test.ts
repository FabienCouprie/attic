// audio/abc-gravure.test.ts — Le texte ABC que reçoit le graveur.
import { describe, expect, it } from "vitest";
import { dureesDansLesAccords, tempoGrave, texteDeTempo, tournuresNonGravees } from "./abc-gravure";

const air = (corps: string) => `X:1\nT:Essai\nM:4/4\nL:1/4\nK:C\n${corps}`;
const corps = (texte: string) => texte.split("\n").slice(5).join("\n");

describe("dureesDansLesAccords : la durée qui suit le crochet s'écrit dans chaque note (ABC 2.1, §4.17)", () => {
  it.each([
    ["[CEG]2", "[C2E2G2]"],
    ["[CEG]", "[CEG]"],
    ["[CE]/2 [CE]/ [CE]//", "[C/2E/2] [C/2E/2] [C/4E/4]"],
    ["[CE]3/2", "[C3/2E3/2]"],
    ["[C2E]2", "[C4E2]"],
    ["[C/E]4", "[C2E4]"],
    ["[^F_B,c']2", "[^F2_B,2c'2]"],
    ["[C-E]2", "[C2-E2]"],
    ["[CE]2-", "[C2E2]-"],
  ])("« %s » → « %s »", (avant, apres) => {
    expect(corps(dureesDansLesAccords(air(avant)))).toBe(apres);
  });

  it("ne touche ni l'en-tête, ni les champs, ni les chaînes, ni les ornements, ni les commentaires, ni les fins", () => {
    const texte = `X:1\nT:[CE]2\nM:4/4\nL:1/4\nK:C\n"[CE]2"C !trill![CE]2 {[CE]2}D [K:G] |: C [1 D :|[2 E |] % [CE]2\nw: [CE]2`;
    expect(dureesDansLesAccords(texte)).toBe(`X:1\nT:[CE]2\nM:4/4\nL:1/4\nK:C\n"[CE]2"C !trill![C2E2] {[CE]2}D [K:G] |: C [1 D :|[2 E |] % [CE]2\nw: [CE]2`);
  });

  it("ce qui se lit comme musique est seul relevé : ni les chaînes, ni les ornements, ni les commentaires, ni les liaisons d'expression", () => {
    const texte = air(`"|1 (5"C !5!D (CD) [K:clef=bass] E, | % |1 (5 [CE]2-\nw: |1 (5`);
    expect(tournuresNonGravees(texte)).toEqual([]);
  });

  it("chaque tournure, avec sa ligne comptée depuis X:, le texte de la ligne et le fragment", () => {
    const texte = `X:1\nM:4/4\nL:1/8\nK:C\n(3CDE (5CDEFG |1 [C-E]2 :|2 [K:G] F |\nV:2\nC`;
    expect(tournuresNonGravees(texte).map((t) => [t.raison, t.ligne, t.fragment, ...t.valeurs])).toEqual([
      ["nolet", 5, "(5", 5, 2, 4],
      ["fin", 5, "|1"],
      ["liaison", 5, "[C-E]2"],
      ["fin", 5, "|2"],
      ["tonalite", 5, "[K:G]"],
      ["voix", 6, "V:2"],
    ].map((t) => (t[0] === "voix" ? [...t, "1, 2"] : t)));
  });

  it("une seule voix n'est rien ; la seconde est nommée avec la première", () => {
    expect(tournuresNonGravees(air("V:1\nC D |\nV:1\nE F |"))).toEqual([]);
    expect(tournuresNonGravees(air("V:A\nC D |\nV:B\nE F |")).map((t) => [t.raison, t.ligne, ...t.valeurs])).toEqual([["voix", 8, "A, B"]]);
  });

  it("le second nombre d'un n-olet est celui de la norme, selon la métrique en cours", () => {
    const nolets = (m: string, n: string) => tournuresNonGravees(`X:1\nM:${m}\nL:1/8\nK:C\n${n}`).map((t) => t.valeurs);
    expect(nolets("4/4", "(2CD (3CDE (4CDEF (5:4CDEFG")).toEqual([]);
    expect(nolets("6/8", "(5CDEFG")).toEqual([[5, 3, 4]]);
    expect(nolets("4/4", "(6CDEFGA (8CDEFGAB c")).toEqual([[6, 2, 4], [8, 3, 6]]);
  });

  it("le texte d'un tempo : la figure réduite, le mouvement nommé d'abord, rien sans chiffre", () => {
    expect(texteDeTempo("2/8=60", [1, 8])).toBe("♩ = 60");
    expect(texteDeTempo("3/8=50", [1, 8])).toBe("♪. = 50");
    expect(texteDeTempo("5/8=50", [1, 8])).toBe("5/8 = 50");
    expect(texteDeTempo("1/4=88.5 \"Lent\"", [1, 8])).toBe("Lent ♩ = 88.5");
    expect(texteDeTempo("100", [1, 16])).toBe("\u{1D161} = 100");
    expect(texteDeTempo("\"Andante\"", [1, 8])).toBeNull();
  });

  it("chaque Q: d'un texte reçoit son texte, l'unité L de son air comptant pour l'ancienne forme", () => {
    const texte = "X:1\nL:1/4\nQ:120\nK:C\nC [Q:1/8=90] D\n\nX:2\nM:2/4\nQ:60\nK:C\nC";
    expect(tempoGrave(texte)).toBe(`X:1\nL:1/4\nQ:"♩ = 120" 120\nK:C\nC [Q:"♪ = 90" 1/8=90] D\n\nX:2\nM:2/4\nQ:"\u{1D161} = 60" 60\nK:C\nC`);
  });

  it("lit chaque air d'un texte, et laisse ce qui précède le premier", () => {
    const texte = `[CE]2\nX:1\nK:C\n[CE]2\n\nX:2\nT:[CE]2\nK:C\n[CE]2`;
    expect(dureesDansLesAccords(texte)).toBe(`[CE]2\nX:1\nK:C\n[C2E2]\n\nX:2\nT:[CE]2\nK:C\n[C2E2]`);
  });
});
