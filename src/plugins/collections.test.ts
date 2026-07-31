// plugins/collections.test.ts — Vérifications des nœuds Collections.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { registre } from "../audio/adaptateur";

describe("collections plugin", () => {
  const originalApi = (globalThis as any).window?.api;

  beforeAll(() => {
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.api = {
      lireDossier: async () => [
        { nom: "track1.mp3", chemin: "/music/track1.mp3" },
        { nom: "track2.wav", chemin: "/music/track2.wav" },
      ],
    };
  });

  afterAll(() => {
    if (originalApi !== undefined) {
      (globalThis as any).window.api = originalApi;
    } else {
      delete (globalThis as any).window.api;
    }
  });

  it("collection-lecteur-musique est enregistré et retourne un message", async () => {
    const f = registre.trouverDef("collection-lecteur-musique");
    expect(f).toBeDefined();
    expect(f?.entrees).toHaveLength(0);
    expect(f?.sorties).toHaveLength(0);
    const res = await f!.executer({
      entree: () => null,
      entrees: () => [],
      paramTexte: (nom: string, def: string) => (nom === "Chemin" ? "music collection" : def),
      paramNombre: (nom: string, def: number) => def,
      onProgress: () => {},
      noeud: { data: {} },
      runtime: null,
    } as any);
    expect(res.valeurs).toHaveLength(1);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toMatch(/Lecteur musique|Music player/);
  });
});
