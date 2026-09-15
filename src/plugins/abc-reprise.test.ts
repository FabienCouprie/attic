// plugins/abc-reprise.test.ts — Le nœud « Reprise ABC » par le registre.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";
import { lireMorceau } from "../audio/abc";

const ctx = (entree: unknown, params: Record<string, string | number>) => ({
  entree: () => entree,
  entrees: () => [entree],
  paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
  paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
  onProgress: () => {},
  noeud: { data: {} },
  runtime: null,
});
const fiche = () => registre.trouverDef("reprise-abc")!;
const AIR = `X:1\nT:Essai\nM:4/4\nL:1/8\nQ:1/4=100\nK:G\n"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BGAF "D"G4|]`;

describe("nœud Reprise ABC", () => {
  it("est documenté dans les deux langues", () => {
    const f = fiche();
    expect(f.notice!.length).toBeGreaterThan(300);
    for (const p of f.parametres ?? []) { expect(p.doc, p.nom).toBeTruthy(); expect(p.docEn, p.nom).toBeTruthy(); }
  });

  it("rend audio, MIDI, ABC à trois voix et rapport", async () => {
    const r = await fiche().executer(ctx(AIR, { "Synthèse": "FM/Oscillateurs", Style: "pop" }) as any);
    expect(r.erreur, r.message).toBeFalsy();
    const [audio, midi, abc, rapport] = r.valeurs as [AudioBuffer, File, string, string];
    // Quatre mesures de 4/4 à 100 : 9,6 s, plus la queue du rendu.
    expect(audio.duration).toBeGreaterThanOrEqual(9.6);
    expect(midi).toBeInstanceOf(File);
    expect(lireMorceau(abc).voix.length).toBe(3);
    expect(rapport).toMatch(/mélodie et accords vérifiés intacts/);
    expect(r.message).toMatch(/^Reprise « pop » · 100 BPM/);
  });

  it("dit pourquoi il refuse une partition sans accords", async () => {
    const r = await fiche().executer(ctx("X:1\nM:4/4\nL:1/4\nK:C\nC D E F|]", {}) as any);
    expect(r.erreur).toBe(true);
    expect(r.message).toMatch(/pas d'accords chiffrés/);
    expect(r.valeurs[3]).toMatch(/pas d'accords chiffrés/);
  });
});
