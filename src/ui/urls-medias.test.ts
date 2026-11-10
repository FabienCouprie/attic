// ui/urls-medias.test.ts — Une URL de média ne se révoque que quand plus rien ne la tient.
//
// CE QUE CES CAS GARDENT, point A6 de la revue d'architecture du 2026-10-31. La règle est de Fabien :
// ni un nœud vivant, ni une entrée d'annulation ou de rétablissement, ni le presse-papiers. Chaque
// détenteur est éprouvé SEUL, sous la forme exacte que l'atelier lui donne : le tableau des nœuds,
// le graphe racine d'un méta, les instantanés de `ui/historique.ts`, la copie de
// `ui/presse-papiers-noeuds.ts`. Un détenteur oublié est une URL révoquée sous un lecteur.
import { describe, expect, it, vi } from "vitest";

import { instantane, noterAction, annuler, pilesVides } from "./historique";
import { RegistreUrlsMedias, urlsDUnFige, urlsTenues } from "./urls-medias";

/** Un registre d'essai : des adresses numérotées, et la liste de celles qu'il a révoquées. */
function registre() {
  let n = 0;
  const revoquees: string[] = [];
  const r = new RegistreUrlsMedias(() => `blob:essai/${++n}`, (u) => { revoquees.push(u); });
  return { r, revoquees };
}

const son = () => new Blob(["son"]);
const noeud = (id: string, data: Record<string, unknown>) => ({ id, type: "atelier", position: { x: 0, y: 0 }, data });

describe("le registre des URL de médias", () => {
  it("UNE URL QUE RIEN N'A ENCORE TENUE N'EST PAS RÉVOQUÉE : elle vient de naître, et sera posée", () => {
    const { r, revoquees } = registre();
    const url = r.creer(son());
    expect(r.balayer()).toEqual([]);
    expect(revoquees).toEqual([]);
    expect(r.etat().get(url)).toBe(false);
  });

  it("TENUE PUIS LÂCHÉE, ELLE EST RÉVOQUÉE une fois, et le registre l'oublie", () => {
    const { r, revoquees } = registre();
    let canevas: unknown[] = [];
    r.declarerRacine("canevas", () => canevas);
    const url = r.creer(son());
    canevas = [noeud("a", { audioUrl: url })];
    expect(r.balayer()).toEqual([]);
    expect(r.etat().get(url)).toBe(true);
    canevas = [noeud("a", { audioUrl: "blob:essai/autre" })];
    expect(r.balayer()).toEqual([url]);
    expect(r.balayer()).toEqual([]);
    expect(revoquees).toEqual([url]);
    expect(r.etat().has(url)).toBe(false);
  });

  it("REMPLACÉE AVANT TOUT BALAYAGE, ELLE EST RÉVOQUÉE QUAND MÊME : la création de la suivante l'a vue tenue", () => {
    // MESURÉ DANS L'APPLICATION : charger A, lancer, charger B en moins d'un quart de seconde. Aucun
    // balayage n'avait vu A tenue, et elle restait « naissante » pour toujours.
    const { r, revoquees } = registre();
    let canevas: unknown[] = [];
    r.declarerRacine("canevas", () => canevas);
    const a = r.creer(son());
    canevas = [noeud("n", { audioUrl: a })];
    const b = r.creer(son());
    canevas = [noeud("n", { audioUrl: b })];
    expect(r.balayer()).toEqual([a]);
    expect(revoquees).toEqual([a]);
    expect(r.etat().get(b)).toBe(true);
  });

  it("UNE URL QUI N'A PAS ÉTÉ INSCRITE N'EST JAMAIS RÉVOQUÉE, même lâchée", () => {
    const { r, revoquees } = registre();
    let canevas: unknown[] = [noeud("a", { audioUrl: "blob:venue/dailleurs" })];
    r.declarerRacine("canevas", () => canevas);
    r.creer(son());
    r.balayer();
    canevas = [];
    r.balayer();
    expect(revoquees).toEqual([]);
  });

  it("RIEN D'INSCRIT : le balayage ne lit aucune racine", () => {
    const { r } = registre();
    const lire = vi.fn(() => []);
    r.declarerRacine("canevas", lire);
    expect(r.balayer()).toEqual([]);
    expect(lire).not.toHaveBeenCalled();
  });

  it("UNE RACINE QUI LÈVE SUSPEND LE BALAYAGE : rien n'est révoqué sur une lecture incomplète", () => {
    const { r, revoquees } = registre();
    let canevas: unknown[] = [];
    r.declarerRacine("canevas", () => canevas);
    r.declarerRacine("cassée", () => { if (canevas.length === 0) throw new Error("illisible"); return null; });
    const url = r.creer(son());
    canevas = [noeud("a", { audioUrl: url })];
    r.balayer();
    canevas = [];
    const avertir = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(r.balayer()).toEqual([]);
    expect(avertir).toHaveBeenCalledTimes(1);
    avertir.mockRestore();
    expect(revoquees).toEqual([]);
  });

  it("UNE RACINE RETIRÉE NE TIENT PLUS RIEN, et en retirer une laisse l'autre du même nom", () => {
    const { r, revoquees } = registre();
    const url = r.creer(son());
    const tenir = () => [noeud("a", { audioUrl: url })];
    const retirerPremiere = r.declarerRacine("historique", tenir);
    const retirerSeconde = r.declarerRacine("historique", tenir);
    r.balayer();
    retirerPremiere();
    expect(r.balayer()).toEqual([]);
    retirerSeconde();
    expect(r.balayer()).toEqual([url]);
    expect(revoquees).toEqual([url]);
  });
});

