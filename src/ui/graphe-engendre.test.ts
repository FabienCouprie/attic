// ui/graphe-engendre.test.ts — Le plan d'un graphe engendré, et son défaut d'origine.
//
// LE DÉFAUT QUE CE FICHIER EXISTE POUR EMPÊCHER. Les arêtes étaient créées par un `setEdges` appelé
// À L'INTÉRIEUR de l'updater de `setNodes`. Un updater de React doit être pur ; sous `StrictMode`,
// qui l'appelle deux fois précisément pour débusquer cela, les trois arêtes engendrées étaient
// posées DEUX FOIS avec les mêmes identifiants. Relevé dans l'application : neuf arêtes dans le
// canevas pour six identifiants distincts, et trois « Encountered two children with the same key »
// dans la console. Les nœuds, eux, ne doublaient pas, l'updater les RENDANT au lieu de les poser de
// côté : la moitié visible du résultat était juste, ce qui rendait le défaut discret.
//
// ET UN SECOND DÉFAUT, RELEVÉ PAR FABIEN SUR LA DICTÉE PUIS TROUVÉ ICI : l'appelant écrivait
// `out:0 → in:0` en dur. Un modèle de langue peut demander un lien que les ports refusent — une
// sortie « Cercle » dans une entrée audio —, et l'arête se posait quand même, rouge et inerte. Le
// couple de ports est désormais cherché, et l'arête sans couple possible est écartée comme l'est
// celle qui referme un cycle.
import { describe, expect, it } from "vitest";
import { planDeGrapheEngendre, type LienEntreFiches } from "./graphe-engendre";

const chaine = (n: number) => ({
  nodes: Array.from({ length: n }, (_, i) => ({ ficheId: `f${i}`, label: `F${i}` })),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ source: i, target: i + 1 })),
});

/** Tout se branche sur `out:0 → in:0` : le cas ordinaire, celui que l'appelant supposait toujours. */
const toutVa: LienEntreFiches = () => ({ sortie: 0, entree: 0 });

describe("le plan d'un graphe engendré", () => {
  it("donne un identifiant par nœud, tous distincts et libres", () => {
    const plan = planDeGrapheEngendre(chaine(3), [{ id: "noeud-1" }, { id: "noeud-4" }], "m", toutVa);
    expect(new Set(plan.ids).size).toBe(3);
    expect(plan.ids).toEqual(["noeud-5", "noeud-6", "noeud-7"]);
  });

  it("relie les nœuds par leurs identifiants, dans l'ordre de la spécification", () => {
    const plan = planDeGrapheEngendre(chaine(3), [], "m", toutVa);
    expect(plan.aretes.map((a) => `${a.source}>${a.target}`))
      .toEqual(["noeud-1>noeud-2", "noeud-2>noeud-3"]);
  });

  it("DEUX POSES NE PARTAGENT AUCUN IDENTIFIANT D'ARÊTE, c'est à cela que sert la marque", () => {
    // Dérivé du seul identifiant du nœud source, l'identifiant d'arête entrait en collision avec
    // celui d'une pose précédente dès que le même composant engendrait deux fois.
    const a = planDeGrapheEngendre(chaine(3), [], "n4-1000", toutVa);
    const b = planDeGrapheEngendre(chaine(3), [], "n4-2000", toutVa);
    for (const x of a.aretes) expect(b.aretes.map((y) => y.id)).not.toContain(x.id);
  });

  it("ET DEUX POSES DE SUITE NE SE MARCHENT PAS DESSUS : la seconde part des nœuds de la première", () => {
    // C'est la forme même de l'appel qui est tenue ici : le plan se calcule une fois, puis les
    // poseurs ne font qu'ajouter. Calculer le second plan sans lui donner les nœuds déjà posés
    // rendrait les mêmes identifiants, et c'est ce que faisait l'updater impur.
    const premier = planDeGrapheEngendre(chaine(2), [], "a", toutVa);
    const second = planDeGrapheEngendre(chaine(2), premier.ids.map((id) => ({ id })), "b", toutVa);
    expect(premier.ids.some((id) => second.ids.includes(id))).toBe(false);
  });

  it("écarte l'arête qui refermerait un cycle, et la nomme, en gardant le reste", () => {
    const plan = planDeGrapheEngendre({
      nodes: [{ ficheId: "a", label: "A" }, { ficheId: "b", label: "B" }],
      edges: [{ source: 0, target: 1 }, { source: 1, target: 0 }],
    }, [], "m", toutVa);
    expect(plan.aretes).toHaveLength(1);
    expect(plan.cycles).toEqual([{ source: 1, target: 0 }]);
  });

  it("ÉCARTE DE MÊME L'ARÊTE QU'AUCUN COUPLE DE PORTS NE PEUT PORTER, et la nomme", () => {
    // Le cas qui posait une arête rouge : un modèle de langue demande un lien que les types
    // refusent. Il est traité comme un cycle — écarté, nommé, le reste du graphe conservé.
    const plan = planDeGrapheEngendre({
      nodes: [{ ficheId: "cercle", label: "C" }, { ficheId: "reverb", label: "R" }, { ficheId: "gain", label: "G" }],
      edges: [{ source: 0, target: 1 }, { source: 1, target: 2 }],
    }, [], "m", (s) => (s === "cercle" ? null : { sortie: 0, entree: 0 }));
    expect(plan.aretes.map((a) => `${a.source}>${a.target}`)).toEqual(["noeud-2>noeud-3"]);
    expect(plan.incompatibles).toEqual([{ source: 0, target: 1 }]);
    expect(plan.cycles).toEqual([]);
  });

  it("ET LE RANG DES PORTS VIENT DU PLAN, puisque `out:0 → in:0` n'est pas toujours celui qui va", () => {
    // Une fiche qui rend une séquence porte son audio en DERNIER : le rang se cherche, il ne se
    // suppose pas. Écrit en dur par l'appelant, il branchait la séquence sur une entrée audio.
    const plan = planDeGrapheEngendre(chaine(2), [], "m", () => ({ sortie: 1, entree: 0 }));
    expect(plan.aretes[0]).toMatchObject({ sortie: 1, entree: 0 });
  });

  it("laisse tomber une arête qui désigne un nœud absent, plutôt que d'en poser une sans source", () => {
    const plan = planDeGrapheEngendre({
      nodes: [{ ficheId: "a", label: "A" }],
      edges: [{ source: 0, target: 7 }],
    }, [], "m", toutVa);
    expect(plan.aretes).toEqual([]);
    expect(plan.cycles).toEqual([]);
    expect(plan.incompatibles).toEqual([]);
  });

  it("rend un plan vide pour une spécification vide", () => {
    expect(planDeGrapheEngendre({ nodes: [], edges: [] }, [], "m", toutVa))
      .toEqual({ ids: [], aretes: [], cycles: [], incompatibles: [] });
  });
});
