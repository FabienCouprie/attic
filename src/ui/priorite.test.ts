// ui/priorite.test.ts — Le magasin du nœud prioritaire ne prévient que les nœuds qu'il concerne.
//
// C'EST TOUT CE QU'IL APPORTE, et c'est donc ce qui se tient ici. La priorité était recopiée dans le
// `data` de chaque nœud par un effet d'`App.tsx`, deux fois par ▶ : changer de nœud prioritaire
// redessinait tout le canevas. Ici, l'ancien et le nouveau sont prévenus, et eux seuls.
import { afterEach, describe, expect, it } from "vitest";
import { definirPrioritaire, noeudPrioritaire, surPriorite } from "./priorite";

/** Abonne les nœuds donnés et rend le journal des préventions, dans l'ordre. */
function ecouter(ids: string[]) {
  const journal: string[] = [];
  const desabonner = ids.map((id) => surPriorite(id, () => journal.push(id)));
  return { journal, fin: () => desabonner.forEach((f) => f()) };
}

describe("le nœud prioritaire", () => {
  afterEach(() => definirPrioritaire(null));

  it("NE PRÉVIENT QUE L'ANCIEN ET LE NOUVEAU, et la valeur se lit aussitôt", () => {
    const { journal, fin } = ecouter(["a", "b", "c"]);
    definirPrioritaire("a");
    expect(noeudPrioritaire(), "le moteur lit la valeur vive, sans attendre un rendu").toBe("a");
    expect(journal).toEqual(["a"]);
    definirPrioritaire("b");
    expect(journal).toEqual(["a", "a", "b"]);
    definirPrioritaire(null);
    expect(journal).toEqual(["a", "a", "b", "b"]);
    expect(noeudPrioritaire()).toBeNull();
    fin();
  });

  it("LE MÊME NŒUD DÉSIGNÉ DEUX FOIS ne prévient personne la seconde", () => {
    definirPrioritaire("a");
    const { journal, fin } = ecouter(["a", "b"]);
    definirPrioritaire("a");
    expect(journal).toEqual([]);
    fin();
  });

  it("UN NŒUD DÉSABONNÉ N'EST PLUS PRÉVENU", () => {
    const { journal, fin } = ecouter(["a"]);
    fin();
    definirPrioritaire("a");
    expect(journal).toEqual([]);
  });
});
