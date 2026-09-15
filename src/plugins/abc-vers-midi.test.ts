// plugins/abc-vers-midi.test.ts — Le nœud « ABC → MIDI » par le registre, comme
// le moteur l'appelle. La lecture elle-même est testée dans audio/abc.test.ts.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { parseMidi } from "midi-file";
import { registre } from "../audio/adaptateur";

const ctx = (entree: unknown, params: Record<string, string | number>) => ({
  entree: () => entree,
  entrees: () => [entree],
  paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
  paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
  onProgress: () => {},
  noeud: { data: {} },
  runtime: null,
});

const fiche = () => registre.trouverDef("abc-vers-midi")!;
const base = { "Synthèse": "FM/Oscillateurs" };

describe("nœud ABC → MIDI", () => {
  it("est enregistré, avec notice et documentation de chaque paramètre dans les deux langues", () => {
    const f = fiche();
    expect(f.notice!.length).toBeGreaterThan(200);
    expect(f.noticeEn!.length).toBeGreaterThan(200);
    for (const p of f.parametres ?? []) { expect(p.doc, p.nom).toBeTruthy(); expect(p.docEn, p.nom).toBeTruthy(); }
  });

  it("rend l'exemple par défaut : audio, MIDI multipiste et tonalité", async () => {
    const res = await fiche().executer(ctx(null, base) as any);
    expect(res.erreur).toBeFalsy();
    const [audio, midi, tonalite] = res.valeurs as [AudioBuffer, File, string];
    // Quatre mesures de 4/4 reprises = 32 noires à 120 = 16 s, plus la queue du rendu.
    expect(audio.duration).toBeGreaterThanOrEqual(16);
    expect(audio.duration).toBeLessThan(18);
    expect(tonalite).toBe("G major");
    const p = parseMidi(new Uint8Array(await midi.arrayBuffer()));
    expect(p.tracks.length).toBe(3); // tempo, mélodie, accords
    expect(res.message).toMatch(/^Speed the Plough · G major · 4\/4 · 120 BPM/);
  });

  it("préfère l'entrée texte au paramètre, et ignore la présentation et les blocs de code d'un LLM", async () => {
    const reponseLlm = "Bien sûr ! Voici une petite mélodie :\n\n```abc\nX:1\nT:Essai\nM:3/4\nL:1/4\nK:Am\nA B c | d3 |]\n```\nBonne écoute.";
    const res = await fiche().executer(ctx(reponseLlm, base) as any);
    expect(res.erreur).toBeFalsy();
    expect(res.valeurs[2]).toBe("A minor");
    expect(res.message).toMatch(/^Essai · A minor · 3\/4/);
    expect(res.message).not.toMatch(/non lu/);
  });

  it("choisit le morceau demandé et le dit", async () => {
    const fichier = "X:1\nT:Un\nK:C\nCDE\n\nX:2\nT:Deux\nK:D\nDEF";
    const res = await fiche().executer(ctx(fichier, { ...base, Morceau: 2 }) as any);
    expect(res.message).toMatch(/^Deux · D major/);
    expect(res.message).toMatch(/morceau 2 sur 2/);
  });

  it("nomme ce qui n'a pas été lu", async () => {
    const res = await fiche().executer(ctx("K:C\n{g}A B", base) as any);
    expect(res.erreur).toBeFalsy();
    expect(res.message).toMatch(/1 élément\(s\) non lu\(s\) : notes d'ornement/);
  });

  it("sans accords chiffrés joués, n'écrit que la mélodie", async () => {
    const res = await fiche().executer(ctx(null, { ...base, "Accords chiffrés": "ignorer" }) as any);
    const p = parseMidi(new Uint8Array(await (res.valeurs[1] as File).arrayBuffer()));
    expect(p.tracks.length).toBe(2);
  });

  it("écrit dans le MIDI les deux instruments choisis, chacun sur son canal", async () => {
    const res = await fiche().executer(ctx(null, { ...base, Instrument: 73, "Instrument accords": 24 }) as any);
    const p = parseMidi(new Uint8Array(await (res.valeurs[1] as File).arrayBuffer()));
    const programme = (piste: number) => (p.tracks[piste].find((e: any) => e.type === "programChange") as any);
    expect(programme(1)).toMatchObject({ channel: 0, programNumber: 73 });
    expect(programme(2)).toMatchObject({ channel: 1, programNumber: 24 });
  });

  it("refuse un texte sans partition, en disant pourquoi", async () => {
    const res = await fiche().executer(ctx("12345 !!! ???", base) as any);
    expect(res.erreur).toBe(true);
    expect(res.message).toMatch(/Aucune partition ABC/);
  });
});
