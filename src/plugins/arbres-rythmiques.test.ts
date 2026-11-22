// plugins/arbres-rythmiques.test.ts — Un arbre rythmique se lit selon OpenMusic, et ce qu'il ne définit pas est refusé.
//
// LA REVUE DES NOTATIONS EN TEXTE, neuvième format, 2026-11-22. La référence est le manuel d'OpenMusic,
// « Rhythm Trees Structure » et « Notation : in Practice » : le silence est négatif, « .0 » lie à la
// note précédente, « les valeurs entre 0 et 1 ne sont pas acceptées ». Tout passe par `executer` : le
// déroulé se mesure par le Rythme sur hauteurs, au tempo de 60, où une seconde vaut une noire.
//
// DÉCISION DE FABIEN DU 2026-11-22, « Refuse them, named » : ce que le manuel ne définit pas, une
// liaison sans note devant elle, un silence lié, une division qui porte un signe, est refusé, et le
// message nomme le jeton et sa position. Mesuré ce jour-là : la liaison derrière un silence prolongeait
// le silence, et un silence lié prolongeait la note d'avant, si bien que le silence écrit sonnait.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { estSequence } from "../audio/sequence";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Le déroulé d'un arbre, en noires au tempo de 60, par le Rythme sur hauteurs. */
async function deroule(arbre: string) {
  const r = await lancerFiche(F("rythme-sur-hauteurs"), { Tempo: 60, Hauteurs: "60" }, { entrees: [arbre, null, null] });
  const seq = r.valeurs[0];
  return { r, notes: estSequence(seq) ? seq.notes.map((n) => [r3(n.debut), r3(n.fin)]) : null };
}

describe("UN ARBRE SE DÉROULE COMME LE DIT SA NOTATION", () => {
  it.each([
    ["des noires", "(4/4 (1 1 1 1))", [[0, 1], [1, 2], [2, 3], [3, 4]]],
    ["un triolet", "(4/4 (1 (1 (1 1 1)) 1 1))", [[0, 1], [1, 1.333], [1.333, 1.667], [1.667, 2], [2, 3], [3, 4]]],
    ["un silence", "(4/4 (1 -1 1 1))", [[0, 1], [2, 3], [3, 4]]],
    ["une liaison", "(4/4 (1 1.0 1 1))", [[0, 2], [2, 3], [3, 4]]],
    ["une liaison à travers la barre", "((4/4 (1 1 1 1)) (4/4 (1.0 1 1 1)))", [[0, 1], [1, 2], [2, 3], [3, 5], [5, 6], [6, 7], [7, 8]]],
    ["une liaison vers une division", "(4/4 (1 (1 (1.0 1)) 1 1))", [[0, 1.5], [1.5, 2], [2, 3], [3, 4]]],
  ])("%s", async (_titre, arbre, attendu) => {
    const { r, notes } = await deroule(arbre);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(notes).toEqual(attendu);
  }, 60_000);
});

describe("CE QUE LA NOTATION N'ACCEPTE PAS, OU NE DÉFINIT PAS, EST REFUSÉ, et le message nomme le jeton", () => {
  it.each([
    ["un poids nul", "(4/4 (1 0 1 1))", "« 0 »"],
    ["une valeur entre 0 et 1", "(4/4 (1 0.5 1))", "« 0.5 »"],
    ["une liaison derrière un silence", "(4/4 (-1 1.0 1 1))", "« 1.0 »"],
    ["un silence lié", "(4/4 (1 -1.0 1 1))", "« -1.0 »"],
    ["une liaison en tête", "(4/4 (1.0 1 1 1))", "« 1.0 »"],
    ["une division négative", "(4/4 (1 (-1 (1 1)) 1 1))", "« -1 »"],
    ["une division liée", "(4/4 (1 (1.0 (1 1)) 1 1))", "« 1.0 »"],
    ["une métrique sans unité", "(4/0 (1 1))", "« 4/0 »"],
    ["une métrique sans temps", "(0/4 (1 1))", "« 0/4 »"],
    ["une mesure sans proportion", "(4/4 ())", "« ( »"],
  ])("%s : « %s »", async (_titre, arbre, cite) => {
    const { r, notes } = await deroule(arbre);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.message).toContain(cite);
    expect(notes).toBe(null);
  }, 60_000);
});

describe("CE QU'ÉCRIT ATTIC SE RELIT : le catalogue, le tirage et le Quantifier n'écrivent rien de refusé", () => {
  it("les arbres du catalogue", async () => {
    const fautifs: string[] = [];
    for (let numero = 0; numero < 340; numero++) {
      const a = await lancerFiche(F("arbre-rythmique"), { Source: "catalogue", "Numéro": numero }, { entrees: [] });
      const { r } = await deroule(String(a.valeurs[0]));
      if (r.erreurRendue) fautifs.push(`${numero} ${a.valeurs[0]} : ${r.message}`);
    }
    expect(fautifs).toEqual([]);
  }, 600_000);

  it("les arbres tirés, sur cent graines et quatre longueurs", async () => {
    const fautifs: string[] = [];
    for (let graine = 1; graine <= 100; graine++) {
      const a = await lancerFiche(F("arbre-rythmique"), { Source: "tirage", Graine: graine, Mesures: 1 + (graine % 4) }, { entrees: [] });
      const { r } = await deroule(String(a.valeurs[0]));
      if (r.erreurRendue) fautifs.push(`${graine} ${a.valeurs[0]} : ${r.message}`);
    }
    expect(fautifs).toEqual([]);
  }, 600_000);

  it("l'arbre du Quantifier se déroule comme la séquence qu'il rend", async () => {
    const notes = [[60, 0, 0.5], [62, 0.5, 0.83], [64, 0.83, 1.17], [65, 1.17, 1.5], [67, 1.5, 2.6], [69, 2.6, 4]].map(([note, debut, fin]) => ({ note, debut, fin, velocite: 100 }));
    const q = await lancerFiche(F("quantifier-rythme"), { Tempo: 60 }, { entrees: [{ notes, tempo: 60 }] });
    const sa = q.valeurs[1];
    const { r, notes: relues } = await deroule(String(q.valeurs[0]));
    expect(r.erreurRendue, r.message).toBe(false);
    expect(relues).toEqual(estSequence(sa) ? sa.notes.map((n) => [r3(n.debut), r3(n.fin)]) : null);
  }, 60_000);
});
