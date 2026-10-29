// ui/fenetre.test.ts — Ce qu'une fenêtre reprend en s'ouvrant, et ce qu'elle écrit.
//
// LE DÉFAUT MESURÉ LE 2026-10-29 : une seconde fenêtre s'ouvrait sur le graphe ET le fichier de la
// première, et les deux sauvegardes automatiques réécrivaient le même fichier à tour de rôle. La
// règle de Fabien : une fenêtre neuve naît vide, sans fichier courant. Ces cas la tiennent, et
// tiennent aussi ce que la règle ne doit pas casser : un rechargement rend le document de la fenêtre,
// et un graphe semé puis rechargé — ce que font les specs — est repris comme avant.
import { describe, expect, it } from "vitest";

import {
  CLE_ENCOURS, CLE_FICHIER, PARAMETRE_FENETRE, VALEUR_NOUVELLE,
  ecrireEncours, ecrireEncoursPropre, lireDemarrage, noterFichierPropre, type SourcesDemarrage,
} from "./fenetre";

class Memoire {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

const NOUVELLE = `?${PARAMETRE_FENETRE}=${VALEUR_NOUVELLE}`;
const noeuds = (encours: string | null) => (encours ? JSON.parse(encours).nodes : null);

function partageAvecUnDocument() {
  const partage = new Memoire();
  partage.setItem(CLE_ENCOURS, JSON.stringify({ nodes: [1] }));
  partage.setItem(CLE_FICHIER, "E:/projet.json");
  return partage;
}

/** Ouvre une fenêtre, puis rend de quoi la recharger avec le même stockage propre. */
function fenetre(partage: Memoire, recherche = "", id = "A") {
  const propre = new Memoire();
  const s = (navigation: string): SourcesDemarrage => ({ recherche, navigation, partage, propre, nouvelId: () => id });
  const ouverture = lireDemarrage(s("navigate"));
  return { propre, ouverture, recharger: () => lireDemarrage(s("reload")) };
}

describe("ce qu'une fenêtre reprend", () => {
  it("AU LANCEMENT, la première fenêtre reprend l'en-cours et son fichier", () => {
    const { ouverture } = fenetre(partageAvecUnDocument());
    expect(ouverture.origine).toBe("lancement");
    expect(noeuds(ouverture.encours)).toEqual([1]);
    expect(ouverture.fichier).toBe("E:/projet.json");
  });

  it("UNE FENÊTRE NEUVE NAÎT VIDE ET SANS FICHIER, quel que soit le stockage partagé", () => {
    const { ouverture } = fenetre(partageAvecUnDocument(), NOUVELLE);
    expect(ouverture).toMatchObject({ origine: "nouvelle", encours: null, fichier: null });
  });

  it("RECHARGÉE, ELLE REND SON PROPRE DOCUMENT quand une autre a écrit l'en-cours après elle", () => {
    const partage = partageAvecUnDocument();
    const b = fenetre(partage, NOUVELLE, "B");
    ecrireEncours({ nodes: [2] }, null, { partage, propre: b.propre, id: "B" });
    // La fenêtre A écrit ensuite l'en-cours partagé, signé d'elle.
    ecrireEncours({ nodes: [3] }, "E:/a.json", { partage, propre: new Memoire(), id: "A" });
    const d = b.recharger();
    expect(d.origine).toBe("rechargement");
    expect(noeuds(d.encours), "le graphe de B, et non celui de A").toEqual([2]);
    expect(d.fichier, "ni le fichier de A").toBeNull();
    expect(d.id, "et elle garde son identifiant").toBe("B");
  });

  it("ET L'EN-COURS QU'ELLE A SIGNÉ ELLE-MÊME est repris tel quel", () => {
    const partage = partageAvecUnDocument();
    const a = fenetre(partage, "", "A");
    ecrireEncours({ nodes: [4] }, "E:/a.json", { partage, propre: a.propre, id: "A" });
    expect(noeuds(a.recharger().encours)).toEqual([4]);
  });

  it("UN EN-COURS SANS SIGNATURE EST UNE SEMENCE, reprise au rechargement comme avant", () => {
    // C'est ce que font les specs : poser un graphe dans `localStorage`, puis recharger.
    const partage = new Memoire();
    const a = fenetre(partage);
    ecrireEncours({ nodes: [5] }, null, { partage, propre: a.propre, id: "A" });
    partage.setItem(CLE_ENCOURS, JSON.stringify({ nodes: [6] }));
    expect(noeuds(a.recharger().encours)).toEqual([6]);
  });

  it("UN ONGLET OUVERT PAR window.open HÉRITE DU sessionStorage, mais pas du document ni de l'identifiant", () => {
    // En mode web, l'onglet reçoit une copie du stockage de son ouvreur. Seul le type de navigation
    // dit qu'il ne s'agit pas d'un rechargement.
    const partage = partageAvecUnDocument();
    const ouvreur = fenetre(partage, "", "A");
    const copie = new Memoire();
    copie.m = new Map(ouvreur.propre.m);
    const d = lireDemarrage({ recherche: NOUVELLE, navigation: "navigate", partage, propre: copie, nouvelId: () => "C" });
    expect(d).toMatchObject({ origine: "nouvelle", id: "C" });
    expect(copie.getItem(CLE_ENCOURS), "et la copie héritée est effacée").toBeNull();
  });

  it("sans stockage, la fenêtre s'ouvre quand même", () => {
    expect(lireDemarrage({ recherche: "", navigation: undefined, partage: undefined, propre: undefined }))
      .toMatchObject({ origine: "lancement", encours: null, fichier: null });
  });
});

describe("ce qu'une fenêtre écrit", () => {
  it("L'EN-COURS PARTAGÉ EMPORTE SON FICHIER DANS LE MÊME GESTE, et sa signature", () => {
    // Séparés, la reprise rattachait le graphe d'une fenêtre au fichier de l'autre.
    const partage = partageAvecUnDocument();
    ecrireEncours({ nodes: [7] }, null, { partage, propre: new Memoire(), id: "A" });
    expect(JSON.parse(partage.getItem(CLE_ENCOURS)!)).toEqual({ nodes: [7], fenetre: "A" });
    expect(partage.getItem(CLE_FICHIER), "un graphe sans fichier efface le fichier d'avant").toBeNull();
  });

  it("la copie seule ne touche pas au partagé", () => {
    const partage = partageAvecUnDocument();
    const propre = new Memoire();
    ecrireEncoursPropre({ nodes: [8] }, "E:/autre.json", { propre, id: "A" });
    expect(noeuds(partage.getItem(CLE_ENCOURS))).toEqual([1]);
    expect(propre.getItem(CLE_FICHIER)).toBe("E:/autre.json");
  });

  it("le fichier courant ne s'écrit que dans la copie de la fenêtre", () => {
    const propre = new Memoire();
    noterFichierPropre("E:/projet.json", propre);
    expect(propre.getItem(CLE_FICHIER)).toBe("E:/projet.json");
    noterFichierPropre(null, propre);
    expect(propre.getItem(CLE_FICHIER)).toBeNull();
  });
});
