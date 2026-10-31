// plugins/resonance.test.ts — Vérification de l’enregistrement du nœud Resonance Audio.
import { describe, it, expect } from "vitest";
import { fiches } from "./resonance";
import { ctxDEssai } from "../core/contexte-essai";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

describe("nœud Resonance Audio", () => {
  it("le nœud resonance-audio est enregistré", () => {
    expect(trouver("resonance-audio")).toBeDefined();
  });

  it("déclare l'échec si aucun audio n'est connecté", async () => {
    const f = trouver("resonance-audio")!;
    const ctx = ctxDEssai();
    const res = await f.executer(ctx as any);
    // Le contrat d'échec (`core/types.ts`) : un exécuteur qui ne peut rien rendre le DIT.
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("Aucune");
  });

  it("est cachable pour éviter de retraiter lorsqu’un nœud aval est rejoué", () => {
    const f = trouver("resonance-audio")!;
    expect(f.jamaisCache).toBeUndefined();
  });
});
