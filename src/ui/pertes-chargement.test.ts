// ui/pertes-chargement.test.ts — Un rapport de chargement qui ne se trompe pas.
//
// ═══ POURQUOI CES CAS ═══
//
// UN FAUX RAPPORT EST PIRE QUE PAS DE RAPPORT. Trois sortes de nœuds n'ont légitimement pas de fiche
// au registre — une note, un cadre, une bulle repliée —, et un méta porté par le fichier lui-même
// vient d'être enregistré. Quatre exemptions, donc quatre occasions d'annoncer une perte qui n'a pas
// eu lieu, et d'envoyer chercher une panne qui n'existe pas.
import { describe, expect, it } from "vitest";
import {
  pertesDesNoeuds, traduireNomsHerites, type FicheMinimale, type NoeudCharge,
} from "./pertes-chargement";

const FICHES: Record<string, FicheMinimale> = {
  "reponse-filtre": { parametres: [{ nom: "Type" }, { nom: "Fréquence de coupure" }, { nom: "Résonance" }] },
  "oscillateur": { parametres: [{ nom: "Forme" }, { nom: "Fréquence" }] },
};
const trouver = (id: string) => FICHES[id];

const noeud = (id: string, ficheId: string, parametres?: Record<string, unknown>): NoeudCharge =>
  ({ id, data: { ficheId, parametres } });

