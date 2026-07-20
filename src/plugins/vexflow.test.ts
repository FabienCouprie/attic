// @vitest-environment jsdom
// plugins/vexflow.test.ts — Vérification des nœuds de notation VexFlow.
import { describe, it, expect, beforeAll } from "vitest";
import { fiches } from "./vexflow";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

function ctxSimple(valeur: string | null) {
  return {
    entree: () => valeur,
    paramTexte: (nom: string, defaut: string) => defaut,
    paramNombre: (nom: string, defaut: number) => defaut,
  };
}

beforeAll(() => {
  // jsdom n'implémente pas getBBox, requis par VexFlow pour mesurer le texte.
  (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
});

describe("nœuds VexFlow", () => {
  it("les 4 fiches sont enregistrées", () => {
    expect(trouver("vexflow-portee")).toBeDefined();
    expect(trouver("vexflow-tab")).toBeDefined();
    expect(trouver("vexflow-grille")).toBeDefined();
    expect(trouver("vexflow-partition")).toBeDefined();
  });

  it("vexflow-portee génère un SVG", async () => {
    const f = trouver("vexflow-portee")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
    expect(res.valeurs[0]).toBeNull();
  });

  it("vexflow-portee utilise l'entrée connectée", async () => {
    const f = trouver("vexflow-portee")!;
    const ctx = {
      entree: () => "A4/q B4/q",
      paramTexte: (nom: string, defaut: string) => defaut,
      paramNombre: (nom: string, defaut: number) => defaut,
    };
    const res = await f.executer(ctx as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-tab génère un SVG", async () => {
    const f = trouver("vexflow-tab")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-grille génère un SVG", async () => {
    const f = trouver("vexflow-grille")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-grille accepte une progression en chiffres romains", async () => {
    const f = trouver("vexflow-grille")!;
    const ctx = {
      entree: () => "I V vi IV",
      paramTexte: (nom: string, defaut: string) => defaut,
      paramNombre: (nom: string, defaut: number) => defaut,
    };
    const res = await f.executer(ctx as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-partition génère un SVG", async () => {
    const f = trouver("vexflow-partition")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
  });
});
