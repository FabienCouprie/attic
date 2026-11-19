// ui/configuration.test.ts — L'interface reçoit la configuration une fois, et rien sans le pont.
import { afterEach, describe, expect, it } from "vitest";

import { configurationRecue, oublierConfigurationRecue } from "./configuration";

const g = globalThis as { api?: unknown };
afterEach(() => { delete g.api; oublierConfigurationRecue(); });

describe("la configuration reçue par l'interface", () => {
  it("SANS LE PONT, RIEN : ni valeur ni problème, et le fichier se dit « sans-pont »", async () => {
    expect(await configurationRecue()).toEqual({ fichier: "sans-pont", valeurs: {}, sources: {}, problemes: [] });
  });

  it("AVEC LE PONT, CE QUE LE PROCESSUS PRINCIPAL A LU, DEMANDÉ UNE SEULE FOIS", async () => {
    let demandes = 0;
    const lue = { fichier: "lu", chemin: "C:\\Users\\f\\AppData\\Roaming\\attic\\config.json", valeurs: {}, sources: {}, problemes: [{ code: "inconnue", cle: "x", section: "commun" }] };
    g.api = { configuration: async () => { demandes++; return lue; } };
    expect(await configurationRecue()).toEqual(lue);
    await configurationRecue();
    expect(demandes).toBe(1);
    expect(Object.isFrozen(await configurationRecue()), "en lecture seule").toBe(true);
  });

  it("UN PONT QUI ÉCHOUE NE FAIT PAS ÉCHOUER L'INTERFACE : elle reçoit « sans-pont »", async () => {
    g.api = { configuration: async () => { throw new Error("No handler registered for 'configuration:lire'"); } };
    expect((await configurationRecue()).fichier).toBe("sans-pont");
  });
});
