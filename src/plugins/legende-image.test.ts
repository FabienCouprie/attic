// plugins/legende-image.test.ts — Vérification de l'enregistrement du nœud Légende d'image.
import { describe, it, expect } from "vitest";
import { fiches } from "./legende-image";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

describe("nœud Légende d'image", () => {
  it("le nœud legende-image est enregistré", () => {
    expect(trouver("legende-image")).toBeDefined();
  });

  it("a une entrée image et une sortie texte", () => {
    const f = trouver("legende-image")!;
    expect(f.entrees).toEqual([{ nom: "Image", type: "image" }]);
    expect(f.sorties).toEqual([{ nom: "Texte", nomEn: "Text", type: "texte" }]);
  });

  it("retourne un message si aucune image n'est connectée", async () => {
    const f = trouver("legende-image")!;
    const ctx = {
      entree: () => null,
      paramNombre: (_nom: string, defaut: number) => defaut,
      onProgress: (_msg: string) => {},
    };
    const res = await f.executer(ctx as any);
    expect(res.valeurs[0]).toBeNull();
  });

  it("est cachable pour éviter de regénérer lorsqu'un nœud aval est rejoué", () => {
    const f = trouver("legende-image")!;
    expect(f.jamaisCache).toBeUndefined();
  });
});
