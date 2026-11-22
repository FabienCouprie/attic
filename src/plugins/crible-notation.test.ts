// plugins/crible-notation.test.ts — L'expression du Crible de Xenakis se lit comme le dit sa documentation, et ce qui ne se lit pas est refusé.
//
// LA REVUE DES NOTATIONS EN TEXTE, dixième format, 2026-11-22, troisième lot. Tout passe par `executer`, et
// les degrés retenus se lisent dans le son : en « Rythme », le degré n sonne pendant la n-ième subdivision.
//
// LA RÉFÉRENCE : la notation de Christopher Ariza, « The Xenakis Sieve as Object » (Computer Music Journal,
// 2005), que lit `music21.sieve`. « | » est la réunion, « & » l'intersection, « - » le complément, en
// préfixe seulement, et les parenthèses groupent ; « & » se lit avant « | ». La différence s'y écrit
// « 3@0&-4@0 », et « 3@0-4@0 » y est une faute.
//
// DÉCISIONS DE FABIEN DU 2026-11-22 : « Read them », les opérateurs se lisent, et « Opération » vaut encore
// pour une expression qui n'en porte aucun ; « Refuse it, named », un fragment mal formé fait refuser le
// crible, et le message le nomme. Le fragment était jeté, et « 3@0 & 4@0 » se lisait comme une réunion.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";

const CRIBLE = registre.trouverDef("crible-xenakis") as unknown as FicheLancable;
const SUBDIVISION = 0.02;

const lancer = (crible: string, etendue: number, operation = "union") =>
  lancerFiche(CRIBLE, { Crible: crible, Opération: operation, Étendue: etendue, Lecture: "rythme", Subdivision: SUBDIVISION * 1000 }, { entrees: [] });

/** Les degrés qui sonnent : en « Rythme », le degré n occupe la n-ième subdivision, et les autres se taisent. */
function degresSonnants(v: unknown): number[] {
  const d = (v as AudioBuffer).getChannelData(0);
  const pas = SUBDIVISION * (v as AudioBuffer).sampleRate;
  const degres: number[] = [];
  for (let n = 0; n * pas < d.length; n++) {
    let crete = 0;
    for (let i = Math.round(n * pas); i < Math.min(d.length, Math.round((n + 1) * pas)); i++) crete = Math.max(crete, Math.abs(d[i]));
    if (crete > 0.05) degres.push(n);
  }
  return degres;
}

/** L'expression que le message dit appliquer : « Crible 3@0 ∩ 4@0 · 2 degrés retenus · période 12 ». */
const expressionDuMessage = (message: string) => /^(?:Crible|Sieve) (.+?) · \d+ /.exec(message)?.[1] ?? "";

describe("LE CRIBLE LIT LES OPÉRATEURS D'ARIZA, ET « OPÉRATION » COMBINE UNE LISTE SANS OPÉRATEUR", () => {
  it.each([
    ["une liste, combinée par « Opération »", "3@0 4@0", 24, "intersection", [0, 12]],
    ["« & », quel que soit « Opération »", "3@0 & 4@0", 24, "union", [0, 12]],
    ["« ∪ », quel que soit « Opération »", "3@0 ∪ 4@1", 12, "intersection", [0, 1, 3, 5, 6, 9]],
    ["le complément", "-3@0", 12, "union", [1, 2, 4, 5, 7, 8, 10, 11]],
    ["la différence écrite par l'intersection d'un complément", "2@0&-6@0", 12, "union", [2, 4, 8, 10]],
    ["« & » avant « | »", "3@0|4@1&5@2", 60, "union",
      [0, 3, 6, 9, 12, 15, 17, 18, 21, 24, 27, 30, 33, 36, 37, 39, 42, 45, 48, 51, 54, 57]],
    ["les parenthèses", "(3@0|4@1)&5@2", 60, "union", [12, 17, 27, 37, 42, 57]],
    ["le complément d'une parenthèse", "-(2@0|3@0)", 12, "union", [1, 5, 7, 11]],
    ["un résidu négatif", "5@-2", 15, "union", [3, 8, 13]],
  ])("%s : « %s »", async (_titre, crible, etendue, operation, attendu) => {
    const r = await lancer(crible, etendue, operation);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(degresSonnants(r.valeurs[0])).toEqual(attendu);
    // L'expression écrite par le message se recolle telle quelle, sous l'« Opération » par défaut.
    const ecrite = expressionDuMessage(r.message);
    const relue = await lancer(ecrite, etendue);
    expect(relue.erreurRendue, `${ecrite} : ${relue.message}`).toBe(false);
    expect(degresSonnants(relue.valeurs[0]), ecrite).toEqual(attendu);
  }, 60_000);

  it.each([
    ["3@0 4@0", "intersection", "3@0 ∩ 4@0"],
    ["2@0 6@0", "difference", "2@0 ∩ −6@0"],
    ["5@0 7@2 11@3", "union", "5@0 ∪ 7@2 ∪ 11@3"],
    ["3@0|4@1&5@2", "intersection", "3@0 ∪ (4@1 ∩ 5@2)"],
  ])("le message écrit l'opération appliquée : « %s » en %s", async (crible, operation, ecrite) => {
    const r = await lancer(crible, 96, operation);
    expect(expressionDuMessage(r.message), r.message).toBe(ecrite);
  }, 60_000);
});

describe("UN CRIBLE QUI NE SE LIT PAS EST REFUSÉ, ET LE MESSAGE NOMME CE QUI NE SE LIT PAS", () => {
  it.each([
    ["un mot", "5@0 pouet 7@2", "« pouet »"],
    ["une classe sans résidu", "3@0 4@ 5@1", "« 4@ »"],
    ["un module nul", "0@1 3@0", "« 0@1 »"],
    ["un signe hors de la notation", "3@0 ^ 4@1", "« ^ »"],
    ["deux classes reliées par un tiret", "3@0-4@0", "« 3@0-4@0 »"],
    ["un opérateur sans classe après lui", "3@0 |", "« | »"],
    ["une parenthèse ouverte", "(3@0 | 4@1", "« ( »"],
    ["une parenthèse fermée", "3@0 | 4@1)", "« ) »"],
    ["un complément pris pour une différence", "3@0 -4@0", "« - »"],
    ["une liste mêlée aux opérateurs", "3@0 4@1 | 5@2", "« 4@1 »"],
  ])("refuse %s : « %s »", async (_titre, crible, cite) => {
    const r = await lancer(crible, 24);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs[0]).toBe(null);
    expect(r.message).toContain(cite);
  }, 60_000);
});
