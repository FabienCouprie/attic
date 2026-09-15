// plugins/midi-vers-abc.test.ts — Le nœud « MIDI → ABC » par le registre, en
// chaîne avec « ABC → MIDI » et le Groove Box, comme dans un graphe.
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
const noeud = (id: string) => registre.trouverDef(id)!;
const FM = { "Synthèse": "FM/Oscillateurs" };

describe("nœud MIDI → ABC", () => {
  it("est enregistré, avec notice et documentation de chaque paramètre dans les deux langues", () => {
    const f = noeud("midi-vers-abc");
    expect(f.notice!.length).toBeGreaterThan(200);
    for (const p of f.parametres ?? []) { expect(p.doc, p.nom).toBeTruthy(); expect(p.docEn, p.nom).toBeTruthy(); }
  });

  it("boucle ABC → MIDI → ABC → MIDI sans perdre une note", async () => {
    const abc = `X:1\nT:Boucle\nM:3/4\nL:1/8\nQ:1/4=96\nK:D\n"D"d2 fe dc|"G"B2 AG FE|"A"(3ABc d2 c2|"D"d6|]`;
    const midi1 = (await noeud("abc-vers-midi").executer(ctx(abc, FM) as any)).valeurs[1] as File;
    const r = await noeud("midi-vers-abc").executer(ctx(midi1, { "Métrique": "3/4" }) as any);
    expect(r.erreur).toBeFalsy();
    const abc2 = r.valeurs[0] as string;
    const midi2 = (await noeud("abc-vers-midi").executer(ctx(abc2, FM) as any)).valeurs[1] as File;
    const octets = async (f: File) => [...new Uint8Array(await f.arrayBuffer())];
    // Les deux MIDI portent les mêmes notes ; on compare par la relecture ABC,
    // indépendante de l'ordre des pistes.
    const notes = (t: string) => lireMorceau(t).voix.flatMap((v) => v.notes.map((n) => `${n.midi}@${n.debut}×${n.duree}`)).sort();
    const abc3 = (await noeud("midi-vers-abc").executer(ctx(midi2, { "Métrique": "3/4" }) as any)).valeurs[0] as string;
    expect(notes(abc3)).toEqual(notes(abc2));
    expect((await octets(midi2)).length).toBeGreaterThan(0);
    expect(r.message).toMatch(/grille exacte/);
    expect(r.valeurs[1]).toBe("D major");
  });

  it("écrit les quatre sorties MIDI du Groove Box, batterie comprise, sans erreur", async () => {
    const gb = await noeud("boite-groove").executer(ctx(null, { ...FM, "Clé": "E", "Gamme": "mineur", Graine: 3, "Nombre d'accords": 4 }) as any);
    const [, batterie, accords, basse, melodie] = gb.valeurs as [AudioBuffer, File, File, File, File];
    for (const f of [accords, basse, melodie]) {
      const r = await noeud("midi-vers-abc").executer(ctx(f, {}) as any);
      expect(r.erreur, r.message).toBeFalsy();
      expect(lireMorceau(r.valeurs[0] as string).avertissements).toEqual([]);
    }
    const rb = await noeud("midi-vers-abc").executer(ctx(batterie, {}) as any);
    expect(rb.erreur).toBe(true);
    expect(rb.message).toMatch(/batterie ignorée/);
  });

  it("donne la tonalité imposée à la main, et l'applique", async () => {
    const midi1 = (await noeud("abc-vers-midi").executer(ctx("K:C\n^F2 G2", FM) as any)).valeurs[1] as File;
    const r = await noeud("midi-vers-abc").executer(ctx(midi1, { "Tonalité": "G" }) as any);
    expect(r.message).toMatch(/K:G/);
    expect(r.valeurs[0]).toMatch(/K:G\nF2 G2/);
  });

  it("refuse une entrée qui n'est pas un MIDI", async () => {
    expect((await noeud("midi-vers-abc").executer(ctx(null, {}) as any)).erreur).toBe(true);
    const faux = new File([new Uint8Array([1, 2, 3, 4])], "x.mid");
    const r = await noeud("midi-vers-abc").executer(ctx(faux, {}) as any);
    expect(r.erreur).toBe(true);
    expect(r.message).toMatch(/illisible/);
  });
});
