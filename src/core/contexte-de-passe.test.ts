// core/contexte-de-passe.test.ts — Le contexte d'une passe lit les réglages comme le moteur les lisait.
//
// LE TÉMOIN EST L'ANCIEN OBJET, recopié depuis `useExecutionGraphe.ts` avec les mêmes prêts : la
// fiche, la canonisation d'un choix, la graine. Les cas sont ceux que les commentaires du moteur
// racontent : le repli sur le DÉFAUT DÉCLARÉ et non sur le littéral, la graine résolue au centre, le
// choix canonisé, la question des sorties retenue, et l'`onProgress` qui lève après annulation.
import { describe, expect, it } from "vitest";

import { ErreurAnnulation } from "./annulation";
import { contexteDePasse } from "./contexte-de-passe";
import { resoudreEntree, valeursEntrantes } from "./graphe";
import type { AreteG } from "./meta";
import type { ParametreDef } from "./types";

const FICHE = { parametres: [
  { nom: "Niveau", defaut: 0.7, plage: [0, 1] },
  { nom: "Graine", defaut: 0, graine: true },
  { nom: "Couleur", type: "choix", options: ["Bleu", "Rouge"], optionIds: ["bleu", "rouge"], defaut: "Bleu" },
  { nom: "Mode", type: "texte", defaut: "doux" },
] as unknown as ParametreDef[] };
const trouverDef = (id: string) => (id === "f" ? FICHE : undefined);
/** Une canonisation de banc : un identifiant d'option devient son libellé français. */
const canoniser = (p: ParametreDef, v: string | number) => {
  const i = (p.optionIds ?? []).indexOf(String(v));
  return i >= 0 ? (p.options ?? [])[i] : v;
};
const graineDuNoeud = (_nodeId: string, _nom: string, brut: number) => (brut > 0 ? brut : 4242);
const ARETES: AreteG[] = [{ id: "e", source: "n", target: "s", sourceHandle: "out:1", targetHandle: "in:0" } as AreteG];
const RESULTATS = new Map<string, unknown[]>([["amont", [12, "x"]]]);

/** L'ancien objet, à l'identique, les prêts du moteur remplacés par ceux du banc. */
function ancienContexte(node: { id: string; data: Record<string, unknown> }, signal: AbortSignal, progressions: string[]) {
  const nodeId = node.id;
  let aConsulteSesSorties = false;
  const ctx = {
    noeud: node, runtime: null, repertoireTravail: "W",
    entree: (idx: number) => resoudreEntree<unknown>(nodeId, idx, ARETES, RESULTATS),
    entrees: () => valeursEntrantes<unknown>(nodeId, ARETES, RESULTATS),
    sortieBranchee: (idx: number) => { aConsulteSesSorties = true; return ARETES.some((a) => a.source === nodeId && a.sourceHandle === `out:${idx}`); },
    paramNombre: (nom: string, defaut: number) => {
      const p = (node.data.parametres as Record<string, number | string>)?.[nom];
      const pDef = trouverDef(node.data.ficheId as string)?.parametres.find((p) => p.nom === nom);
      const brut = typeof p === "number" ? p : typeof pDef?.defaut === "number" ? pDef.defaut : defaut;
      return pDef?.graine ? graineDuNoeud(nodeId, nom, brut) : brut;
    },
    paramTexte: (nom: string, defaut: string) => {
      const p = (node.data.parametres as Record<string, number | string>)?.[nom];
      const pDef = trouverDef(node.data.ficheId as string)?.parametres.find((p) => p.nom === nom);
      if (typeof p === "string" && pDef) return String(canoniser(pDef, p));
      return pDef ? String(canoniser(pDef, pDef.defaut as string | number)) : defaut;
    },
    onProgress: (msg: string) => { if (signal.aborted) throw new ErreurAnnulation(); progressions.push(msg); },
    signal,
  };
  return { ctx, aConsulteSesSorties: () => aConsulteSesSorties };
}

