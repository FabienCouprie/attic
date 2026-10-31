// core/contexte-essai.test.ts — Le contexte d'essai sert ce qu'on lui donne, et rien d'autre.
import { describe, it, expect } from "vitest";
import { ctxDEssai } from "./contexte-essai";

describe("ctxDEssai", () => {
  it("sert les entrées dans l'ordre, et null au-delà", () => {
    const ctx = ctxDEssai<number>([1, 2]);
    expect(ctx.entree(0)).toBe(1);
    expect(ctx.entree(1)).toBe(2);
    expect(ctx.entree(2)).toBeNull();
    expect(ctx.entrees()).toEqual([1, 2]);
    expect(ctxDEssai().entrees()).toEqual([]);
  });

  it("rend une COPIE des entrées, qu'un exécuteur peut trier sans toucher au cas", () => {
    const entrees = [3, 1, 2];
    ctxDEssai(entrees).entrees().sort();
    expect(entrees).toEqual([3, 1, 2]);
  });

  it("lit un réglage par son nom, converti au type demandé, et le défaut de l'appel sinon", () => {
    const ctx = ctxDEssai([], { Gain: 3, Mode: "doux", Taille: "12" });
    expect(ctx.paramNombre("Gain", 0)).toBe(3);
    expect(ctx.paramNombre("Taille", 0)).toBe(12);
    expect(ctx.paramNombre("Absent", 7)).toBe(7);
    expect(ctx.paramTexte("Mode", "")).toBe("doux");
    expect(ctx.paramTexte("Gain", "")).toBe("3");
    expect(ctx.paramTexte("Absent", "repli")).toBe("repli");
  });

  it("porte les réglages sur le nœud aussi, là où un exécuteur les relit parfois", () => {
    const ctx = ctxDEssai([], { Gain: 3 }, { id: "g", ficheId: "gain", data: { fichierNom: "a.wav" } });
    expect(ctx.noeud).toEqual({ id: "g", data: { ficheId: "gain", parametres: { Gain: 3 }, fichierNom: "a.wav" } });
  });

  it("ne pose les champs facultatifs que s'ils sont donnés", () => {
    expect("sortieBranchee" in ctxDEssai()).toBe(false);
    expect("signal" in ctxDEssai()).toBe(false);
    const ctx = ctxDEssai([], {}, { sortieBranchee: (i) => i === 1, signal: new AbortController().signal });
    expect(ctx.sortieBranchee?.(1)).toBe(true);
    expect(ctx.signal?.aborted).toBe(false);
  });

  it("a un runtime nul et un progrès muet par défaut", () => {
    const ctx = ctxDEssai();
    expect(ctx.runtime).toBeNull();
    expect(() => ctx.onProgress("x")).not.toThrow();
    expect(ctx.repertoireTravail).toBe("");
  });
});
