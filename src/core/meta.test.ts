import { describe, it, expect } from "vitest";
import { creerMeta, aplatirGraphe, frontieresPourEdition, redériverMeta,
  ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE, type NoeudG, type AreteG, type DefPorts } from "./meta";

const DEFS: Record<string, DefPorts> = {
  "entree-audio": { entrees: [], sorties: [{ nom: "Audio", type: "audio" }] },
  effet: { entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }] },
  sortie: { entrees: [{ nom: "Audio", type: "audio" }], sorties: [] },
  // Nœud à sortie de contrôle (ex. « Extraire durée » → tempo/durée).
  "extraire-duree": { entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }, { nom: "Durée", type: "controle" }] },
};
const getDef = (id: string) => DEFS[id];
const getMetaFrom = (m: any) => (id: string) => (id === m.id ? m : undefined);

describe("méta-composants", () => {
  const noeuds: NoeudG[] = [
    { id: "A", data: { ficheId: "entree-audio" } },
    { id: "B", data: { ficheId: "effet", parametres: { Gain: 5 } } },
    { id: "C", data: { ficheId: "sortie" } },
  ];
  const aretes: AreteG[] = [
    { id: "e1", source: "A", target: "B", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e2", source: "B", target: "C", sourceHandle: "out:0", targetHandle: "in:0" },
  ];

  it("expose les ports frontière et recâble le graphe", () => {
    let c = 0;
    const { meta, nouveauxNoeuds, nouvellesAretes } = creerMeta(
      "meta-1", "m1", "Groupe", new Set(["B"]), noeuds, aretes, getDef, () => `ne${c++}`,
    );
    expect(meta.entrees).toEqual([{ nom: "In 1", type: "audio" }]);
    expect(meta.sorties).toEqual([{ nom: "Out 1", type: "audio" }]);
    expect(meta.mapEntrees).toEqual([{ noeudInterne: "B", portIndex: 0 }]);
    expect(meta.mapSorties).toEqual([{ noeudInterne: "B", portIndex: 0 }]);
    expect(meta.sousNoeuds.map((n) => n.id)).toEqual(["B"]);
    expect(meta.sousNoeuds[0].data.parametres).toEqual({ Gain: 5 });
    // graphe principal : A, C, m1 ; arêtes recâblées vers le méta-nœud
    expect(nouveauxNoeuds.map((n) => n.id).sort()).toEqual(["A", "C", "m1"]);
    const versMeta = nouvellesAretes.find((a) => a.target === "m1");
    const depuisMeta = nouvellesAretes.find((a) => a.source === "m1");
    expect(versMeta?.source).toBe("A");
    expect(versMeta?.targetHandle).toBe("in:0");
    expect(depuisMeta?.target).toBe("C");
    expect(depuisMeta?.sourceHandle).toBe("out:0");
  });

  it("aplatit le graphe en restaurant la topologie interne", () => {
    let c = 0;
    const { meta, nouveauxNoeuds, nouvellesAretes } = creerMeta(
      "meta-1", "m1", "Groupe", new Set(["B"]), noeuds, aretes, getDef, () => `ne${c++}`,
    );
    const { noeuds: fN, aretes: fE } = aplatirGraphe(nouveauxNoeuds, nouvellesAretes, getMetaFrom(meta));
    // B réapparaît sous l'id préfixé, avec ses paramètres
    const b = fN.find((n) => n.id === "m1::B");
    expect(b?.data.parametres).toEqual({ Gain: 5 });
    expect(fN.map((n) => n.id).sort()).toEqual(["A", "C", "m1::B"]);
    // topologie A -> m1::B -> C restaurée
    expect(fE.some((a) => a.source === "A" && a.target === "m1::B")).toBe(true);
    expect(fE.some((a) => a.source === "m1::B" && a.target === "C")).toBe(true);
    // plus aucun méta-nœud dans le graphe aplati
    expect(fN.some((n) => n.data.ficheId === "meta-1")).toBe(false);
  });

  it("survit à un aller-retour JSON (persistance export/import)", () => {
    let c = 0;
    const { meta, nouveauxNoeuds, nouvellesAretes } = creerMeta(
      "meta-3", "m3", "Persist", new Set(["B"]), noeuds, aretes, getDef, () => `ne${c++}`);
    // Simule export → JSON → import
    const copie = JSON.parse(JSON.stringify(meta)) as typeof meta;
    const { noeuds: fN, aretes: fE } = aplatirGraphe(nouveauxNoeuds, nouvellesAretes, (id) => (id === copie.id ? copie : undefined));
    expect(fN.find((n) => n.id === "m3::B")?.data.parametres).toEqual({ Gain: 5 });
    expect(fE.some((a) => a.source === "A" && a.target === "m3::B")).toBe(true);
    expect(fE.some((a) => a.source === "m3::B" && a.target === "C")).toBe(true);
  });

  it("mutualise une sortie interne qui alimente plusieurs cibles externes", () => {
    const n2: NoeudG[] = [
      { id: "B", data: { ficheId: "effet" } },
      { id: "C", data: { ficheId: "sortie" } },
      { id: "D", data: { ficheId: "sortie" } },
    ];
    const a2: AreteG[] = [
      { id: "e1", source: "B", target: "C", sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e2", source: "B", target: "D", sourceHandle: "out:0", targetHandle: "in:0" },
    ];
    let c = 0;
    const { meta, nouvellesAretes } = creerMeta("meta-2", "m2", "G", new Set(["B"]), n2, a2, getDef, () => `ne${c++}`);
    expect(meta.sorties).toHaveLength(1); // une seule sortie exposée
    expect(nouvellesAretes.filter((a) => a.source === "m2")).toHaveLength(2); // vers C et D
  });

  it("édition des ports : synthèse des frontières puis re-dérivation à l'identique", () => {
    let c = 0;
    const { meta } = creerMeta("meta-4", "m4", "Edit", new Set(["B"]), noeuds, aretes, getDef, () => `ne${c++}`);
    const fr = frontieresPourEdition(meta);
    const noeudsInt = [...meta.sousNoeuds, ...fr.noeuds];
    const aretesInt = [...meta.sousAretes, ...fr.aretes];
    const r = redériverMeta(noeudsInt, aretesInt, getDef);
    expect(r.entrees).toEqual(meta.entrees);
    expect(r.sorties).toEqual(meta.sorties);
    expect(r.mapEntrees).toEqual(meta.mapEntrees);
    expect(r.mapSorties).toEqual(meta.mapSorties);
    expect(r.sousNoeuds.map((n) => n.id)).toEqual(["B"]);
  });

  it("édition des ports : ajouter une sortie exposée depuis l'intérieur", () => {
    const inner: NoeudG[] = [
      { id: "B", position: { x: 0, y: 0 }, data: { ficheId: "effet" } },
      { id: "C", position: { x: 200, y: 0 }, data: { ficheId: "effet" } },
      { id: "__fe-0", position: { x: -200, y: 0 }, data: { ficheId: ID_ENTREE_FRONTIERE, frontiereNom: "In 1" } },
      { id: "__fs-0", position: { x: 400, y: 0 }, data: { ficheId: ID_SORTIE_FRONTIERE, frontiereNom: "Sortie audio" } },
    ];
    const aretesInt: AreteG[] = [
      { id: "a1", source: "__fe-0", sourceHandle: "out:0", target: "B", targetHandle: "in:0" },
      { id: "a2", source: "B", sourceHandle: "out:0", target: "C", targetHandle: "in:0" },
      { id: "a3", source: "C", sourceHandle: "out:0", target: "__fs-0", targetHandle: "in:0" },
    ];
    const r = redériverMeta(inner, aretesInt, getDef);
    expect(r.entrees).toEqual([{ nom: "In 1", type: "audio" }]);
    expect(r.sorties).toEqual([{ nom: "Sortie audio", type: "audio" }]);
    expect(r.mapEntrees).toEqual([{ noeudInterne: "B", portIndex: 0 }]);
    expect(r.mapSorties).toEqual([{ noeudInterne: "C", portIndex: 0 }]);
    expect(r.sousNoeuds.map((n) => n.id).sort()).toEqual(["B", "C"]);
    expect(r.sousAretes.map((a) => a.id)).toEqual(["a2"]); // seule l'arête interne B->C
  });

  it("robuste à l'ajout d'un port de sortie de contrôle (ex. tempo/durée) + stabilité des paramètres internes", () => {
    const inner: NoeudG[] = [
      { id: "E", position: { x: 0, y: 0 }, data: { ficheId: "extraire-duree", parametres: { Facteur: 2 } } },
      { id: "__fe-0", position: { x: -200, y: 0 }, data: { ficheId: ID_ENTREE_FRONTIERE, frontiereNom: "Audio" } },
      { id: "__fs-0", position: { x: 400, y: 0 }, data: { ficheId: ID_SORTIE_FRONTIERE, frontiereNom: "Audio" } },
      // sortie de contrôle ajoutée à la main (id non préfixé → placée après)
      { id: "noeud-9", position: { x: 400, y: 200 }, data: { ficheId: ID_SORTIE_FRONTIERE, frontiereNom: "Durée" } },
    ];
    const aretesInt: AreteG[] = [
      { id: "a1", source: "__fe-0", sourceHandle: "out:0", target: "E", targetHandle: "in:0" },
      { id: "a2", source: "E", sourceHandle: "out:0", target: "__fs-0", targetHandle: "in:0" }, // audio (out 0)
      { id: "a3", source: "E", sourceHandle: "out:1", target: "noeud-9", targetHandle: "in:0" }, // contrôle (out 1)
    ];
    const r = redériverMeta(inner, aretesInt, getDef);
    // Paramètre interne préservé à travers la re-dérivation (ouvrir → sauvegarder).
    expect(r.sousNoeuds.find((n) => n.id === "E")?.data.parametres).toEqual({ Facteur: 2 });
    // La sortie audio pré-existante garde l'index 0 ; la nouvelle sortie CONTRÔLE
    // est ajoutée à l'index 1 avec le bon type (hérité du port interne).
    expect(r.sorties).toEqual([{ nom: "Audio", type: "audio" }, { nom: "Durée", type: "controle" }]);
    expect(r.mapSorties).toEqual([{ noeudInterne: "E", portIndex: 0 }, { noeudInterne: "E", portIndex: 1 }]);
    // Le nouveau port de contrôle s'aplatit correctement vers la sortie interne.
    const metaFictif: any = { id: "mx", nom: "mx", entrees: r.entrees, sorties: r.sorties, mapEntrees: r.mapEntrees, mapSorties: r.mapSorties, sousNoeuds: r.sousNoeuds, sousAretes: r.sousAretes };
    const g = { noeuds: [{ id: "N", position: { x: 0, y: 0 }, data: { ficheId: "mx" } }], aretes: [] as AreteG[] };
    const flat = aplatirGraphe(g.noeuds, g.aretes, getMetaFrom(metaFictif));
    expect(flat.noeuds.find((n) => n.id === "N::E")?.data.parametres).toEqual({ Facteur: 2 });
  });
});
