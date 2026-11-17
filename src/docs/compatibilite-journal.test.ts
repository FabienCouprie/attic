// src/docs/compatibilite-journal.test.ts — Ce qu'une déclaration de rupture doit être pour compter.
//
// Le journal du dépôt est vide à sa naissance : chaque règle s'éprouve donc ici, sur des journaux
// d'essai, et chacune sur la faute qu'elle refuse.
import { describe, expect, it } from "vitest";

import type { ComposantManifeste, Manifeste } from "./compatibilite";
import type { Ecart } from "./compatibilite-ecarts";
import {
  lireJournal, modeleDeDeclaration, RAISON_A_ECRIRE, verifierJournal, versionsDuJournal,
  type Declaration, type Journal,
} from "./compatibilite-journal";

const composant = (version: number): ComposantManifeste => ({ version, entrees: [], sorties: [], reglages: [] });
const fichier = (versions: Record<string, number>, retires: Manifeste["retires"] = {}): Manifeste => ({
  forme: 1, composants: Object.fromEntries(Object.entries(versions).map(([id, v]) => [id, composant(v)])), retires,
});
const rupture = (id: string, texte: string): Ecart => ({ composant: id, sorte: "reglage-defaut", rupture: true, texte });
const RAISON = "les graphes qui portent la clé gardent leur son, ceux qui ne la portent pas sonnent plus bas";
const declaration = (id: string, version: number, ruptures: string[], raison = RAISON): Declaration =>
  ({ composant: id, version, date: "2026-11-16", ruptures, raison });
const journal = (...declarations: Declaration[]): Journal => ({ forme: 1, declarations });
const DEFAUT = "réglage « Gain » : défaut 50 → 40";

describe("une rupture déclarée", () => {
  it("EST COUVERTE par la déclaration en attente qui la nomme à la lettre", () => {
    const v = verifierJournal(journal(declaration("x", 2, [DEFAUT])), fichier({ x: 1 }), [rupture("x", DEFAUT)]);
    expect(v).toEqual({ nonDeclarees: [], problemes: [] });
  });

  it("NE L'EST PAS par une déclaration passée, qu'elle soit identique ou non", () => {
    const v = verifierJournal(journal(declaration("x", 2, [DEFAUT])), fichier({ x: 2 }), [rupture("x", DEFAUT)]);
    expect(v.nonDeclarees.map((e) => e.texte)).toEqual([DEFAUT]);
    expect(v.problemes).toEqual([]);
  });

  it("NE L'EST PAS par une déclaration qui en nomme une autre, et celle-ci est refusée", () => {
    const v = verifierJournal(journal(declaration("x", 2, ["réglage « Gain » : défaut 50 → 30"])), fichier({ x: 1 }),
      [rupture("x", DEFAUT)]);
    expect(v.nonDeclarees.map((e) => e.texte)).toEqual([DEFAUT]);
    expect(v.problemes).toEqual([
      "la déclaration version 2 de « x » nomme une rupture qui n'a pas lieu : « réglage « Gain » : défaut 50 → 30 »",
    ]);
  });
});

describe("le journal refuse", () => {
  const verdict = (j: Journal, f = fichier({ x: 1, y: 1 })) => verifierJournal(j, f, []).problemes;

  it("UNE DÉCLARATION EN ATTENTE QUI NE COUVRE AUCUNE RUPTURE", () => {
    expect(verdict(journal(declaration("x", 2, [DEFAUT])))).toEqual([
      "la déclaration version 2 de « x » nomme une rupture qui n'a pas lieu : « réglage « Gain » : défaut 50 → 40 »",
    ]);
  });

  it("DES VERSIONS QUI NE SE SUIVENT PAS", () => {
    expect(verdict(journal(declaration("x", 3, [DEFAUT])), fichier({ x: 3, y: 1 }))).toEqual([
      "déclaration 1 (« x », version 3) : la version attendue était 2, les versions d'un composant se suivent",
    ]);
  });

  it("UNE DÉCLARATION RETIRÉE DU JOURNAL, que le manifeste porte encore", () => {
    expect(verdict(journal(), fichier({ x: 2, y: 1 }))).toEqual([
      "« x » est à la version 2 dans le manifeste, et le journal s'arrête à 1 : une déclaration en a été retirée",
    ]);
  });

  it("DEUX DÉCLARATIONS EN ATTENTE POUR UN MÊME COMPOSANT", () => {
    const j = journal(declaration("x", 2, [DEFAUT]), declaration("x", 3, ["autre"]));
    expect(verifierJournal(j, fichier({ x: 1 }), [rupture("x", DEFAUT)]).problemes).toEqual([
      "déclaration 2 (« x », version 3) : une seule déclaration en attente par composant, réunir les ruptures dans la première",
    ]);
  });

  it("UN COMPOSANT QUE LE MANIFESTE VERSIONNÉ NE CONNAÎT PAS", () => {
    expect(verdict(journal(declaration("neuf", 2, [DEFAUT])))).toEqual([
      "déclaration 1 (« neuf », version 2) : le manifeste versionné ne connaît pas ce composant, et un composant neuf n'a rien à rompre",
    ]);
  });

  it("UNE RAISON ABSENTE, TROP COURTE, OU RECOPIÉE DU MODÈLE SANS ÊTRE ÉCRITE", () => {
    expect(verdict(journal(declaration("x", 2, [DEFAUT], "voulu")))).toEqual([
      "déclaration 1 (« x », version 2) : raison absente, ou de moins de 40 caractères",
    ]);
    expect(verdict(journal(declaration("x", 2, [DEFAUT], RAISON_A_ECRIRE)))).toEqual([
      "déclaration 1 (« x », version 2) : la raison est celle du modèle, recopiée sans être écrite",
    ]);
  });

  it("UNE FORME QU'IL NE CONNAÎT PAS, plutôt que de la deviner", () => {
    expect(() => lireJournal("[]")).toThrow(/forme inconnue/);
    expect(lireJournal("{\"forme\": 1, \"declarations\": []}").declarations).toEqual([]);
  });
});

describe("la version de contrat", () => {
  it("VAUT LA DERNIÈRE DÉCLARATION, et suit un composant retiré", () => {
    const j = journal(declaration("x", 2, ["a"]), declaration("parti", 2, ["b"]), declaration("x", 3, ["c"]));
    expect([...versionsDuJournal(j)]).toEqual([["x", 3], ["parti", 2]]);
    expect(verifierJournal(j, fichier({ x: 3 }, { parti: { version: 2, alias: null } }), []).problemes).toEqual([]);
  });

  it("ET LE MODÈLE PROPOSÉ SE RELIT EN DÉCLARATION, à sa raison près", () => {
    const d = JSON.parse(modeleDeDeclaration("x", 2, [DEFAUT], "2026-11-16")) as Declaration;
    expect(d).toEqual({ composant: "x", version: 2, date: "2026-11-16", ruptures: [DEFAUT], raison: RAISON_A_ECRIRE });
  });
});
