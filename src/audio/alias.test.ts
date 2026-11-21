// audio/alias.test.ts — Le registre audio ouvre chaque alias que la table énumère.
//
// LE MANIFESTE LIT LA TABLE, LE MOTEUR LIT LE REGISTRE, et ce cas les tient ensemble. Depuis que la
// table est remise au registre par `audio/adaptateur.ts`, un adaptateur qui ne la remettrait plus
// laisserait `COMPATIBILITE.json` promettre quatorze alias que plus rien ne résout : chaque graphe
// enregistré qui les porte perdrait ses nœuds à l'ouverture, et le manifeste resterait vert.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "./adaptateur";
import { ALIAS } from "./alias";

describe("les alias du domaine audio", () => {
  it("LE REGISTRE AUDIO OUVRE CHAQUE ANCIEN IDENTIFIANT DE LA TABLE, vers la fiche qu'elle nomme", () => {
    const entrees = Object.entries(ALIAS);
    expect(entrees.length, "la table est vide : ce cas n'éprouve plus rien").toBeGreaterThan(0);
    const fautes = entrees
      .filter(([ancien, cible]) => registre.trouverDef(ancien)?.id !== cible)
      .map(([ancien, cible]) => `  ${ancien} → ${cible} : le registre rend ${registre.trouverDef(ancien)?.id ?? "rien"}`);
    expect(fautes, ["", "LE REGISTRE NE RÉSOUT PAS LA TABLE :", ...fautes, ""].join("\n")).toEqual([]);
  });
});
