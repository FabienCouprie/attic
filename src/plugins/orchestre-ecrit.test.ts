// plugins/orchestre-ecrit.test.ts — L'Orchestre Csound refuse un instrument qu'il ne connaît pas, et parle la langue de l'interface.
//
// LA REVUE DES NOTATIONS EN TEXTE, onzième format, 2026-11-22, troisième lot. Tout passe par `executer`.
//
// CE QUI SE PASSAIT : un identifiant inconnu était écarté et seulement compté, « 1 identifiant(s)
// inconnu(s) écarté(s) », un doublon était compté comme un inconnu, une liste vide partait sans le drapeau
// d'erreur, et l'interface anglaise lisait « stéréo » et des commentaires d'orchestre en français.
//
// DÉCISION DE FABIEN DU 2026-11-22, « Refuse it, named » : un identifiant inconnu fait refuser l'orchestre,
// et le message le nomme. Les huit formules et les onze instruments ont été rendus par Csound dans le
// navigateur pendant le relevé : tous compilent et sonnent.
import "node-web-audio-api/polyfill.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";

const ORCHESTRE = registre.trouverDef("orchestre-csound") as unknown as FicheLancable;
const lancer = (reglages: Record<string, string | number>) => lancerFiche(ORCHESTRE, reglages, { entrees: [] });

/** La langue de l'interface, que les exécuteurs lisent dans le stockage local. */
function parler(langue: "fr" | "en") {
  const memoire: Record<string, string> = { "attic-lang": langue };
  vi.stubGlobal("localStorage", { getItem: (k: string) => memoire[k] ?? null, setItem: (k: string, v: string) => { memoire[k] = v; } });
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("UN INSTRUMENT INCONNU FAIT REFUSER L'ORCHESTRE, ET LE MESSAGE LE NOMME", () => {
  it.each([["wgbow, foscill", "« foscill »"], ["chaise", "« chaise »"]])("« %s »", async (liste, cite) => {
    const r = await lancer({ Instruments: liste });
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
    expect(r.message).toContain(cite);
    expect(r.message).toContain("wgclar");
  }, 60_000);

  it("une liste vide est refusée en erreur", async () => {
    const r = await lancer({ Instruments: "" });
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
  }, 60_000);

  it("un doublon est ignoré, et se dit doublon", async () => {
    const r = await lancer({ Instruments: "wgbow, wgbow" });
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.message).toContain("doublon");
    expect(r.message).toContain("wgbow");
    expect(r.message).not.toMatch(/inconnu/);
  }, 60_000);
});

describe("L'ORCHESTRE PARLE LA LANGUE DE L'INTERFACE", () => {
  it("en anglais, le message dit « stereo » et les commentaires sont anglais", async () => {
    parler("en");
    const r = await lancer({ Instruments: "wgbow", Canaux: "stereo" });
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.message).toContain("stereo");
    expect(r.message).not.toContain("stéréo");
    const texte = String(r.valeurs[0]);
    expect(texte).toContain("; Bowed string (wgbow)");
    expect(texte).not.toMatch(/Corde|Tables de fonction|collision n'est/);
  }, 60_000);

  it("en français, ils restent français", async () => {
    parler("fr");
    const r = await lancer({ Instruments: "wgbow", Canaux: "stereo" });
    expect(r.message).toContain("stéréo");
    expect(String(r.valeurs[0])).toContain("; Corde frottée (wgbow)");
  }, 60_000);
});
