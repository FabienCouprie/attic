// plugins/pure-data.test.ts — Vérification de l'enregistrement du nœud Pure Data.
import { describe, it, expect } from "vitest";
import { fiches } from "./pure-data";
import { ctxDEssai } from "../core/contexte-essai";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

describe("nœud Pure Data", () => {
  it("le nœud pure-data est enregistré", () => {
    expect(trouver("pure-data")).toBeDefined();
  });

  it("retourne une erreur si aucun patch n'est chargé", async () => {
    const f = trouver("pure-data")!;
    const ctx = ctxDEssai();
    const res = await f.executer(ctx as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("Aucun patch");
  });
});