describe("les pertes d'un chargement", () => {
  it("UN RÉGLAGE QUE LA FICHE NE DÉCLARE PLUS EST SIGNALÉ, c'est une valeur que personne ne lit", () => {
    const p = pertesDesNoeuds(
      [noeud("n-1", "reponse-filtre", { Type: "Passe-bas", Fréquence: 600, Q: 4 })],
      trouver, new Set(),
    );
    expect(p.reglages).toEqual(["n-1 (reponse-filtre) · Fréquence", "n-1 (reponse-filtre) · Q"]);
    expect(p.fiches).toEqual([]);
  });

  it("et un réglage déclaré ne l'est pas, même avec une valeur inattendue", () => {
    const p = pertesDesNoeuds(
      [noeud("n-1", "reponse-filtre", { Type: "n'importe quoi", "Fréquence de coupure": -5 })],
      trouver, new Set(),
    );
    expect(p.reglages, "ce rapport parle des CLÉS, et jamais des valeurs").toEqual([]);
  });

  it("UNE FICHE INTROUVABLE EST SIGNALÉE, ses câbles étant retirés derrière elle", () => {
    const p = pertesDesNoeuds([noeud("n-1", "composant-parti", { X: 1 })], trouver, new Set());
    expect(p.fiches).toEqual(["n-1 (composant-parti)"]);
    expect(p.reglages, "on ne compte pas les réglages d'une fiche absente : tout est perdu, non un peu")
      .toEqual([]);
  });

  it("MAIS UN MÉTA PORTÉ PAR LE FICHIER N'EST PAS UNE PERTE : il vient d'être enregistré", () => {
    const p = pertesDesNoeuds(
      [noeud("n-1", "meta-a-moi")], trouver, new Set(["meta-a-moi"]),
    );
    expect(p.fiches).toEqual([]);
  });

  it("ET NI NOTE, NI CADRE, NI BULLE REPLIÉE : aucun des trois n'a de fiche au registre", () => {
    const p = pertesDesNoeuds([
      noeud("c-1", "comment", { Texte: "une note" }),
      noeud("f-1", "frame"),
      noeud("b-1", "bulle::abc", { quoi: 1 }),
    ], trouver, new Set());
    expect(p.fiches).toEqual([]);
    expect(p.reglages, "leurs champs ne sont pas des réglages de fiche").toEqual([]);
  });

  it("un nœud sans fiche du tout est ignoré plutôt que compté", () => {
    const p = pertesDesNoeuds([{ id: "n-1" }, { id: "n-2", data: {} }], trouver, new Set());
    expect(p.fiches).toEqual([]);
    expect(p.reglages).toEqual([]);
  });

  // ═══ LA TRADUCTION DES NOMS D'AVANT ═══
  //
  // Un projet enregistre ses réglages par LIBELLÉ : renommer un réglage rendait injoignable la
  // valeur d'un fichier déjà écrit, qui retombait en silence sur le défaut. Le rapport le signalait
  // depuis le 2026-10-25 ; `nomsHerites` le RÉCUPÈRE.
  describe("un réglage renommé", () => {
    const AVEC_HERITAGE: Record<string, FicheMinimale> = {
      "reponse-filtre": {
        parametres: [
          { nom: "Type" },
          { nom: "Fréquence de coupure", nomsHerites: ["Fréquence", "Coupure"] },
          { nom: "Résonance", nomsHerites: ["Q"] },
        ],
      },
      // DEUX RÉGLAGES QUI REVENDIQUENT LE MÊME ANCIEN NOM : le premier déclarant l'emporte, pour
      // que le résultat ne dépende pas de l'ordre d'itération d'un objet.
      "deux-pretendants": {
        parametres: [{ nom: "A", nomsHerites: ["Vieux"] }, { nom: "B", nomsHerites: ["Vieux"] }],
      },
      // UN NOM HÉRITÉ QUI EST AUSSI UN NOM VIVANT : il volerait la valeur du réglage en service.
      // Un garde du catalogue le refuse ; ici l'on vérifie que le chargement n'en pâtit pas.
      "heritage-fautif": {
        parametres: [{ nom: "Gain" }, { nom: "Niveau", nomsHerites: ["Gain"] }],
      },
    };
    const avec = (id: string) => AVEC_HERITAGE[id];

    it("RETROUVE SA VALEUR SOUS SON NOM D'AUJOURD'HUI, au lieu de retomber sur le défaut", () => {
      const n = noeud("n-1", "reponse-filtre", { Type: "Passe-bas", Fréquence: 600, Q: 4 });
      expect(traduireNomsHerites([n], avec), "deux réglages traduits").toBe(2);
      expect(n.data!.parametres).toEqual({ Type: "Passe-bas", "Fréquence de coupure": 600, Résonance: 4 });
    });

    it("ET LE RAPPORT NE L'ANNONCE PLUS PERDU, ce qui est tout l'objet de l'ordre des deux", () => {
      const n = noeud("n-1", "reponse-filtre", { Type: "Passe-bas", Fréquence: 600, Q: 4 });
      traduireNomsHerites([n], avec);
      expect(pertesDesNoeuds([n], avec, new Set()).reglages).toEqual([]);
    });

    it("mais un nom qui n'est déclaré nulle part reste une perte", () => {
      const n = noeud("n-1", "reponse-filtre", { Inconnu: 1 });
      expect(traduireNomsHerites([n], avec)).toBe(0);
      expect(pertesDesNoeuds([n], avec, new Set()).reglages).toEqual(["n-1 (reponse-filtre) · Inconnu"]);
    });

    it("UN NOM VIVANT NE SE FAIT PAS VOLER : la valeur la plus récente l'emporte", () => {
      // Le fichier porte les deux. Écraser le nom d'aujourd'hui par la valeur d'hier ferait
      // RECULER le réglage — un défaut muet, et le pire des deux.
      const n = noeud("n-1", "reponse-filtre", { "Fréquence de coupure": 800, Fréquence: 600 });
      expect(traduireNomsHerites([n], avec), "rien n'est traduit, l'actuel existe déjà").toBe(0);
      expect(n.data!.parametres).toEqual({ "Fréquence de coupure": 800 });
    });

    it("et deux prétendants au même ancien nom se départagent par l'ordre de déclaration", () => {
      const n = noeud("n-1", "deux-pretendants", { Vieux: 7 });
      traduireNomsHerites([n], avec);
      expect(n.data!.parametres).toEqual({ A: 7 });
    });

    it("UN HÉRITAGE QUI RÉCLAME UN NOM EN SERVICE EST IGNORÉ, et le réglage vivant garde sa valeur", () => {
      const n = noeud("n-1", "heritage-fautif", { Gain: 3 });
      expect(traduireNomsHerites([n], avec)).toBe(0);
      expect(n.data!.parametres, "« Gain » est vivant : il ne part pas chez « Niveau »").toEqual({ Gain: 3 });
    });

    it("et une note, un cadre ou une bulle n'ont rien à traduire", () => {
      const n = noeud("n-1", "comment", { Vieux: 1 });
      expect(traduireNomsHerites([n], avec)).toBe(0);
    });
  });

  it("et un graphe sain ne dit rien du tout", () => {
    const p = pertesDesNoeuds([
      noeud("n-1", "oscillateur", { Forme: "Sinus", Fréquence: 440 }),
      noeud("n-2", "reponse-filtre", { Type: "Passe-bas", "Fréquence de coupure": 600, Résonance: 4 }),
    ], trouver, new Set());
    expect(p.fiches).toEqual([]);
    expect(p.reglages).toEqual([]);
  });
});
