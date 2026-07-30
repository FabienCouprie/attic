// plugins/generateurs.test.ts — Tests rapides des nœuds générateurs.
// On passe par le registre pour éviter la dépendance circulaire directe
// entre generateurs.ts et audio/adaptateur.ts.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

function ctx(sequenceNotes: any[]) {
  return {
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, def: string) => {
      const params: Record<string, string> = { Synthèse: "FM/Oscillateurs" };
      return params[nom] ?? def;
    },
    paramNombre: (nom: string, def: number) => {
      const params: Record<string, number> = {
        Instrument: 0,
        Tempo: 120,
        Volume: 80,
      };
      return params[nom] ?? def;
    },
    onProgress: () => {},
    noeud: { data: { sequenceNotes } },
    runtime: null,
  };
}

function ctxParams(params: Record<string, string | number>) {
  return {
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
    paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

function bufferNonSilencieux(b: AudioBuffer) {
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    if (d.some((s) => Math.abs(s) > 0.001)) return true;
  }
  return false;
}

describe("generateurs plugin", () => {
  it("Clavier mélodie produit audio et MIDI", async () => {
    const f = registre.trouverDef("clavier-melodie")!;
    const res = await f.executer(ctx([
      { note: 60, velocite: 100, debut: 0, fin: 0.5 },
      { note: 64, velocite: 100, debut: 0.5, fin: 1.0 },
    ]) as any);
    expect(res.valeurs.length).toBe(2);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(res.valeurs[1]).toBeInstanceOf(File);
    expect((res.valeurs[1] as File).type).toBe("audio/midi");
  });

  it("Clavier mélodie retourne null si aucune séquence", async () => {
    const f = registre.trouverDef("clavier-melodie")!;
    const ctxSansNotes = {
      entree: () => null,
      entrees: () => [],
      paramTexte: (nom: string, def: string) => ({ Synthèse: "FM/Oscillateurs" })[nom] ?? def,
      paramNombre: (nom: string, def: number) => ({ Instrument: 0, Tempo: 120, Volume: 80 })[nom] ?? def,
      onProgress: () => {},
      noeud: { data: {} },
      runtime: null,
    };
    const res = await f.executer(ctxSansNotes as any);
    expect(res.valeurs.length).toBe(2);
    expect(res.valeurs[0]).toBeNull();
    expect(res.valeurs[1]).toBeNull();
  });

  it("Générateur de fréquence : forme Square fonctionne avec id canonique", async () => {
    const f = registre.trouverDef("generateur-frequence")!;
    const res = await f.executer(ctxParams({ Saisie: "frequency", Fréquence: 440, Forme: "square", Durée: 0.1, Volume: 80 }) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(bufferNonSilencieux(res.valeurs[0] as AudioBuffer)).toBe(true);
  });

  it("Générateur de fréquence : forme Saw fonctionne avec libellé anglais", async () => {
    const f = registre.trouverDef("generateur-frequence")!;
    const res = await f.executer(ctxParams({ Saisie: "Frequency (Hz)", Fréquence: 440, Forme: "Saw", Durée: 0.1, Volume: 80 }) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(bufferNonSilencieux(res.valeurs[0] as AudioBuffer)).toBe(true);
  });

  it("Métronome : timbre Beep fonctionne avec id canonique", async () => {
    const f = registre.trouverDef("metronome")!;
    const res = await f.executer(ctxParams({ Tempo: 120, Signature: "4/4", Durée: 1, Timbre: "beep", Volume: 80 }) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(bufferNonSilencieux(res.valeurs[0] as AudioBuffer)).toBe(true);
  });
});
