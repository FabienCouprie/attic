// ui/graphe-engendre.test.ts — Le plan d'un graphe engendré, et son défaut d'origine.
//
// LE DÉFAUT QUE CE FICHIER EXISTE POUR EMPÊCHER. Les arêtes étaient créées par un `setEdges` appelé
// À L'INTÉRIEUR de l'updater de `setNodes`. Un updater de React doit être pur ; sous `StrictMode`,
// qui l'appelle deux fois précisément pour débusquer cela, les trois arêtes engendrées étaient
// posées DEUX FOIS avec les mêmes identifiants. Relevé dans l'application : neuf arêtes dans le
// canevas pour six identifiants distincts, et trois « Encountered two children with the same key »
// dans la console. Les nœuds, eux, ne doublaient pas, l'updater les RENDANT au lieu de les poser de
// côté : la moitié visible du résultat était juste, ce qui rendait le défaut discret.
import { describe, expect, it } from "vitest";
import { planDeGrapheEngendre } from "./graphe-engendre";

const chaine = (n: number) => ({
  nodes: Array.from({ length: n }, (_, i) => ({ ficheId: `f${i}`, label: `F${i}` })),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ source: i, target: i + 1 })),
});

describe("le plan d'un graphe engendré", () => {
  it("donne un identifiant par nœud, tous distincts et libres", () => {
    const plan = planDeGrapheEngendre(chaine(3), [{ id: "noeud-1" }, { id: "noeud-4" }], "m");
    expect(new Set(plan.ids).size).toBe(3);
    expect(plan.ids).toEqual(["noeud-5", "noeud-6", "noeud-7"]);
  });

  it("relie les nœuds par leurs identifiants, dans l'ordre de la spécification", () => {
    const plan = planDeGrapheEngendre(chaine(3), [], "m");
    expect(plan.aretes.map((a) => `${a.source}>${a.target}`))
      .toEqual(["noeud-1>noeud-2", "noeud-2>noeud-3"]);
  });

  it("DEUX POSES NE PARTAGENT AUCUN IDENTIFIANT D'ARÊTE, c'est à cela que sert la marque", () => {
    // Dérivé du seul identifiant du nœud source, l'identifiant d'arête entrait en collision avec
    // celui d'une pose précédente dès que le même composant engendrait deux fois.
    const a = planDeGrapheEngendre(chaine(3), [], "n4-1000");
    const b = planDeGrapheEngendre(chaine(3), [], "n4-2000");
    for (const x of a.aretes) expect(b.aretes.map((y) => y.id)).not.toContain(x.id);
  });

  it("ET DEUX POSES DE SUITE NE SE MARCHENT PAS DESSUS : la seconde part des nœuds de la première", () => {
    // C'est la forme même de l'appel qui est tenue ici : le plan se calcule une fois, puis les
    // poseurs ne font qu'ajouter. Calculer le second plan sans lui donner les nœuds déjà posés
    // rendrait les mêmes identifiants, et c'est ce que faisait l'updater impur.
    const premier = planDeGrapheEngendre(chaine(2), [], "a");
    const second = planDeGrapheEngendre(chaine(2), premier.ids.map((id) => ({ id })), "b");
    expect(premier.ids.some((id) => second.ids.includes(id))).toBe(false);
  });

  it("écarte l'arête qui refermerait un cycle, et la nomme, en gardant le reste", () => {
    const plan = planDeGrapheEngendre({
      nodes: [{ ficheId: "a", label: "A" }, { ficheId: "b", label: "B" }],
      edges: [{ source: 0, target: 1 }, { source: 1, target: 0 }],
    }, [], "m");
    expect(plan.aretes).toHaveLength(1);
    expect(plan.cycles).toEqual([{ source: 1, target: 0 }]);
  });

  it("laisse tomber une arête qui désigne un nœud absent, plutôt que d'en poser une sans source", () => {
    const plan = planDeGrapheEngendre({
      nodes: [{ ficheId: "a", label: "A" }],
      edges: [{ source: 0, target: 7 }],
    }, [], "m");
    expect(plan.aretes).toEqual([]);
    expect(plan.cycles).toEqual([]);
  });

  it("rend un plan vide pour une spécification vide", () => {
    expect(planDeGrapheEngendre({ nodes: [], edges: [] }, [], "m"))
      .toEqual({ ids: [], aretes: [], cycles: [] });
  });
});
