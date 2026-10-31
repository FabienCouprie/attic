// plugins/ddsp.test.ts — Vérification de l’enregistrement du nœud DDSP.
import { describe, it, expect } from "vitest";
import { ctxDEssai } from "../core/contexte-essai";
import { fiches } from "./ddsp";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

describe("nœud DDSP", () => {
  it("le nœud tone-transfer est enregistré", () => {
    expect(trouver("ddsp-tone-transfer")).toBeDefined();
  });

  it("retourne une erreur si aucun audio n'est connecté", async () => {
    const f = trouver("ddsp-tone-transfer")!;
    const ctx = ctxDEssai([]);
    const res = await f.executer(ctx as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("audio");
  });
});
