// ui/pertes-chargement.test.ts — Un rapport de chargement qui ne se trompe pas.
//
// ═══ POURQUOI CES CAS ═══
//
// UN FAUX RAPPORT EST PIRE QUE PAS DE RAPPORT. Trois sortes de nœuds n'ont légitimement pas de fiche
// au registre — une note, un cadre, une bulle repliée —, et un méta porté par le fichier lui-même
// vient d'être enregistré. Quatre exemptions, donc quatre occasions d'annoncer une perte qui n'a pas
// eu lieu, et d'envoyer chercher une panne qui n'existe pas.
import { describe, expect, it } from "vitest";
import { pertesDesNoeuds, type FicheMinimale, type NoeudCharge } from "./pertes-chargement";

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

  it("et un graphe sain ne dit rien du tout", () => {
    const p = pertesDesNoeuds([
      noeud("n-1", "oscillateur", { Forme: "Sinus", Fréquence: 440 }),
      noeud("n-2", "reponse-filtre", { Type: "Passe-bas", "Fréquence de coupure": 600, Résonance: 4 }),
    ], trouver, new Set());
    expect(p.fiches).toEqual([]);
    expect(p.reglages).toEqual([]);
  });
});
