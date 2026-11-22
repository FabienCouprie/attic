// @vitest-environment jsdom
// plugins/musicxml-grave.test.ts — Ce qu'un musicien lit sur le MusicXML gravé est ce que le nœud a reçu.
//
// LA REVUE DES NOTATIONS EN TEXTE, douzième format, 2026-11-22. Tout passe par `executer` : le nœud MusicXML
// écrit, la Partition gravée le grave par Verovio, et `lireGravure` relit le SVG comme un musicien. Aucune
// lecture ne demande rien au code qui a écrit.
//
// LA RÉFÉRENCE : le référentiel MusicXML 4.0 du W3C. `<alter>` « represents chromatic alteration », c'est la
// hauteur ; `<accidental>` « represents actual notated accidentals », c'est le signe dessiné. Les trois
// chemins n'écrivaient que le premier, et fa dièse, si bémol et do dièse se gravaient fa, si et do.
//
// DÉCISION DE FABIEN DU 2026-11-22, « Nearest quarter-tone sign » : un quart de ton prend son signe, un
// autre écart celui du quart de ton le plus proche, et `<alter>` garde la valeur exacte.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { lireGravure, type NoteLue } from "./partition-lue";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
/** Une séquence à 60, où un temps vaut une seconde. */
const sequence = (notes: NoteLue[]) => ({ notes: notes.map(([note, debut, fin]) => ({ note, debut, fin, velocite: 90 })), tempo: 60 });

/** Écrit, grave, et relit. */
async function graver(entrees: unknown[], reglages: Record<string, string | number> = {}) {
  const x = await lancerFiche(F("musicxml"), { Tempo: 60, ...reglages }, { entrees });
  const xml = String(x.valeurs[0] ?? "");
  const g = await lancerFiche(F("partition-verovio"), {}, { entrees: [xml] });
  const lu = lireGravure(String(g.valeurs[0] ?? ""));
  return { x, xml, lu, notes: lu.notes.map(([m, d, f]) => [m, +d.toFixed(3), +f.toFixed(3)]) };
}

describe("LES ALTÉRATIONS SE DESSINENT, ET SE LISENT COMME ELLES SONNENT", () => {
  it.each([
    ["dièse, bémol, dièse, puis le do naturel", [[66, 0, 1], [70, 1, 2], [73, 2, 3], [72, 3, 4]]],
    ["le bécarre après le dièse, dans la mesure", [[66, 0, 1], [65, 1, 2], [67, 2, 4]]],
    ["une altération qui vaut jusqu'à la barre, puis se redit", [[66, 0, 1], [66, 1, 2], [64, 2, 4], [66, 4, 8]]],
    ["les quarts de ton, par leurs signes", [[60.5, 0, 1], [61.5, 1, 2], [69.5, 2, 4]]],
  ] as [string, NoteLue[]][])("depuis une séquence : %s", async (_titre, notes) => {
    const r = await graver([null, sequence(notes), null]);
    expect(r.x.erreurRendue, r.x.message).toBe(false);
    expect(r.lu.inconnus).toEqual([]);
    expect(r.notes).toEqual(notes);
  }, 60_000);

  it("une altération ne se redit pas dans la mesure", async () => {
    const r = await graver([null, sequence([[66, 0, 1], [66, 1, 2], [64, 2, 4], [66, 4, 8]]), null]);
    expect([...r.xml.matchAll(/<accidental>sharp<\/accidental>/g)]).toHaveLength(2);
  }, 60_000);

  it("un écart quelconque prend le signe du quart de ton le plus proche, et l'altération exacte", async () => {
    const r = await graver([null, sequence([[60.37, 0, 4]]), null]);
    expect(r.notes).toEqual([[60.5, 0, 4]]);
    expect(r.xml).toContain("<alter>0.37</alter>");
    expect(r.xml).toContain("<accidental>quarter-sharp</accidental>");
  }, 60_000);

  it.each([
    ["dièse, bémol, dièse", [[66, 0, 1], [70, 1, 2], [73, 2, 4]]],
    ["le bécarre après le dièse", [[66, 0, 1], [65, 1, 2], [67, 2, 4]]],
  ] as [string, NoteLue[]][])("depuis un arbre : %s", async (_titre, notes) => {
    const r = await graver([null, sequence(notes), "(4/4 (1 1 2))"]);
    expect(r.x.erreurRendue, r.x.message).toBe(false);
    expect(r.lu.inconnus).toEqual([]);
    expect(r.notes).toEqual(notes);
  }, 60_000);
});
