// plugins/texte-image.test.ts — Vérification de l'enregistrement du nœud Texte → image.
import { describe, it, expect } from "vitest";
import { fiches } from "./texte-image";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

describe("nœud Texte → image", () => {
  it("le nœud texte-image est enregistré", () => {
    expect(trouver("texte-image")).toBeDefined();
  });

  it("a une sortie image et une entrée prompt non obligatoire", () => {
    const f = trouver("texte-image")!;
    expect(f.sorties).toEqual([{ nom: "Image", type: "image" }]);
    expect(f.entrees[0].requis).toBe(false);
  });

  it("retourne une erreur si l'API bureau n'est pas disponible", async () => {
    const f = trouver("texte-image")!;
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

  it("est cachable pour éviter de regénérer lorsqu'un nœud aval est rejoué", () => {
    const f = trouver("texte-image")!;
    expect(f.jamaisCache).toBeUndefined();
  });
});