describe("chaque détenteur suffit à tenir une URL", () => {
  /**
   * Le détenteur, sous la forme que l'atelier lui donne, tenant `url`. Pour chacun : tant qu'il est
   * déclaré, l'URL vit ; retiré, elle part au balayage suivant.
   */
  const DETENTEURS: Record<string, (url: string) => unknown> = {
    "un nœud vivant du canevas": (url) => [noeud("a", { ficheId: "entree-audio", audioUrl: url })],
    "le graphe racine d'un méta ouvert": (url) => ({ nodes: [noeud("a", { audioUrl: url })], edges: [] }),
    // LES TROIS FORMES DE L'HISTORIQUE sont lues comme `hooks/useHistorique.ts` les déclare : chaque
    // instantané par `urlsDUnFige`.
    "une entrée d'annulation": (url) => {
      const piles = pilesVides();
      noterAction(piles, instantane([noeud("a", { audioUrl: url })], []), 50);
      return [...piles.annulation, ...piles.retablissement].map(urlsDUnFige);
    },
    "une entrée de rétablissement": (url) => {
      const piles = pilesVides();
      noterAction(piles, instantane([noeud("a", { audioUrl: "blob:essai/avant" })], []), 50);
      annuler(piles, () => instantane([noeud("a", { audioUrl: url })], []));
      return [...piles.annulation, ...piles.retablissement].map(urlsDUnFige);
    },
    "le graphe racine porté par une entrée d'annulation": (url) => {
      const piles = pilesVides();
      noterAction(piles, instantane([], [], { pile: [], racine: { nodes: [noeud("r", { audioUrl: url })], edges: [] }, cheminFichier: null }), 50);
      return [...piles.annulation, ...piles.retablissement].map(urlsDUnFige);
    },
    "le presse-papiers d'une coupe": (url) => ({
      jeton: "j", coupe: true,
      elements: [{ ficheId: "entree-audio", parametres: {}, width: 230, height: 200, dx: 0, dy: 0, data: { audioUrl: url } }],
    }),
    "la copie que garde la démonstration filmée": (url) => [noeud("a", { audioUrl: url })],
  };

  for (const [quoi, forme] of Object.entries(DETENTEURS)) {
    it(`${quoi.toUpperCase()} LA TIENT, et la lâche en partant`, () => {
      const { r, revoquees } = registre();
      const url = r.creer(son());
      const retirer = r.declarerRacine(quoi, () => forme(url));
      r.balayer();
      expect(r.balayer(), "tenue, elle n'est pas révoquée").toEqual([]);
      retirer();
      expect(r.balayer(), "lâchée, elle l'est").toEqual([url]);
      expect(revoquees).toEqual([url]);
    });
  }
});

describe("urlsTenues : où la recherche descend", () => {
  const inscrites = new Set(["blob:a", "blob:b", "blob:c"]);

  it("DANS LES OBJETS SIMPLES ET LES TABLEAUX, à toute profondeur", () => {
    const tenues = urlsTenues([{ x: [{ y: { z: "blob:a" } }] }, ["blob:b"]], inscrites);
    expect([...tenues].sort()).toEqual(["blob:a", "blob:b"]);
  });

  it("PAS DANS UN FICHIER, UN TAMPON NI UN OBJET D'UNE AUTRE CLASSE : ce que l'historique garde par référence", () => {
    class Porteur { url = "blob:c"; }
    const tenues = urlsTenues([new Porteur(), new File(["x"], "blob:c"), new Float32Array(4), new Map([["k", "blob:c"]])], inscrites);
    expect([...tenues]).toEqual([]);
  });

  it("UN OBJET QUI SE RÉFÉRENCE LUI-MÊME ne fait pas tourner la recherche en rond", () => {
    const a: Record<string, unknown> = { url: "blob:a" };
    a.soi = a;
    expect([...urlsTenues([a], inscrites)]).toEqual(["blob:a"]);
  });

  it("DANS UN NŒUD, LE PREMIER NIVEAU DE SON data SEULEMENT : une URL rangée plus bas n'est pas vue", () => {
    const n = noeud("a", { audioUrl: "blob:a", sequenceNotes: [{ note: 60, url: "blob:b" }], vue: { url: "blob:c" } });
    expect([...urlsTenues([[n]], inscrites)]).toEqual(["blob:a"]);
    expect([...urlsTenues([{ id: "x", data: {}, autre: "blob:b" }], inscrites)], "ni à côté de son data").toEqual([]);
  });

  it("UNE CHAÎNE QUI N'EST PAS INSCRITE n'est pas retenue", () => {
    expect([...urlsTenues(["blob:inconnue", { u: "texte" }], inscrites)]).toEqual([]);
  });
});

describe("urlsDUnFige : un instantané se relève une fois", () => {
  it("REND LES ADRESSES BLOB DE L'OBJET, et la même liste à la seconde lecture, sans le relire", () => {
    const entree = instantane([noeud("a", { audioUrl: "blob:a", nom: "x" })], []);
    const premiere = urlsDUnFige(entree);
    expect(premiere).toEqual(["blob:a"]);
    // L'objet modifié après coup n'est PAS relu : c'est la condition d'emploi, écrite en tête.
    (entree.nodes[0] as any).data.audioUrl = "blob:z";
    expect(urlsDUnFige(entree)).toBe(premiere);
  });
});
