// audio/resonance-sans-eval.test.ts — `resonance-audio` ne construit plus de fonction par `Function`.
//
// Relevé le 2026-10-27 en passant le catalogue sous la politique stricte du document : la
// bibliothèque écrivait `this._rejectHandler = new Function();`, refusé sans `unsafe-eval`, et son
// chargeur de réponses impulsionnelles levait. Ces cas tiennent la substitution sur le paquet
// INSTALLÉ, pour qu'une version neuve qui déplacerait cette ligne fasse tomber le cas.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sansConstructeurFunction } from "./build-plugins";

const SOURCE = readFileSync(resolve(process.cwd(), "node_modules/resonance-audio/build/resonance-audio.js"), "utf8");

describe("resonance-audio, sans constructeur Function", () => {
  it("LA LIGNE EST DANS LE PAQUET INSTALLÉ, et la substitution la remplace", () => {
    const sortie = sansConstructeurFunction(SOURCE);
    expect(sortie).not.toMatch(/new Function\(/);
    expect(sortie).toContain("this._rejectHandler = function () {};");
  });

  it("IL N'EN RESTE AUCUNE AUTRE FORME dans la bibliothèque", () => {
    expect(sansConstructeurFunction(SOURCE)).not.toMatch(/[^A-Za-z0-9_.$]Function\(|[^A-Za-z0-9_.$]eval\(/);
  });

  it("UNE BIBLIOTHÈQUE OÙ LA LIGNE MANQUE FAIT LEVER, au lieu d'être crue réparée", () => {
    expect(() => sansConstructeurFunction("var x = 1;")).toThrow(/a disparu/);
  });
});
