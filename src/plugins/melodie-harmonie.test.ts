// plugins/melodie-harmonie.test.ts — Le nœud « Mélodie sur l'harmonie » : branché sur l'harmonie du
// nœud du lot 1, il rend une mélodie dans la plage, qui revient avec sa section, à la graine près.
//
// Ce que la marche garantit est éprouvé par la loi dans `audio/soundhelix-melodie.test.ts`. Ici on
// vérifie le CÂBLAGE : le fichier, la plage et la transposition, les retours de section, la matrice,
// l'entrée « Motif », la graine, et la faute dans les deux langues.

import { parseMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { lancerFiche } from "../audio/lancer-fiche";
import { fiches as fichesHarmonie } from "./harmonie-motifs";
import { fiches } from "./melodie-harmonie";

const fiche = fiches.find((f) => f.id === "melodie-harmonie")!;
const ficheHarmonie = fichesHarmonie.find((f) => f.id === "harmonie-motifs")!;

/** Huit sections d'une mesure : la mineur et fa, puis do et sol, quatre fois. */
async function harmonie(): Promise<File> {
  return (await lancerFiche(ficheHarmonie, { "Motifs d'accords": "Am/2,F/2,+C/2,G/2", Mesures: 8, "Tics par temps": "4",
    "Renversement au plus proche": 0 }, { entrees: [] })).valeurs[0] as File;
}

/** Les départs d'un fichier : [tic, hauteur]. */
async function departs(v: unknown): Promise<number[][]> {
  const midi = parseMidi(new Uint8Array(await (v as File).arrayBuffer()));
  let tic = 0;
  const out: number[][] = [];
  for (const e of midi.tracks[0]) { tic += e.deltaTime; if (e.type === "noteOn") out.push([tic, e.noteNumber]); }
  return out;
}

describe("le nœud Mélodie sur l'harmonie", () => {
  it("rend une mélodie dans la plage, qui revient avec sa section, et la graine fixe le tirage", async () => {
    const h = await harmonie();
    const r = await lancerFiche(fiche, { "Mélodies par section": "1", "Hauteur min": 0, "Hauteur max": 12, Transposition: 12, Graine: 3 },
      { entrees: [h, null, null] });
    expect(r.erreurRendue).toBe(false);
    const d = await departs(r.valeurs[0]);
    expect(d.length).toBeGreaterThan(16);
    for (const [, p] of d) { expect(p).toBeGreaterThanOrEqual(72); expect(p).toBeLessThanOrEqual(84); }
    // Une mélodie par sorte : la troisième section, la mineur et fa comme la première, la rejoue.
    const section = (k: number) => d.filter(([t]) => t >= 16 * k && t < 16 * (k + 1)).map(([t, p]) => [t - 16 * k, p]);
    expect(section(2)).toEqual(section(0));
    expect(section(3)).toEqual(section(1));
    expect(r.message).toBe(`${d.length} notes · graine 3`);
    expect((await lancerFiche(fiche, { Graine: 3 }, { entrees: [h, null, null] })).valeurs[0]).not.toBe(undefined);
    const a = await departs((await lancerFiche(fiche, { Graine: 5 }, { entrees: [h, null, null] })).valeurs[0]);
    const b = await departs((await lancerFiche(fiche, { Graine: 5 }, { entrees: [h, null, null] })).valeurs[0]);
    expect(a).toEqual(b);
    expect(await departs((await lancerFiche(fiche, { Graine: 6 }, { entrees: [h, null, null] })).valeurs[0])).not.toEqual(a);
  });

  it("deux mélodies par sorte alternent aux retours", async () => {
    const r = await lancerFiche(fiche, { "Mélodies par section": "2", Graine: 4 }, { entrees: [await harmonie(), null, null] });
    const d = await departs(r.valeurs[0]);
    const section = (k: number) => d.filter(([t]) => t >= 16 * k && t < 16 * (k + 1)).map(([t, p]) => [t - 16 * k, p]);
    expect(section(4)).toEqual(section(0));
    expect(section(2)).not.toEqual(section(0));
  });

  it("suit la matrice, et prend le rythme sur son entrée", async () => {
    const h = await harmonie();
    const r = await lancerFiche(fiche, { Voix: "chant" }, { entrees: [h, "chant  x.x.x.x.", "#/16"] });
    const d = await departs(r.valeurs[0]);
    expect(d.map(([t]) => t)).toEqual([0, 32, 64, 96]);
    expect(r.message).toMatch(/voix « chant »/);
  });

  it("une faute se dit : des pas illisibles, une voix absente", async () => {
    const h = await harmonie();
    const pas = await lancerFiche(fiche, { Pas: "1,a" }, { entrees: [h, null, null] });
    expect(pas.erreurRendue).toBe(true);
    expect(pas.message).toMatch(/illisibles/);
    const voix = await lancerFiche(fiche, { Voix: "chant" }, { entrees: [h, "basse  xxxxxxxx", null] });
    expect(voix.message).toMatch(/pas de voix « chant »/);
  });
});
