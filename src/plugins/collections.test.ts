// plugins/collections.test.ts — Vérifications des nœuds Collections.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { registre } from "../audio/adaptateur";
import { ctxDEssai } from "../core/contexte-essai";

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
    const res = await f!.executer(ctxDEssai([], { Chemin: "music collection" }) as any);
    expect(res.valeurs).toHaveLength(1);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toMatch(/Lecteur musique|Music player/);
  });
});
