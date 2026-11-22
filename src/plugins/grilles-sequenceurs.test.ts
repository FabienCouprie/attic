// plugins/grilles-sequenceurs.test.ts — Un motif de séquenceur ne porte que ce que sa grille écrit, et ce qui n'en vient pas est refusé.
//
// LA REVUE DES NOTATIONS EN TEXTE, dixième format, 2026-11-22, quatrième lot. Tout passe par `executer`. La
// grille écrit une case par pas, 0 et 1, ou les chiffres d'une vélocité pour la batterie, et sépare ses
// rangées par « | ». Une espace y prenait une case et décalait la suite ; un caractère que la grille n'écrit
// jamais, « 2 » ou « x », s'y lisait comme un silence.
//
// DÉCISION DE FABIEN DU 2026-11-22, « Refuse it, named » : une espace ou un caractère que la grille n'écrit
// jamais est refusé et nommé. Une rangée plus courte ou plus longue que le nombre de pas se complète ou se
// coupe toujours : « Nombre de pas » passe de 16 à 32 sans réécrire le motif.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesDuMidi } from "../audio/midi";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
const SEIZE = "0".repeat(16);
/** Un motif de `n` rangées muettes, sauf celles que `rangees` donne, comptées depuis 1. */
const motif = (n: number, rangees: Record<number, string>) => Array.from({ length: n }, (_, r) => rangees[r + 1] ?? SEIZE).join("|");

const lancer = (id: string, m: string) => lancerFiche(F(id), { Motif: m, "Nombre de pas": "16", Mesures: 1 }, { entrees: [] });
/** Les attaques distinctes : un accord en est une, quelle que soit sa disposition. */
const attaques = async (v: unknown) => new Set(((await notesDuMidi(v)) ?? []).map((n) => Math.round(n.debut * 1000))).size;

describe("UN MOTIF DE SÉQUENCEUR NE PORTE QUE CE QUE SA GRILLE ÉCRIT", () => {
  it.each([
    ["sequenceur-melodique", "une espace", motif(13, { 1: "1000 1000 1000 1000" }), "« ␣ »", "rangée 1, pas 5"],
    ["sequenceur-melodique", "un chiffre que la grille n'écrit pas", motif(13, { 1: "1002000000000000" }), "« 2 »", "rangée 1, pas 4"],
    ["sequenceur-accords", "une lettre", motif(21, { 3: "x000000000000000" }), "« x »", "rangée 3, pas 1"],
    ["sequenceur-accords", "une espace", motif(21, { 2: "1000 000" }), "« ␣ »", "rangée 2, pas 5"],
    ["sequenceur-batterie-avance", "une lettre", motif(8, { 1: "x...x...x...x..." }), "« x »", "rangée 1, pas 1"],
    ["sequenceur-batterie-avance", "une espace", motif(8, { 4: "9000 9000" }), "« ␣ »", "rangée 4, pas 5"],
  ])("%s refuse %s, et la nomme", async (id, _titre, m, cite, place) => {
    const r = await lancer(id, m);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
    expect(r.message).toContain(cite);
    expect(r.message).toContain(place);
  }, 60_000);

  it.each([
    ["une rangée courte, complétée de silences", "sequenceur-melodique", motif(13, { 1: "1" }), 1],
    ["une rangée longue, coupée au nombre de pas", "sequenceur-melodique", motif(13, { 1: "1000000000000000001" }), 1],
    ["une rangée d'accords courte", "sequenceur-accords", motif(21, { 1: "1" }), 1],
    ["des vélocités de 1 à 9", "sequenceur-batterie-avance", motif(8, { 1: "9000500010000000" }), 3],
    ["un motif de l'ancien séquenceur, cinq pistes de 0 et de 1", "sequenceur-batterie-avance", ["1000100010001000", ...Array(4).fill(SEIZE)].join("|"), 4],
  ])("lit toujours %s", async (_titre, id, m, attendues) => {
    const r = await lancer(id, m);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(await attaques(r.valeurs[1])).toBe(attendues);
  }, 60_000);
});
