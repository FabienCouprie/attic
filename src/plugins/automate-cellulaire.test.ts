// plugins/automate-cellulaire.test.ts
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { fiches } from "./automate-cellulaire";

function trouver(id: string) { return fiches.find((f) => f.id === id); }

const ctx = {
  entree: () => null,
  entrees: () => [],
  paramTexte: (nom: string, def: string) => {
    const params: Record<string, string> = {
      Règle: "90", Mode: "Polyphonie", Clé: "Do", Gamme: "Pentatonique majeure", Synthèse: "FM/Oscillateurs",
    };
    return params[nom] ?? def;
  },
  paramNombre: (nom: string, def: number) => {
    const params: Record<string, number> = {
      Largeur: 8, Générations: 8, Graine: 0, Octave: 4, "Durée note": 0.25, Vélocité: 100, Volume: 80,
    };
    return params[nom] ?? def;
  },
  onProgress: () => {},
};

describe("automate-cellulaire plugin", () => {
  it("est enregistré", () => {
    expect(trouver("automate-cellulaire")).toBeDefined();
  });

  it("produit audio et midi", async () => {
    const f = trouver("automate-cellulaire")!;
    const res = await f.executer(ctx as any);
    expect(res.valeurs.length).toBe(2);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(res.valeurs[1]).toBeInstanceOf(File);
    expect(res.message).toContain("Automate cellulaire");
  });
});
