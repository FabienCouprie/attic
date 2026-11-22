// plugins/tables-et-suites.test.ts — Les tables et les suites qu'écrivent les nœuds se lisent comme leurs notices le disent.
//
// LA REVUE DES NOTATIONS EN TEXTE, dernière section du recensement, 2026-11-22. Tout passe par `executer`.
//
// LES RÉFÉRENCES. Les transformations néo-riemanniennes : P garde la fondamentale et change le mode, L mène do
// majeur à mi mineur, R à la mineur. Leurs composées de la littérature : N, le Nebenverwandt, de do majeur à fa
// mineur ; S, le glissement, à do dièse mineur ; H, le pôle hexatonique, à la bémol mineur.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;

// DÉCISIONS DE FABIEN DU 2026-11-22 : « Read N, S, H too », et toute autre lettre est refusée et nommée ; « The
// chord alone » pour un chemin dont l'arrivée est le départ. Une lettre inconnue était jetée, « PLX » jouant
// « PL », et le chemin de do à do répondait « Aucune opération lisible », sans le drapeau d'erreur.
describe("LE TONNETZ LIT SES OPÉRATIONS, ET REFUSE CE QUI N'EN EST PAS", () => {
  const TONNETZ = (r: Record<string, string | number>) => lancerFiche(F("tonnetz"), { "Accord de départ": "C", Mode: "suite", ...r }, { entrees: [null] });
  /** Les accords du chemin, dans l'ordre : le nom porté par chaque ligne. */
  const accords = (v: unknown) => String(v ?? "").split("\n").filter((l) => /\[/.test(l)).map((l) => l.trim().split(/\s+/).find((m) => /^[A-G]/.test(m)));

  it.each([
    ["N mène do majeur à fa mineur", "C", "N", ["C", "Fm"]],
    ["N mène do mineur à sol majeur", "Cm", "N", ["Cm", "G"]],
    ["S mène do majeur à do dièse mineur", "C", "S", ["C", "C#m"]],
    ["H mène do majeur à la bémol mineur", "C", "H", ["C", "G#m"]],
    ["les séparateurs se lisent", "C", "P-L, R", ["C", "Cm", "G#", "Fm"]],
  ])("%s", async (_titre, depart, operations, attendus) => {
    const r = await TONNETZ({ "Accord de départ": depart, "Opérations": operations });
    expect(r.erreurRendue, r.message).toBe(false);
    expect(accords(r.valeurs[2])).toEqual(attendus);
  }, 60_000);

  it.each([["PLX", "« X »"], ["P?", "« ? »"], ["", "P, L"]])("refuse « %s » en erreur, et nomme %s", async (operations, cite) => {
    const r = await TONNETZ({ "Opérations": operations });
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null, null]);
    expect(r.message).toContain(cite);
  }, 60_000);

  it("un chemin dont l'arrivée est le départ rend l'accord seul", async () => {
    const r = await TONNETZ({ Mode: "chemin", "Accord d'arrivée": "C" });
    expect(r.erreurRendue, r.message).toBe(false);
    expect(accords(r.valeurs[2])).toEqual(["C"]);
    expect(r.message).toContain("0 opération");
  }, 60_000);

  it("un chemin d'une opération le dit au singulier", async () => {
    const r = await TONNETZ({ Mode: "chemin", "Accord d'arrivée": "Am" });
    expect(String(r.valeurs[2])).toContain("1 opération\n");
  }, 60_000);
});
