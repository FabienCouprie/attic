// core/validation-frontiere.test.ts — Un méta-composant peut-il exposer autre chose que du son ?
//
// CE QUE CE FICHIER ARRÊTE. Un nœud-frontière marque, à l'intérieur d'un méta, l'endroit où un port
// sera exposé ; le type de ce port est celui du port interne auquel il se relie, et `redériverMeta`
// le lit là. Ses deux blocs étaient pourtant déclarés « audio », et la validation du graphe
// comparait cette déclaration au port d'en face.
//
// LES DEUX CONTRÔLES SE CONTREDISAIENT, et c'est ce qui rendait le défaut difficile à nommer. La
// pose d'une arête exempte les frontières depuis toujours : on tirait donc le câble sans rien
// remarquer, et l'exécution le déclarait ensuite « connexion illégale : texte → audio » en passant
// le nœud en erreur. Un méta ne pouvait, en pratique, exposer que de l'audio, alors que le dépôt
// compte une douzaine de types de flux.
import { describe, expect, it } from "vitest";

import { ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE, type AreteG, type NoeudG } from "./meta";
import { validerGraphe } from "./validation";

const DEFS: Record<string, any> = {
  "gen-texte": { id: "gen-texte", nom: "G", entrees: [], sorties: [{ nom: "Texte", type: "texte" }], parametres: [] },
  "gen-audio": { id: "gen-audio", nom: "A", entrees: [], sorties: [{ nom: "Audio", type: "audio" }], parametres: [] },
  "prend-texte": { id: "prend-texte", nom: "P", entrees: [{ nom: "Texte", type: "texte" }], sorties: [], parametres: [] },
  "prend-audio": { id: "prend-audio", nom: "Q", entrees: [{ nom: "Audio", type: "audio" }], sorties: [], parametres: [] },
  [ID_ENTREE_FRONTIERE]: { id: ID_ENTREE_FRONTIERE, nom: "E", entrees: [], sorties: [{ nom: "Entrée", type: "frontiere" }], parametres: [] },
  [ID_SORTIE_FRONTIERE]: { id: ID_SORTIE_FRONTIERE, nom: "S", entrees: [{ nom: "Sortie", type: "frontiere" }], sorties: [], parametres: [] },
};

const noeud = (id: string, ficheId: string): NoeudG => ({ id, data: { ficheId } });
const arete = (source: string, target: string): AreteG =>
  ({ id: `${source}-${target}`, source, target, sourceHandle: "out:0", targetHandle: "in:0" });

/** Deux types ne sont compatibles qu'entre eux : la règle la plus stricte, pour que rien ne passe par hasard. */
const memeType = (a: string, b: string) => a === b;

const valider = (noeuds: NoeudG[], aretes: AreteG[]) =>
  validerGraphe(noeuds, aretes, (id) => DEFS[id], memeType);

describe("une frontière de méta-composant accepte n'importe quel type", () => {
  it("UNE SORTIE EXPOSÉE PREND DU TEXTE, et c'était refusé", () => {
    const r = valider(
      [noeud("a", "gen-texte"), noeud("f", ID_SORTIE_FRONTIERE)],
      [arete("a", "f")],
    );
    expect(r.aretesInvalides).toHaveLength(0);
    expect([...r.noeudsAffectes.keys()]).toEqual([]);
  });

  it("UNE ENTRÉE EXPOSÉE NOURRIT UN PORT DE TEXTE, et c'était refusé aussi", () => {
    const r = valider(
      [noeud("f", ID_ENTREE_FRONTIERE), noeud("b", "prend-texte")],
      [arete("f", "b")],
    );
    expect(r.aretesInvalides).toHaveLength(0);
  });

  it("l'audio passe toujours, ce qui était le seul cas qui marchait", () => {
    const r = valider(
      [noeud("a", "gen-audio"), noeud("f", ID_SORTIE_FRONTIERE)],
      [arete("a", "f")],
    );
    expect(r.aretesInvalides).toHaveLength(0);
  });

  it("LE RESTE DU GRAPHE RESTE CONTRÔLÉ : l'exemption ne vaut que pour les frontières", () => {
    // Sans cela, la correction rendrait le contrôle de types inutile dans toute vue interne de méta.
    const r = valider(
      [noeud("a", "gen-texte"), noeud("q", "prend-audio")],
      [arete("a", "q")],
    );
    expect(r.aretesInvalides).toHaveLength(1);
    expect(r.noeudsAffectes.get("q")?.[0]).toContain("texte → audio");
  });

  it("une frontière au milieu n'exempte pas les arêtes voisines", () => {
    const r = valider(
      [noeud("f", ID_ENTREE_FRONTIERE), noeud("b", "prend-texte"), noeud("a", "gen-texte"), noeud("q", "prend-audio")],
      [arete("f", "b"), arete("a", "q")],
    );
    expect(r.aretesInvalides.map((x) => x.id)).toEqual(["a-q"]);
  });
});
