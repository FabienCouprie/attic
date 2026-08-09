// plugins/continuation-stable-audio-3.test.ts — Vérification de l'enregistrement du nœud Continuation Stable Audio 3.
import { describe, it, expect } from "vitest";
import { fiches } from "./continuation-stable-audio-3";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

describe("continuation-stable-audio-3", () => {
  it("le nœud continuation-stable-audio-3 est enregistré", () => {
    expect(trouver("continuation-stable-audio-3")).toBeDefined();
  });

  it("est dans la bonne famille et univers", () => {
    const f = trouver("continuation-stable-audio-3")!;
    expect(f.univers).toBe("Autres");
    expect(f.famille).toBe("Test zone");
  });

  it("a les bonnes entrées / sorties", () => {
    const f = trouver("continuation-stable-audio-3")!;
    expect(f.entrees.map((e) => e.nom)).toEqual(["Audio", "Prompt"]);
    expect(f.sorties.map((s) => s.nom)).toEqual(["Audio"]);
  });

  it("retourne une erreur si l'API desktop est indisponible", async () => {
    const f = trouver("continuation-stable-audio-3")!;
    const ctx = {
      entree: () => null,
      paramTexte: () => "",
      paramNombre: () => 5,
      onProgress: () => {},
    };
    const result = await f.executer(ctx as any);
    expect(result.erreur).toBe(true);
    expect(result.message).toContain("Stable Audio 3");
  });
});
