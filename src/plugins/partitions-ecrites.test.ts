// plugins/partitions-ecrites.test.ts — Une partition écrite pour Csound garde chaque valeur à son p-field, et n'écrit rien que Csound lirait autrement.
//
// LA REVUE DES NOTATIONS EN TEXTE, onzième format, 2026-11-22, deuxième lot. Tout passe par `executer`.
//
// LA RÉFÉRENCE : le manuel de Csound, et Csound lui-même, qui a relu ces partitions dans le navigateur
// pendant le relevé.
//   - Un p-field est un rang : le quatrième nombre d'une ligne `i` est p4, quoi qu'on ait voulu y mettre.
//   - « A zero value will invoke an initialization pass without performance » : une durée nulle ne joue
//     rien.
//   - « A negative value will initiate a held note » : une durée négative tient la note.
//   - Le manuel ne définit pas un départ négatif.
//
// CE QUI SE PASSAIT : un champ vide de la Matrice, ou réglé sur « Rien » dans la Partition Csound,
// décalait les suivants, et l'orchestre lisait p6 en p5. La Matrice écrivait une durée arrondie à « 0 »,
// une durée négative et un départ négatif, et la Partition Csound refusait un MIDI absent sans le
// drapeau d'erreur.
//
// DÉCISIONS DE FABIEN DU 2026-11-22 : « Write 0 in the gap », et « Refuse it, named » pour la durée
// négative.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesVersFichierMidi } from "../audio/midi-ecriture";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
const lignes = (v: unknown) => String(v ?? "").split("\n").filter((l) => l.startsWith("i"));

describe("LA MATRICE GARDE CHAQUE VALEUR À SON P-FIELD", () => {
  const MATRICE = (r: Record<string, string | number>) =>
    lancerFiche(F("matrice-parametres"), { Départs: "0", Durées: "1", p4: "", p5: "", ...r }, { entrees: [null] });

  it.each([
    ["un champ vide entre deux champs remplis s'écrit 0", { p4: "0.3", p6: "7" }, "i1 0.0000 1.0000 0.3000 0.0000 7.0000"],
    ["p4 vide devant p5 s'écrit 0", { p5: "5" }, "i1 0.0000 1.0000 0.0000 5.0000"],
    ["un champ vide après le dernier n'est pas écrit", { p4: "1" }, "i1 0.0000 1.0000 1.0000"],
  ])("%s", async (_titre, reglages, attendue) => {
    const r = await MATRICE(reglages);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(lignes(r.valeurs[0])).toEqual([attendue]);
  }, 60_000);

  it.each([
    ["une durée qui s'arrondit à zéro", { Durées: "0.4", Décimales: 0, p4: "1" }, "Durées", "« 0 »"],
    ["une durée nulle", { Durées: "0", p4: "1" }, "Durées", "« 0.0000 »"],
    ["une durée négative", { Durées: "1 -1", Départs: "0 1", p4: "1" }, "Durées", "« -1.0000 »"],
    ["un départ négatif", { Départs: "-1 0 1", p4: "1" }, "Départs", "« -1.0000 »"],
  ])("refuse %s, et la nomme", async (_titre, reglages, reglage, cite) => {
    const r = await MATRICE(reglages);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
    expect(r.message).toContain(reglage);
    expect(r.message).toContain(cite);
  }, 60_000);
});

describe("LA PARTITION CSOUND GARDE CHAQUE VALEUR À SON P-FIELD", () => {
  const midi = notesVersFichierMidi([{ note: 69, debut: 0, fin: 0.5, velocite: 100 }], 120);
  const PARTITION = (r: Record<string, string | number>, m: unknown = midi) =>
    lancerFiche(F("partition-csound"), r, { entrees: [m, null] });

  it.each([
    ["« Rien » en p4 s'écrit 0", { p4: "rien" }, "i1 0.0000 0.5000 0 0.7874 69"],
    ["deux « Rien » devant la note s'écrivent 0", { p4: "rien", p5: "rien" }, "i1 0.0000 0.5000 0 0 69"],
    ["« Rien » après le dernier champ n'est pas écrit", {}, "i1 0.0000 0.5000 440.000 0.7874 69"],
    ["« Rien » partout n'écrit que le départ et la durée", { p4: "rien", p5: "rien", p6: "rien" }, "i1 0.0000 0.5000"],
  ])("%s", async (_titre, reglages, attendue) => {
    const r = await PARTITION(reglages);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(lignes(r.valeurs[0])).toEqual([attendue]);
  }, 60_000);

  it.each([
    ["sans MIDI", null],
    ["avec un MIDI sans note", notesVersFichierMidi([], 120)],
  ])("refuse en erreur %s", async (_titre, m) => {
    const r = await PARTITION({}, m);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
  }, 60_000);
});
