// plugins/magenta.test.ts — Vérification de l’enregistrement des nœuds Magenta.
// Les modèles @magenta/music nécessitent un navigateur + WebGL + réseau ;
// on ne teste ici que l’enregistrement et les validations d’entrée.
import { describe, it, expect } from "vitest";
import { ctxDEssai } from "../core/contexte-essai";
import { fiches } from "./magenta";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

function ctxMidi(file: any) {
  return ctxDEssai([file]);
}

function ctxMidi2(file1: any, file2: any) {
  return ctxDEssai([file1, file2]);
}

describe("nœuds Magenta", () => {
  it("les sept fiches sont enregistrées", () => {
    const ids = [
      "magenta-drums", "magenta-continuation", "magenta-improvisation",
      "magenta-generer-melodie", "magenta-interpoler-midi", "magenta-generer-batterie",
      "magenta-humaniser-groove",
    ];
    for (const id of ids) expect(trouver(id)).toBeDefined();
  });

  it("la continuation retourne une erreur si aucun MIDI n'est connecté", async () => {
    const f = trouver("magenta-continuation")!;
    const res = await f.executer(ctxMidi(null) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("MIDI");
  });

  it("le générateur de mélodie retourne une erreur si aucun MIDI n'est connecté", async () => {
    const f = trouver("magenta-generer-melodie")!;
    const res = await f.executer(ctxMidi(null) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("MIDI");
  });

  it("l'interpolation retourne une erreur si un MIDI est manquant", async () => {
    const f = trouver("magenta-interpoler-midi")!;
    const res = await f.executer(ctxMidi2(null, null) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("MIDI");
  });

  it("l'humaniseur de groove retourne une erreur si aucun MIDI n'est connecté", async () => {
    const f = trouver("magenta-humaniser-groove")!;
    const res = await f.executer(ctxMidi(null) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toContain("MIDI");
  });

});
