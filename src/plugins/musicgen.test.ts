// plugins/musicgen.test.ts — Vérification de l’enregistrement du nœud MusicGen.
// Le modèle Transformers.js nécessite un navigateur + WASM + réseau ; on ne
// teste ici que la fiche et la validation d’entrée.
import { describe, it, expect } from "vitest";
import { fiches } from "./musicgen";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

function ctxVide() {
  return {
    entree: (_idx: number) => null,
    paramTexte: (nom: string, defaut: string) => defaut,
    paramNombre: (_nom: string, defaut: number) => defaut,
    onProgress: (_msg: string) => {},
  };
}

describe("nœud MusicGen", () => {
  it("la fiche est enregistrée", () => {
    expect(trouver("musicgen")).toBeDefined();
  });

  it("retourne un message d’erreur si aucun prompt n’est fourni", async () => {
    const f = trouver("musicgen")!;
    const ctx = {
      ...ctxVide(),
      entree: (_idx: number) => "",
      paramTexte: (nom: string, defaut: string) => (nom === "Prompt" ? "" : defaut),
    };
    const res = await f.executer(ctx as any);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toBeDefined();
  });
});
