// core/remises.test.ts — Le registre des remises à zéro et des oublis, par numéro.
import { describe, expect, it } from "vitest";

import { creerRemises } from "./remises";

describe("le registre des remises", () => {
  it("UN NŒUD NOTÉ APRÈS LE DÉPART EST PÉRIMÉ, et seulement lui", () => {
    const r = creerRemises();
    r.noter(4, ["a"], false);
    expect(r.depuis("a", 3)).toBe(true);
    expect(r.depuis("a", 4)).toBe(false);
    expect(r.depuis("b", 3)).toBe(false);
  });

  it("TOUT NOTER PÉRIME TOUT ce qui est parti avant", () => {
    const r = creerRemises();
    r.noter(2, "tout", false);
    expect(r.depuis("x", 1)).toBe(true);
    expect(r.depuis("m::x", 1)).toBe(true);
    expect(r.depuis("x", 2)).toBe(false);
  });

  it("LE CONTENU D'UN MÉTA SUIT LA RÈGLE DU `::`, à toute profondeur, s'il est noté avec lui", () => {
    const r = creerRemises();
    r.noter(5, ["m"], true);
    expect(r.depuis("m::a", 4)).toBe(true);
    expect(r.depuis("m::n::b", 4)).toBe(true);
    expect(r.depuis("mx::a", 4)).toBe(false);
    const simple = creerRemises();
    simple.noter(5, ["m"], false);
    expect(simple.depuis("m", 4)).toBe(true);
    expect(simple.depuis("m::a", 4)).toBe(false);
  });

  it("UNE NOTE PLUS ANCIENNE N'EFFACE PAS UNE PLUS RÉCENTE", () => {
    const r = creerRemises();
    r.noter(7, ["a"], true);
    r.noter(3, ["a"], false);
    expect(r.depuis("a::x", 6)).toBe(true);
    expect(r.depuis("a", 6)).toBe(true);
  });
});
