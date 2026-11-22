// plugins/symboles-accords.test.ts — Un symbole d'accord se lit de la même façon partout.
//
// LA REVUE DES NOTATIONS EN TEXTE, cinquième format, 2026-11-22. Les lecteurs de symboles ne se
// répondaient pas de la même façon : l'ABC lisait « Cø7 », « Cm7(b5) » et « Cm(maj7) », la Grille
// les refusait, « Accords → Notation » les perdait sans les nommer ; « CΔ7 », « Bm7♭5 » et « C7♯9 »
// n'étaient lus nulle part, alors que la table d'accords d'Attic écrit elle-même « ♭ » et « ♯ ».
// « N.C. » se taisait dans l'ABC, était refusé par la Grille, perdu par « Accords → Notation ».
//
// DÉCISIONS DE FABIEN DU 2026-11-22 : un seul lecteur, qui lit ces écritures usuelles ; « N.C. » est
// un accord silencieux, qui prend sa place dans le temps. La table vient de l'usage, et non du code :
// chaque cas donne les classes de hauteur et la basse attendues.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { Note } from "tonal";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesDuMidi } from "../audio/midi";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
const PC = (m: number) => ((m % 12) + 12) % 12;
/** Ce qu'un accord fait entendre : ses classes, et sa basse. */
const lu = (h: number[]) => ({ classes: [...new Set(h.map(PC))].sort((a, b) => a - b), basse: PC(Math.min(...h)) });
const hauteursLigne = (ligne: string) => ligne.split(/\s+/)[0].split("+").map((n) => Note.midi(n)!);

async function parLaGrille(symbole: string) {
  const r = await lancerFiche(F("tonal-grille"), { Progression: symbole, Mode: "plaque" }, { entrees: [null] });
  expect(r.erreurRendue, r.message).toBe(false);
  return lu(hauteursLigne(String(r.valeurs[0]).split("\n")[1]));
}
async function parAccordsVersNotation(symbole: string) {
  const r = await lancerFiche(F("accords-vers-notation"), { Source: "accords" }, { entrees: [null, null, `${symbole} (2.0s)`] });
  expect(r.valeurs[0], r.message).toBeTruthy();
  return lu(hauteursLigne(String(r.valeurs[0]).split("\n")[1]));
}
async function parLAbc(symbole: string) {
  const r = await lancerFiche(F("abc-vers-midi"), { ABC: `X:1\nT:t\nM:4/4\nL:1/4\nQ:1/4=60\nK:C\n"${symbole}"C4|`, "Accords chiffrés": "jouer" }, { entrees: [null] });
  expect(r.erreurRendue, r.message).toBe(false);
  expect(r.message, "aucun élément ne doit être sauté").not.toMatch(/non lu/);
  const notes = (await notesDuMidi(r.valeurs[1] as File)) ?? [];
  return lu(notes.filter((n) => n.canal === 1).map((n) => n.note));
}

describe("UN SYMBOLE SE LIT DE LA MÊME FAÇON PAR LES TROIS LECTEURS, écritures usuelles comprises", () => {
  it.each([
    ["le demi-diminué en ø", "Bø7", [2, 5, 9, 11], 11],
    ["le demi-diminué entre parenthèses", "Bm7(b5)", [2, 5, 9, 11], 11],
    ["le demi-diminué en bémol d'imprimerie", "Bm7♭5", [2, 5, 9, 11], 11],
    ["le demi-diminué que le détecteur écrivait", "Bmin7b5", [2, 5, 9, 11], 11],
    ["le mineur septième majeure", "Cm(maj7)", [0, 3, 7, 11], 0],
    ["la septième majeure en triangle", "CΔ7", [0, 4, 7, 11], 0],
    ["la neuvième augmentée en dièse d'imprimerie", "C7♯9", [0, 3, 4, 7, 10], 0],
    ["une fondamentale en bémol d'imprimerie", "B♭", [2, 5, 10], 10],
    ["une fondamentale en dièse d'imprimerie", "F♯m", [1, 6, 9], 6],
    ["un renversement", "C/E", [0, 4, 7], 4],
    ["la sixte-neuvième", "C6/9", [0, 2, 4, 7, 9], 0],
  ])("%s, « %s »", async (_titre, symbole, classes, basse) => {
    const attendu = { classes, basse };
    expect(await parLaGrille(symbole), "Grille").toEqual(attendu);
    expect(await parAccordsVersNotation(symbole), "Accords → Notation").toEqual(attendu);
    expect(await parLAbc(symbole), "ABC").toEqual(attendu);
  });
});

describe("« N.C. » EST UN ACCORD SILENCIEUX, qui prend sa place dans le temps", () => {
  it("la Grille l'écrit en silence, de la durée d'un accord", async () => {
    const r = await lancerFiche(F("tonal-grille"), { Progression: "C N.C. G", Mode: "plaque", "Durée": 2 }, { entrees: [null] });
    expect(r.erreurRendue, r.message).toBe(false);
    const lignes = String(r.valeurs[0]).split("\n").slice(1);
    expect(lignes).toHaveLength(3);
    expect(lignes[1]).toBe("rest 2");
  });

  it("« Accords → Notation » l'écrit en silence, de sa durée mesurée", async () => {
    const r = await lancerFiche(F("accords-vers-notation"), { Source: "accords", Tempo: 60 }, { entrees: [null, null, "C (2.0s)\nN.C. (3.0s)\nG (1.0s)"] });
    const lignes = String(r.valeurs[0]).split("\n").slice(1);
    expect(lignes).toHaveLength(3);
    expect(lignes[1]).toBe("rest 3");
  });
});
