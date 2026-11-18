// ui/moteur/commandes.test.ts — Chaque commande fait au cache ce que faisait l'appel qu'elle remplace.
//
// CE QUI DOIT ÊTRE TENU :
//   - `oublier` lâche les nœuds nommés, ou tout ; `regler` ne lâche que le nœud réglé, et non les
//     internes d'un méta du même nom : c'est ce que faisait la purge du réglage, et sa remise à zéro
//     part ensuite à part ;
//   - `remettreAZero` lâche ces nœuds ET les internes de leurs métas, à toute profondeur ;
//   - `exporterCache` rend les entrées de l'instant de la demande : ce qui s'écrit après n'y paraît
//     pas, et l'ordre est celui du cache ;
//   - `importerCache` range dans l'ordre donné, une entrée remplaçant celle du même nœud ;
//   - tout s'applique avant que l'envoi rende, sans attendre un tour : l'envoi est synchrone.
import { describe, expect, it } from "vitest";

import type { EntreeDeCache } from "../../core/cache-execution";
import { creerMoteurDuCache } from "./commandes";

const entree = (v: string) => ({ valeurs: [v] }) as unknown as EntreeDeCache;

/** Un moteur dont le cache tient ces nœuds, dans cet ordre. */
function moteurAvec(ids: readonly string[]) {
  const m = creerMoteurDuCache();
  for (const id of ids) m.cache.ecrire(id, entree(id));
  return m;
}

const META = ["outil", "outil::cd", "outil::sous::ab", "outil2", "outil2::cd", "autre"];

describe("les commandes au cache du moteur", () => {
  it("OUBLIER LÂCHE LES NŒUDS NOMMÉS, OU TOUT, et rien d'autre", () => {
    const m = moteurAvec(["a", "b", "c"]);
    m.envoyer({ genre: "oublier", ids: ["c", "x", "a"] });
    expect([...m.cache.entrees().keys()]).toEqual(["b"]);
    m.envoyer({ genre: "oublier", ids: "tout" });
    expect(m.cache.taille()).toBe(0);
  });

  it("RÉGLER NE LÂCHE QUE LE NŒUD RÉGLÉ, et laisse les internes du méta à sa remise à zéro", () => {
    const m = moteurAvec(META);
    m.envoyer({ genre: "regler", id: "outil" });
    expect([...m.cache.entrees().keys()]).toEqual(META.filter((id) => id !== "outil"));
  });

  it("REMETTRE À ZÉRO LÂCHE CES NŒUDS AVEC LES INTERNES DE LEURS MÉTAS, et pas un nom voisin", () => {
    const m = moteurAvec(META);
    m.envoyer({ genre: "remettreAZero", ids: ["outil", "autre"] });
    expect([...m.cache.entrees().keys()]).toEqual(["outil2", "outil2::cd"]);
  });

  it("EXPORTER REND LES ENTRÉES DE L'INSTANT DE LA DEMANDE, dans l'ordre du cache", () => {
    const m = moteurAvec(["b", "a"]);
    const exporte = m.envoyer({ genre: "exporterCache" });
    m.cache.ecrire("tard", entree("tard"));
    m.cache.oublier(["b"]);
    expect(exporte).toEqual([["b", entree("b")], ["a", entree("a")]]);
  });

  it("IMPORTER RANGE DANS L'ORDRE DONNÉ, et une entrée remplace celle du même nœud", () => {
    const m = moteurAvec(["a", "b"]);
    m.envoyer({ genre: "importerCache", entrees: [["c", entree("c")], ["a", entree("a2")]] });
    expect(m.envoyer({ genre: "exporterCache" })).toEqual([["a", entree("a2")], ["b", entree("b")], ["c", entree("c")]]);
  });
});
