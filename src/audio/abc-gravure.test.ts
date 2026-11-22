// audio/abc-gravure.test.ts — Le texte ABC que reçoit le graveur.
import { describe, expect, it } from "vitest";
import { dureesDansLesAccords } from "./abc-gravure";

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

  it("lit chaque air d'un texte, et laisse ce qui précède le premier", () => {
    const texte = `[CE]2\nX:1\nK:C\n[CE]2\n\nX:2\nT:[CE]2\nK:C\n[CE]2`;
    expect(dureesDansLesAccords(texte)).toBe(`[CE]2\nX:1\nK:C\n[C2E2]\n\nX:2\nT:[CE]2\nK:C\n[C2E2]`);
  });
});
