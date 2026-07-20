// plugins/stable-audio-3.test.ts — Vérification de l’enregistrement du nœud Stable Audio 3.
import { describe, it, expect } from "vitest";
import { fiches } from "./stable-audio-3";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

describe("nœud Stable Audio 3", () => {
  it("le nœud stable-audio-3 est enregistré", () => {
    expect(trouver("stable-audio-3")).toBeDefined();
  });

  it("retourne une erreur si l’API bureau n’est pas disponible", async () => {
    const f = trouver("stable-audio-3")!;
    const ctx = {
      entree: () => null,
      paramTexte: (_nom: string, defaut: string) => defaut,
      paramNombre: (_nom: string, defaut: number) => defaut,
      onProgress: (_msg: string) => {},
    };
    const res = await f.executer(ctx as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("bureau");
  });

  it("est cachable pour éviter de regénérer lorsqu’un nœud aval est rejoué", () => {
    const f = trouver("stable-audio-3")!;
    expect(f.jamaisCache).toBeUndefined();
  });
});