const noeud = (parametres: Record<string, number | string>) => ({ id: "n", data: { ficheId: "f", parametres } });
const neuf = (node: ReturnType<typeof noeud>, signal: AbortSignal, progressions: string[]) => contexteDePasse<unknown, null>({
  noeud: node, aretes: ARETES, resultats: RESULTATS, runtime: null, repertoireTravail: "W",
  trouverDef, canoniser, graineDuNoeud, signal, poserProgression: (m) => progressions.push(m),
});

describe("le contexte d'une passe", () => {
  it("lit les réglages comme l'ancien objet, cas par cas", () => {
    const node = noeud({ Niveau: 0.25, Couleur: "rouge", Autre: 3 });
    const a = ancienContexte(node, new AbortController().signal, []);
    const n = neuf(node, new AbortController().signal, []);
    const lectures = [
      ["Niveau", 0.1], ["Absent", 0.1], ["Graine", 0], ["Graine", 9], ["Autre", 0.1],
    ] as const;
    expect(lectures.map(([nom, d]) => n.ctx.paramNombre(nom, d))).toEqual(lectures.map(([nom, d]) => a.ctx.paramNombre(nom, d)));
    const textes = [["Couleur", "?"], ["Mode", "?"], ["Inconnu", "repli"]] as const;
    expect(textes.map(([nom, d]) => n.ctx.paramTexte(nom, d))).toEqual(textes.map(([nom, d]) => a.ctx.paramTexte(nom, d)));
  });

  it("REPLIE SUR LE DÉFAUT DÉCLARÉ, et sur le littéral seulement quand la fiche ne déclare rien", () => {
    const n = neuf(noeud({}), new AbortController().signal, []);
    expect(n.ctx.paramNombre("Niveau", 0.1)).toBe(0.7);
    expect(n.ctx.paramNombre("Absent", 0.1)).toBe(0.1);
    expect(n.ctx.paramNombre("Graine", 0)).toBe(4242);
    expect(n.ctx.paramTexte("Couleur", "?")).toBe("Bleu");
    expect(n.ctx.paramTexte("Inconnu", "repli")).toBe("repli");
  });

  it("canonise un choix reçu par son identifiant", () => {
    const n = neuf(noeud({ Couleur: "rouge" }), new AbortController().signal, []);
    expect(n.ctx.paramTexte("Couleur", "?")).toBe("Rouge");
  });

  it("RETIENT QU'ON A POSÉ LA QUESTION DES SORTIES, et répond par les arêtes", () => {
    const n = neuf(noeud({}), new AbortController().signal, []);
    expect(n.aConsulteSesSorties()).toBe(false);
    expect(n.ctx.sortieBranchee!(0)).toBe(false);
    expect(n.ctx.sortieBranchee!(1)).toBe(true);
    expect(n.aConsulteSesSorties()).toBe(true);
  });

  it("un onProgress après annulation lève, avant il pose", () => {
    const controller = new AbortController();
    const progressions: string[] = [];
    const n = neuf(noeud({}), controller.signal, progressions);
    n.ctx.onProgress("à mi-chemin");
    expect(progressions).toEqual(["à mi-chemin"]);
    controller.abort();
    expect(() => n.ctx.onProgress("trop tard")).toThrow(ErreurAnnulation);
    expect(progressions).toEqual(["à mi-chemin"]);
  });

  it("sert les entrées par les arêtes et les résultats", () => {
    const n = contexteDePasse<unknown, null>({
      noeud: { id: "s", data: { ficheId: "f", parametres: {} } }, aretes: [{ id: "e", source: "amont", target: "s", sourceHandle: "out:1", targetHandle: "in:0" } as AreteG],
      resultats: RESULTATS, runtime: null, repertoireTravail: "W", trouverDef, canoniser, graineDuNoeud,
      signal: new AbortController().signal, poserProgression: () => {},
    });
    expect(n.ctx.entree(0)).toBe("x");
    expect(n.ctx.entrees()).toEqual(["x"]);
  });
});
