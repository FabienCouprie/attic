// ui/oubli-noeuds.test.ts — Ce qu'un graphe abandonne emporte, et ce qu'il laisse.
//
// CE QUE CE TEST TIENT, et c'est le defaut exact qu'il ferme : un composant pose sur un canevas
// vide recevait le resultat et le statut du workflow d'avant, parce que les deux magasins gardaient
// ses entrees et que l'identifiant `noeud-1` se rejoue des que le canevas est vide.
//
// ET IL TIENT AUSSI LE CONTRAIRE, qui est la moitie qu'une correction pressee aurait perdue : les
// noeuds du graphe racine sont absents du canevas pendant qu'on travaille dans un meta-composant,
// et leurs resultats doivent survivre. Une regle qui oublierait « tout ce qui n'est pas a l'ecran »
// viderait le graphe de l'utilisateur chaque fois qu'il entre dans un meta.
import { beforeEach, describe, expect, it } from "vitest";
import { idsDe, orphelins, oublierNoeuds } from "./oubli-noeuds";
import { effacerResultats, poserResultat, resultatDe, resultatsPoses } from "./resultats";
import { poserStatut, reinitialiserStatuts, statutDe, statutsPoses } from "./statuts";

beforeEach(() => {
  effacerResultats();
  reinitialiserStatuts();
});

describe("les orphelins d'un graphe abandonne", () => {
  it("nomme ce qu'aucun graphe ne porte plus", () => {
    expect(orphelins(["noeud-2"], ["noeud-1", "noeud-2", "noeud-3"])).toEqual(["noeud-1", "noeud-3"]);
  });

  it("ne nomme rien quand tout est encore la", () => {
    expect(orphelins(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("oublie tout quand plus rien ne vit, ce qui est le cas de la croix rouge", () => {
    expect(orphelins([], ["noeud-1", "noeud-2"])).toEqual(["noeud-1", "noeud-2"]);
  });

  it("ne rend pas deux fois le meme identifiant, les deux magasins pouvant le porter", () => {
    expect(orphelins([], ["noeud-1", "noeud-1"])).toEqual(["noeud-1"]);
  });

  it("lit les identifiants d'une liste de noeuds, vide ou absente", () => {
    expect(idsDe([{ id: "a" }, { id: "b" }])).toEqual(["a", "b"]);
    expect(idsDe(null)).toEqual([]);
    expect(idsDe(undefined)).toEqual([]);
  });
});

describe("oublier les noeuds d'un graphe abandonne", () => {
  it("UN COMPOSANT POSE SUR UN CANEVAS VIDE N'HERITE DE RIEN", () => {
    // Le workflow d'avant : un noeud qui a tourne et montre quelque chose.
    poserResultat("noeud-1", { message: "Voyelle a · 1655 bouffees", duree: 3 });
    poserStatut("noeud-1", "termine");
    expect(resultatDe("noeud-1")).not.toEqual({});

    // La croix rouge : plus rien ne vit.
    expect(oublierNoeuds([])).toBe(1);

    // Le composant neuf reprend l'identifiant `noeud-1`, et ne trouve rien.
    expect(resultatDe("noeud-1")).toEqual({});
    expect(statutDe("noeud-1").statut).toBe("attente");
  });

  it("GARDE CE QUI EST ENCORE ATTEIGNABLE HORS DU CANEVAS : le graphe racine d'un meta", () => {
    poserResultat("noeud-1", { message: "sur le canevas" });
    poserResultat("noeud-7", { message: "dans le graphe racine" });
    poserStatut("noeud-7", "termine");

    // On travaille dans un meta : `noeud-7` n'est pas a l'ecran, mais il reviendra.
    expect(oublierNoeuds(["noeud-1", "noeud-7"])).toBe(0);
    expect(resultatDe("noeud-7")).toEqual({ message: "dans le graphe racine" });
    expect(statutDe("noeud-7").statut).toBe("termine");
  });

  it("n'oublie que les absents, et laisse les presents intacts", () => {
    poserResultat("noeud-1", { message: "garde" });
    poserResultat("noeud-2", { message: "oublie" });
    poserStatut("noeud-2", "termine");

    expect(oublierNoeuds(["noeud-1"])).toBe(1);
    expect(resultatDe("noeud-1")).toEqual({ message: "garde" });
    expect(resultatDe("noeud-2")).toEqual({});
    expect(statutDe("noeud-2").statut).toBe("attente");
  });

  it("oublie un identifiant que seul le magasin des statuts portait", () => {
    poserStatut("noeud-9", "termine");
    expect(resultatsPoses()).not.toContain("noeud-9");
    expect(statutsPoses()).toContain("noeud-9");
    expect(oublierNoeuds([])).toBe(1);
    expect(statutDe("noeud-9").statut).toBe("attente");
  });

  it("ne fait rien, et le dit, quand il n'y a rien a oublier", () => {
    expect(oublierNoeuds([])).toBe(0);
    poserResultat("a", { x: 1 });
    expect(oublierNoeuds(["a"])).toBe(0);
  });

  it("revoque les adresses blob des resultats oublies", () => {
    const revoquees: string[] = [];
    const avant = URL.revokeObjectURL;
    URL.revokeObjectURL = (u: string) => { revoquees.push(u); };
    try {
      poserResultat("noeud-1", { url: "blob:http://local/abcd", nom: "pas une adresse" });
      oublierNoeuds([]);
    } finally {
      URL.revokeObjectURL = avant;
    }
    expect(revoquees).toEqual(["blob:http://local/abcd"]);
  });
});
