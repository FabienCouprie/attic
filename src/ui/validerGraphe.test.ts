// ui/validerGraphe.test.ts — Tests de la sanitation des arêtes au restore/import.

import { describe, it, expect } from "vitest";
import { filtrerAretesInvalides } from "./validerGraphe";

function makeNode(id: string, ficheId: string) {
  return { id, type: "atelier", position: { x: 0, y: 0 }, data: { ficheId, parametres: {} } };
}

function makeEdge(id: string, source: string, target: string, sourceHandle: string, targetHandle: string) {
  return { id, source, target, sourceHandle, targetHandle, type: "arete-personnalisee" };
}

describe("filtrerAretesInvalides", () => {
  it("garde les arêtes dont les handles existent", () => {
    const nodes = [
      makeNode("n1", "entree-audio"),
      makeNode("n2", "amplificateur"),
      makeNode("n3", "sortie-audio"),
    ];
    const edges = [
      makeEdge("e1", "n1", "n2", "out:0", "in:0"),
      makeEdge("e2", "n2", "n3", "out:0", "in:0"),
    ];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("ignore une arête dont la cible n'a pas d'entrée", () => {
    const nodes = [
      makeNode("n1", "amplificateur"),
      makeNode("n2", "entree-audio"),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "out:0", "in:0")];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res).toEqual([]);
  });

  it("ignore une arête dont la source n'a pas de sortie", () => {
    const nodes = [
      makeNode("n1", "galerie-exposition"),
      makeNode("n2", "sortie-audio"),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "out:0", "in:0")];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res).toEqual([]);
  });

  it("ignore une arête dont le handle a un index hors plage", () => {
    const nodes = [
      makeNode("n1", "entree-audio"),
      makeNode("n2", "amplificateur"),
    ];
    const edges = [
      makeEdge("e1", "n1", "n2", "out:0", "in:5"),
      makeEdge("e2", "n1", "n2", "out:9", "in:0"),
    ];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res).toEqual([]);
  });

  it("ignore une arête dont le nœud source ou cible est manquant", () => {
    const nodes = [makeNode("n1", "entree-audio")];
    const edges = [
      makeEdge("e1", "n1", "n2", "out:0", "in:0"),
      makeEdge("e2", "n2", "n1", "out:0", "in:0"),
    ];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res).toEqual([]);
  });

  it("ignore une arête pointant sur une fiche supprimée (pas de définition)", () => {
    const nodes = [
      makeNode("n1", "entree-audio"),
      makeNode("n2", "whisper-multilingue"),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "out:0", "in:0")];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res).toEqual([]);
  });
});
