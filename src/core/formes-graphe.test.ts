// core/formes-graphe.test.ts — Les deux formes ne peuvent pas être confondues.
//
// CE QUE CES TESTS TIENNENT, et c'est la raison d'être du fichier voisin : l'invariant de la forme qui
// documente — aucun conteneur, jamais — et le fait que les deux formes DIFFÈRENT sur un graphe qui en
// contient un. Sans ce second test, implémenter l'une comme l'alias de l'autre passerait, et c'est
// exactement la confusion que ce contrat existe pour rendre impossible.
import { describe, expect, it } from "vitest";

import { grapheSansConteneurs } from "./formes-graphe";
import type { AreteG, MetaComposant, NoeudG } from "./meta";

const noeud = (id: string, ficheId: string): NoeudG =>
  ({ id, position: { x: 0, y: 0 }, data: { ficheId, parametres: {} } });

const META: MetaComposant = {
  id: "meta-essai",
  nom: "Essai",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  mapEntrees: [{ noeudInterne: "dedans-1", portIndex: 0 }],
  mapSorties: [{ noeudInterne: "dedans-2", portIndex: 0 }],
  sousNoeuds: [noeud("dedans-1", "gain"), noeud("dedans-2", "filtre")],
  sousAretes: [{ id: "a-dedans", source: "dedans-1", target: "dedans-2", sourceHandle: "out:0", targetHandle: "in:0" }],
};

const getMeta = (ficheId: string) => (ficheId === "meta-essai" ? META : undefined);

describe("la forme qui documente", () => {
  it("elle remplace un méta-composant par son contenu", () => {
    const noeuds = [noeud("source", "oscillateur"), noeud("m", "meta-essai")];
    const aretes: AreteG[] = [
      { id: "e1", source: "source", target: "m", sourceHandle: "out:0", targetHandle: "in:0" },
    ];
    const g = grapheSansConteneurs(noeuds, aretes, getMeta);

    expect(g.forme).toBe("sans-conteneurs");
    expect(g.noeuds.map((n) => n.data.ficheId).sort()).toEqual(["filtre", "gain", "oscillateur"]);
    expect(g.conteneursRetires).toEqual([]);
    // L'arête qui entrait dans le méta entre maintenant dans son premier nœud intérieur.
    const entrante = g.aretes.find((a) => a.source === "source")!;
    expect(entrante.target).toBe("m::dedans-1");
  });

  it("elle retire un conteneur purement visuel et garde son contenu", () => {
    const noeuds = [noeud("bulle-1", "bulle"), noeud("dedans", "gain")];
    const aretes: AreteG[] = [
      // L'arête de substitution, qui n'existe que pour l'affichage.
      { id: "sub", source: "bulle-1", target: "ailleurs", sourceHandle: "out:0", targetHandle: "in:0" },
    ];
    const g = grapheSansConteneurs(noeuds, aretes, getMeta, (f) => f === "bulle");

    expect(g.noeuds.map((n) => n.id)).toEqual(["dedans"]);
    expect(g.aretes).toEqual([]);
    expect(g.conteneursRetires).toEqual(["bulle-1"]);
  });

  it("UN CONTENEUR QUI SE CONTIENT LUI-MÊME EST RETIRÉ, ET DIT", () => {
    // L'aplatissement s'arrête sur sa garde de boucle et laisse le nœud en place. Le garder
    // trahirait la règle : on le retire, et on le nomme.
    const cyclique: MetaComposant = { ...META, id: "meta-cycle", sousNoeuds: [noeud("moi", "meta-cycle")] };
    const g = grapheSansConteneurs(
      [noeud("m", "meta-cycle"), noeud("autre", "gain")], [],
      (f) => (f === "meta-cycle" ? cyclique : undefined),
    );

    expect(g.noeuds.map((n) => n.data.ficheId)).toEqual(["gain"]);
    expect(g.conteneursRetires.length).toBeGreaterThan(0);
  });

  it("UN CONTENEUR DONT LA DÉFINITION A DISPARU RESTE, ET C'EST VOULU", () => {
    // Le cœur ne peut pas savoir qu'un identifiant inconnu désignait un conteneur : le deviner par
    // son préfixe serait le substitut que ce dépôt regrette ailleurs. Le nœud reste donc, et le
    // documenteur le signale comme composant INCONNU — ce qui est la vérité, et non « un méta ».
    const noeuds = [noeud("orphelin", "meta-disparu"), noeud("autre", "gain")];
    const g = grapheSansConteneurs(noeuds, [], () => undefined);

    expect(g.noeuds.map((n) => n.id)).toEqual(["orphelin", "autre"]);
    expect(g.conteneursRetires).toEqual([]);
  });

  it("aucun conteneur ne survit, quelle qu'en soit l'imbrication", () => {
    const externe: MetaComposant = {
      ...META, id: "meta-externe",
      sousNoeuds: [noeud("interne", "meta-essai")],
      sousAretes: [],
      mapEntrees: [{ noeudInterne: "interne", portIndex: 0 }],
      mapSorties: [{ noeudInterne: "interne", portIndex: 0 }],
    };
    const resoudre = (f: string) =>
      f === "meta-externe" ? externe : f === "meta-essai" ? META : undefined;
    const g = grapheSansConteneurs([noeud("m", "meta-externe")], [], resoudre);

    expect(g.noeuds.map((n) => n.data.ficheId).sort()).toEqual(["filtre", "gain"]);
    for (const n of g.noeuds) expect(resoudre(n.data.ficheId)).toBeUndefined();
  });

  it("ELLE DIFFÈRE DE CE QU'ON VOIT, sans quoi le contrat ne servirait à rien", () => {
    const noeuds = [noeud("m", "meta-essai")];
    const g = grapheSansConteneurs(noeuds, [], getMeta);
    // Le canevas montre un nœud, la documentation en décrit deux : les deux formes ne sont pas
    // interchangeables, et aucune implémentation de l'une ne peut tenir lieu de l'autre.
    expect(noeuds).toHaveLength(1);
    expect(g.noeuds).toHaveLength(2);
  });
});
