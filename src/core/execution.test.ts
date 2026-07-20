// core/execution.test.ts — Protection de la règle « tout-null = échec ».
// Vérifie que les nœuds déclarant sortieNullePermise (transcripteur MIDI vide,
// nœuds-frontière) ne sont PAS marqués en erreur par le moteur.
import { describe, it, expect } from "vitest";
import { estResultatEnErreur } from "./execution";
import type { PluginDef } from "./types";

function fakeDef(over: Partial<PluginDef<any, any>> = {}): PluginDef<any, any> {
  return {
    id: "test",
    nom: "Test",
    univers: "U",
    famille: "F",
    resume: "r",
    entrees: [],
    sorties: [{ nom: "Out", type: "audio" }],
    parametres: [],
    executer: async () => ({ valeurs: [] }),
    ...over,
  };
}

describe("estResultatEnErreur", () => {
  it("marque en erreur un résultat entièrement null sur un nœud à sorties", () => {
    const def = fakeDef();
    expect(estResultatEnErreur(def, { valeurs: [null] })).toBe(true);
    expect(estResultatEnErreur(def, { valeurs: [null, null] })).toBe(true);
  });

  it("ne marque PAS en erreur si la fiche déclare sortieNullePermise", () => {
    const def = fakeDef({ sortieNullePermise: true });
    expect(estResultatEnErreur(def, { valeurs: [null] })).toBe(false);
    expect(estResultatEnErreur(def, { valeurs: [null, null] })).toBe(false);
  });

  it("ne marque PAS en erreur un nœud sans sortie", () => {
    const def = fakeDef({ sorties: [] });
    expect(estResultatEnErreur(def, { valeurs: [] })).toBe(false);
  });

  it("respecte le drapeau erreur: true quelle que soit la sortie", () => {
    const def = fakeDef({ sortieNullePermise: true });
    expect(estResultatEnErreur(def, { valeurs: [42], erreur: true })).toBe(true);
  });

  it("ne marque PAS en erreur un résultat partiellement null", () => {
    const def = fakeDef({ sorties: [{ nom: "A", type: "audio" }, { nom: "B", type: "texte" }] });
    expect(estResultatEnErreur(def, { valeurs: [null, "texte"] })).toBe(false);
  });
});
