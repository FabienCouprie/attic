// core/reglages-lies.test.ts — La liaison ajuste ce qui n'a pas été choisi, et rien d'autre.
//
// SUR UNE DÉCLARATION D'ESSAI depuis le 2026-11-21. Le cœur tenait la liaison de « Courbe » ; la fiche
// la déclare maintenant (`defautSelon`), et ce test éprouve la règle seule, sur une fiche aux noms
// neutres. Les neuf cas d'avant sont rejoués sur la vraie fiche dans `plugins/courbe-reglages-lies.test.ts`.
//
// CE QUI EST TENU :
//   1. PASSER À UNE VALEUR DÉCLARÉE PORTE LE DÉFAUT QU'ELLE DÉCLARE, et rien d'autre ne bouge.
//   2. UNE VALEUR CHOISIE N'EST JAMAIS RÉÉCRITE. C'est la seule condition qui rend la liaison
//      acceptable : qui a mis 3 Hz garde 3 Hz en changeant de forme.
//   3. LE RETOUR À UNE VALEUR NON DÉCLARÉE REVIENT AU DÉFAUT du réglage, symétriquement.
//   4. AUCUNE AUTRE FICHE, ET AUCUN AUTRE RÉGLAGE, n'est touché.
import { describe, expect, it } from "vitest";

import { reglagesApresChangement, type FicheDeReglages } from "./reglages-lies";

/** Une fiche d'essai : « Vitesse » vaut 1 par défaut, et 4 quand « Mode » vaut `b` ou `c`. */
const ESSAI: FicheDeReglages = {
  parametres: [
    { nom: "Mode", defaut: "a" },
    { nom: "Vitesse", defaut: 1, defautSelon: { reglage: "Mode", valeurs: { b: 4, c: 4 } } },
    { nom: "Autre", defaut: 7 },
  ],
};
/** La même fiche sans déclaration : les mêmes noms, et aucune liaison. */
const MUETTE: FicheDeReglages = { parametres: [{ nom: "Mode", defaut: "a" }, { nom: "Vitesse", defaut: 1 }] };

describe("la règle des réglages liés, lue sur la fiche", () => {
  it("PASSER À UNE VALEUR DÉCLARÉE porte le défaut qu'elle déclare, et rien d'autre ne bouge", () => {
    const apres = reglagesApresChangement(ESSAI, { Mode: "a", Vitesse: 1, Autre: 7 }, "Mode", "b");
    expect(apres).toEqual({ Mode: "b", Vitesse: 4, Autre: 7 });
  });

  it("UNE VALEUR CHOISIE N'EST JAMAIS RÉÉCRITE", () => {
    expect(reglagesApresChangement(ESSAI, { Mode: "a", Vitesse: 3 }, "Mode", "b").Vitesse).toBe(3);
    expect(reglagesApresChangement(ESSAI, { Mode: "b", Vitesse: 3 }, "Mode", "a").Vitesse).toBe(3);
  });

  it("LE RETOUR À UNE VALEUR NON DÉCLARÉE revient au défaut du réglage", () => {
    expect(reglagesApresChangement(ESSAI, { Mode: "c", Vitesse: 4 }, "Mode", "a").Vitesse).toBe(1);
  });

  it("passer d'une valeur déclarée à une autre de même défaut ne change rien", () => {
    expect(reglagesApresChangement(ESSAI, { Mode: "b", Vitesse: 4 }, "Mode", "c").Vitesse).toBe(4);
  });

  it("UN RÉGLAGE ABSENT prend le défaut naturel de la nouvelle valeur", () => {
    expect(reglagesApresChangement(ESSAI, { Mode: "a" }, "Mode", "b").Vitesse).toBe(4);
  });

  it("changer un AUTRE réglage ne déclenche rien", () => {
    expect(reglagesApresChangement(ESSAI, { Mode: "b", Vitesse: 1 }, "Autre", 2)).toEqual({ Mode: "b", Vitesse: 1, Autre: 2 });
  });

  it("UNE FICHE QUI NE DÉCLARE RIEN n'est pas concernée, même avec les mêmes noms, ni une fiche absente", () => {
    expect(reglagesApresChangement(MUETTE, { Mode: "a", Vitesse: 1 }, "Mode", "b")).toEqual({ Mode: "b", Vitesse: 1 });
    expect(reglagesApresChangement(undefined, { Mode: "a", Vitesse: 1 }, "Mode", "b")).toEqual({ Mode: "b", Vitesse: 1 });
  });

  it("UNE CLÉ DU PROTOTYPE N'EST PAS UNE VALEUR DÉCLARÉE : `constructor` garde le défaut", () => {
    expect(reglagesApresChangement(ESSAI, { Mode: "b", Vitesse: 4 }, "Mode", "constructor").Vitesse).toBe(1);
  });

  it("l'objet reçu n'est jamais modifié", () => {
    const avant = Object.freeze({ Mode: "a", Vitesse: 1 });
    const apres = reglagesApresChangement(ESSAI, avant, "Mode", "b");
    expect(avant.Vitesse).toBe(1);
    expect(apres).not.toBe(avant);
  });
});
