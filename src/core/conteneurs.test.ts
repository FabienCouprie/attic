// core/conteneurs.test.ts — Ce que contient un conteneur, et le statut qu'il en tire.
import { describe, expect, it } from "vitest";

import { ficheDeBulle } from "./bulles";
import { avecLeursBulles, conteneurs, statutDuContenu } from "./conteneurs";
import type { NoeudG } from "./meta";

const noeud = (id: string, ficheId: string, bulle?: string): NoeudG => ({
  id, position: { x: 0, y: 0 },
  data: { ficheId, parametres: {}, ...(bulle ? { bulle } : {}) },
});

// Le graphe visible : une bulle `b` qui contient deux membres, une bulle `bi` imbriquée et le méta
// `m` ; un nœud `dehors` hors de tout. Le méta est aplati en `m::x` et `m::y` ; le membre `boucle`
// est une chaîne de boucle, dépliée en deux copies.
const VISIBLES: NoeudG[] = [
  noeud("dehors", "source"),
  noeud("b", ficheDeBulle("b")),
  noeud("a", "gain", "b"),
  noeud("boucle", "gain", "b"),
  noeud("bi", ficheDeBulle("bi"), "b"),
  noeud("c", "gain", "bi"),
  noeud("m", "meta-test", "bi"),
];
const EXPANSIONS = new Map([["m::x", "m"], ["m::y", "m"], ["deb#0::boucle", "boucle"], ["deb#1::boucle", "boucle"]]);
const visible = (id: string) => EXPANSIONS.get(id) ?? id;
const estMeta = (f: string) => f === "meta-test";
// Le graphe exécuté : les nœuds visibles qui calculent, les nœuds aplatis, les copies. Ni les
// bulles ni le méta n'y figurent, comme dans le moteur.
const EXECUTES = ["dehors", "a", "deb#0::boucle", "deb#1::boucle", "c", "m::x", "m::y"];

describe("le contenu d'un conteneur", () => {
  const boites = conteneurs(VISIBLES, visible, estMeta);

  it("LES CONTENEURS SONT LES BULLES ET LES MÉTAS, et rien d'autre", () => {
    expect(boites.ids.sort()).toEqual(["b", "bi", "m"]);
  });

  it("UNE BULLE CONTIENT SES MEMBRES À TOUTE PROFONDEUR, copies de boucle et méta aplati compris", () => {
    // C'est le contenu que son ▶ doit lancer : viser la bulle seule ne lançait rien, puisqu'elle n'a
    // aucune arête réelle.
    expect(boites.contenu("b", EXECUTES)).toEqual(["a", "deb#0::boucle", "deb#1::boucle", "c", "m::x", "m::y"]);
    expect(boites.contenu("bi", EXECUTES)).toEqual(["c", "m::x", "m::y"]);
  });

  it("UN MÉTA CONTIENT TOUS SES NŒUDS APLATIS, et non les seuls qui alimentent ses sorties", () => {
    expect(boites.contenu("m", EXECUTES)).toEqual(["m::x", "m::y"]);
  });

  it("UN NŒUD ORDINAIRE NE CONTIENT RIEN : son ▶ le vise lui-même", () => {
    expect(boites.contenu("dehors", EXECUTES)).toEqual([]);
    expect(boites.contenu("a", EXECUTES)).toEqual([]);
  });

  it("LE CONTENU SE RESTREINT AUX NŒUDS DONNÉS, ce qui dit si un run touche au conteneur", () => {
    expect(boites.contenu("b", ["dehors"])).toEqual([]);
    expect(boites.contenu("b", ["dehors", "m::y"])).toEqual(["m::y"]);
  });
});

describe("le statut tiré du contenu", () => {
  it("TERMINÉ QUAND TOUT EST TERMINÉ", () => {
    expect(statutDuContenu(["termine", "termine"])).toEqual({ statut: "termine", faits: 2, total: 2 });
  });

  it("UN SEUL MEMBRE EXÉCUTÉ NE SUFFIT PAS : le conteneur reste en attente, et dit combien", () => {
    // Le défaut relevé par Fabien : deux membres sur huit avaient tourné, et la bulle était terminée.
    expect(statutDuContenu(["termine", "termine", "attente", "attente", "attente", "attente", "attente", "attente"]))
      .toEqual({ statut: "attente", faits: 2, total: 8 });
  });

  it("UNE ERREUR L'EMPORTE sur tout le reste", () => {
    expect(statutDuContenu(["termine", "erreur", "attente"]).statut).toBe("erreur");
  });

  it("UN CONTENU VIDE N'EST PAS TERMINÉ : il n'a rien produit", () => {
    expect(statutDuContenu([])).toEqual({ statut: "attente", faits: 0, total: 0 });
  });

  it("UN NŒUD ENCORE EN COURS n'est pas fini", () => {
    expect(statutDuContenu(["termine", "en_cours"]).statut).toBe("attente");
  });
});

describe("la remise à zéro d'un membre", () => {
  it("EMPORTE LES BULLES QUI LE CONTIENNENT, à toute profondeur, et rien d'autre", () => {
    expect([...avecLeursBulles(VISIBLES, ["c"])].sort()).toEqual(["b", "bi", "c"]);
    expect([...avecLeursBulles(VISIBLES, ["dehors"])]).toEqual(["dehors"]);
  });

  it("NE TOUCHE PAS À L'ENSEMBLE QU'ON LUI DONNE", () => {
    const demandes = new Set(["a"]);
    avecLeursBulles(VISIBLES, demandes);
    expect([...demandes]).toEqual(["a"]);
  });
});
