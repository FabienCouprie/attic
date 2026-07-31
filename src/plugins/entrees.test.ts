// plugins/entrees.test.ts — Tests rapides des nœuds d'entrée.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

function ctx() {
  return {
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, def: string) => {
      const params: Record<string, string> = {
        Genre: "pop",
        Clé: "C",
        Gamme: "majeur",
        "Instrument 1": "Piano",
        "Instrument 2": "Basse fretless",
        "Instrument 3": "Marimba",
      };
      return params[nom] ?? def;
    },
    paramNombre: (nom: string, def: number) => {
      const params: Record<string, number> = { Tempo: 120, Durée: 4, Volume: 80 };
      return params[nom] ?? def;
    },
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

describe("entrees plugin", () => {
  it("Générateur musical ne padde pas la fin de piste et sort audio + 3 MIDI", async () => {
    const f = registre.trouverDef("generateur-musical")!;
    const res = await f.executer(ctx() as any);
    expect(res.valeurs.length).toBe(4);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(res.valeurs[1]).toBeInstanceOf(File);
    expect(res.valeurs[2]).toBeInstanceOf(File);
    expect(res.valeurs[3]).toBeInstanceOf(File);
    expect((res.valeurs[1] as File).type).toBe("audio/midi");
    const buf = res.valeurs[0] as AudioBuffer;
    // 4 mesures de 1s à 120 BPM => durée ~4s, pas 5s (ancien padding de 1s)
    expect(buf.duration).toBeLessThan(4.5);
    expect(buf.duration).toBeGreaterThan(3.5);
  });
});
