// @vitest-environment jsdom
// vues-domaine/vues-code.test.ts — Lire un script n'est pas l'ecrire.
//
// ═══ LE PIEGE QUE CE CAS TIENT ═══
//
// L'editeur de code synchronise aussi a la FERMETURE, frappe ou non. Un script arrive dans un
// projet recu, ouvert pour etre lu puis referme, repassait donc par `onSync` avec son propre texte.
// S'il avait suffi d'une synchronisation pour etre « ecrit ici », ce script se serait execute sans
// etre montre -- exactement ce que `electron/scripts-autorises.cjs` existe pour empecher.
import { describe, expect, it, beforeEach } from "vitest";
import { declarerSiEcritIci } from "./vues-code";

let declares: string[] = [];
beforeEach(() => {
  declares = [];
  (window as unknown as { api: unknown }).api = { scriptsEcritIci: (c: string) => { declares.push(c); } };
});

describe("ce que l'editeur declare ecrit ici", () => {
  it("UN SCRIPT LU PUIS REFERME, SANS FRAPPE, N'EST PAS DECLARE", () => {
    const recu = "import os\nos.remove('x')";
    expect(declarerSiEcritIci(recu, recu)).toBe(false);
    expect(declares).toHaveLength(0);
  });

  it("UN SCRIPT MODIFIE DANS L'EDITEUR EST DECLARE, avec son texte nouveau", () => {
    expect(declarerSiEcritIci("x = 2", "x = 1")).toBe(true);
    expect(declares).toEqual(["x = 2"]);
  });

  it("HORS DE L'APPLICATION DE BUREAU, il n'y a pas de pont, et rien ne leve", () => {
    (window as unknown as { api?: unknown }).api = undefined;
    expect(() => declarerSiEcritIci("x = 2", "x = 1")).not.toThrow();
  });
});
