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
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import { notesDuMidi } from "../audio/midi";

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

// LA TABLE DE MARKOV, deuxième lot. Ses pourcentages arrondis ne faisaient pas toujours 100, trois suites
// également probables s'écrivant 33 %, 33 %, 33 %, et elle s'arrêtait à vingt contextes sans le dire. Décision de
// Fabien du 2026-11-22, « Add the counts ». Les refus partaient sans le drapeau d'erreur.
describe("LA TABLE DE MARKOV EST EXACTE, ET DIT CE QU'ELLE MONTRE", () => {
  const midi = (hauteurs: number[]) => notesVersFichierMidi(hauteurs.map((note, i) => ({ note, debut: i * 0.5, fin: i * 0.5 + 0.45, velocite: 90 })), 120);
  const MARKOV = (entree: unknown, r: Record<string, string | number> = {}) =>
    lancerFiche(F("markov-midi"), { Ordre: 1, Graine: 1, ...r }, { entrees: [entree] });

  it.each([
    ["deux suites inégales", [60, 62, 64, 60, 62, 65, 60, 64], "C4 ⇒ D4 67% (2), E4 33% (1)"],
    ["trois suites également probables", [60, 62, 60, 64, 60, 65], "C4 ⇒ D4 33% (1), E4 33% (1), F4 33% (1)"],
  ])("écrit chaque compte avec son pourcentage : %s", async (_titre, hauteurs, ligne) => {
    const r = await MARKOV(midi(hauteurs));
    expect(r.erreurRendue, r.message).toBe(false);
    expect(String(r.valeurs[2]).split("\n")).toContain(ligne);
  }, 60_000);

  it("dit qu'elle n'écrit que les vingt contextes les plus fréquents, et sur combien", async () => {
    const r = await MARKOV(midi(Array.from({ length: 40 }, (_, i) => 40 + i)));
    expect(String(r.valeurs[2])).toContain("Les 20 contextes les plus fréquents, sur 39");
  }, 60_000);

  it.each([
    ["sans MIDI", null, {}],
    ["un MIDI sans note", notesVersFichierMidi([], 120), {}],
    ["un morceau trop court pour l'ordre", midi([60, 62]), { Ordre: 3 }],
  ] as [string, unknown, Record<string, number>][])("refuse en erreur %s", async (_titre, entree, reglages) => {
    const r = await MARKOV(entree, reglages);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null, null]);
  }, 60_000);
});

// L'HARMONIE NÉGATIVE ET LA SÉRIE À TOUS LES INTERVALLES, troisième lot. La réflexion est 2t + 7 − p modulo 12 :
// une réflexion retourne la ligne. La documentation promettait que « Classes » en garde le contour ; décision de
// Fabien du 2026-11-22, « Correct the doc », et ces cas tiennent ce que la documentation dit maintenant. Les
// refus partaient sans le drapeau d'erreur. La série, elle, promettait de revenir à la première au-delà de la
// dernière, et rendait la dernière.
describe("L'HARMONIE NÉGATIVE FAIT CE QUE DIT SA DOCUMENTATION, ET LA SÉRIE REVIENT À LA PREMIÈRE", () => {
  const midi = (hauteurs: number[]) => notesVersFichierMidi(hauteurs.map((note, i) => ({ note, debut: i * 0.5, fin: i * 0.5 + 0.45, velocite: 90 })), 120);
  const NEGATIVE = (entree: unknown) => lancerFiche(F("harmonie-negative"), { "Réflexion": "registre" }, { entrees: [entree] });
  const hauteurs = async (v: unknown) => ((await notesDuMidi(v)) ?? []).map((n) => n.note);

  it("« Classes » retourne la ligne : do ré mi fa sol devient sol fa mi bémol ré do", async () => {
    const r = await NEGATIVE(midi([60, 62, 64, 65, 67]));
    expect(await hauteurs(r.valeurs[1])).toEqual([67, 65, 63, 62, 60]);
  }, 60_000);

  it("« Classes » garde chaque note dans son octave : la basse reste la basse", async () => {
    const r = await NEGATIVE(midi([48, 52, 55]));
    expect(await hauteurs(r.valeurs[1])).toEqual([55, 51, 48]);
  }, 60_000);

  it.each([["sans MIDI", null], ["un MIDI sans note", notesVersFichierMidi([], 120)]])("refuse en erreur %s", async (_titre, entree) => {
    const r = await NEGATIVE(entree);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null, null]);
  }, 60_000);

  const SERIE = (numero: number) => lancerFiche(F("serie-tous-intervalles"), { "Numéro": numero }, { entrees: [] });
  it.each([[3856, 0], [3857, 1]])("au-delà de la dernière série, le rang %i revient à la série %i, et le message le dit", async (rang, attendu) => {
    const [r, reference] = [await SERIE(rang), await SERIE(attendu)];
    expect(r.valeurs[1]).toEqual(reference.valeurs[1]);
    expect(r.message).toContain(`${attendu}`);
    expect(r.message).not.toContain(`${rang}`);
  }, 60_000);
});
