// ui/paquet/plafond-du-paquet.test.ts — Le plafond de `config.json` atteint l'export et l'import, et
// leurs messages disent les deux nombres.
//
// LE PONT EST UN TÉMOIN : `globalThis.api.configuration` rend ce que le processus principal rendrait.
// Le chemin réel, du fichier lu au démarrage jusqu'à l'alerte, est tenu dans Electron par
// `tests-e2e/plafond-paquet-dans-electron.spec.ts`.
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configurerServicesDomaine, oublierServicesDomaine } from "../../core/services-domaine";
import { depuisPaquetAudio, versPaquetAudio } from "../../audio/paquet-audio";
import { oublierConfigurationRecue } from "../configuration";
import { importerProjet, type OptionsImportProjet } from "../hooks/useImportProjet";
import { ecrirePaquet } from "./ecrire-paquet";
import { exporterPaquet } from "./exporter-paquet";
import { PLAFOND_PAQUET, VERSION_APPLICATION } from "./format-paquet";
import { MIO, mioDeclares, mioDuPlafond, plafondDuPaquet } from "./plafond-du-paquet";

const RACINE = resolve(__dirname, "../../..");
const { SCHEMA } = createRequire(import.meta.url)(join(RACINE, "electron", "configuration.cjs"));

const PROJET = JSON.stringify({ formatVersion: 1, nodes: [{ id: "a", type: "atelier", position: { x: 0, y: 0 }, data: { ficheId: "source", parametres: {} } }], edges: [] });

/** Le pont d'Electron, réduit à ce que le plafond en lit. */
const pontAvec = (plafondPaquetMio: number) => vi.stubGlobal("api", {
  configuration: async () => ({ fichier: "lu", valeurs: { plafondPaquetMio }, sources: { plafondPaquetMio: "fichier" }, problemes: [] }),
});

const alertes: string[] = [];
const t = (cle: string) => ({
  "persistance.paquetRefuse": "REFUS:{raison}",
  "paquet.refus.plafond": "DECLARE {declare} PLAFOND {plafond}",
  "paquet.ecartes": "ECARTES {nb}",
  "paquet.ecart.plafond": "PLAFOND {plafond}",
} as Record<string, string>)[cle] ?? cle;

/** Une entrée de cache dont le son pèse `octets`, en flottants 32 bits. */
function entreeDe(octets: number) {
  const son = new AudioBuffer({ numberOfChannels: 1, length: octets / 4, sampleRate: 48000 });
  return { valeurs: [son], hashParams: "p", hashEntree: "", hashSorties: "", hashValeursEntree: "[]", tempsExecution: 1 };
}

beforeEach(() => {
  alertes.length = 0;
  oublierConfigurationRecue();
  vi.stubGlobal("alert", (m: unknown) => { alertes.push(String(m)); });
  configurerServicesDomaine({ versPaquet: versPaquetAudio, depuisPaquet: depuisPaquetAudio });
});
afterEach(() => { vi.unstubAllGlobals(); oublierConfigurationRecue(); oublierServicesDomaine(); });

describe("le plafond en vigueur", () => {
  it("LE DÉFAUT DU SCHÉMA EST L'ANCIEN PLAFOND, et il vaut sans le pont", async () => {
    expect(SCHEMA.plafondPaquetMio.defaut * MIO).toBe(PLAFOND_PAQUET);
    expect(await plafondDuPaquet()).toBe(PLAFOND_PAQUET);
  });

  it("LA CLÉ DU FICHIER LE RÈGLE, en Mio", async () => {
    pontAvec(256);
    expect(await plafondDuPaquet()).toBe(256 * MIO);
  });

  it("UN REFUS D'UN OCTET SE LIT TOUJOURS AU-DESSUS : le déclaré s'arrondit en haut, le plafond en bas", () => {
    expect([mioDeclares(1024 * MIO + 1), mioDuPlafond(1024 * MIO)]).toEqual(["1025", "1024"]);
    expect([mioDeclares(300.2 * MIO), mioDuPlafond(256.9 * MIO)]).toEqual(["301", "256"]);
  });
});

describe("l'export écrit sous le plafond de la configuration", () => {
  const demande = (cache: Map<string, unknown>) => ({
    json: PROJET, noeuds: [], cache, jamaisCache: () => false, currentFilePath: null, repertoire: "C:/travail", t,
  });
  const api = { sauvegarderBinaire: vi.fn(async () => "C:/travail/p.attic") };

  it("SOUS 33 MIO, UN SON DE 2 MIO EST ÉCARTÉ, ET L'ALERTE DIT LE PLAFOND EN VIGUEUR", async () => {
    // LE JSON DU CACHE A 32 MIO DE MARGE SOUS LE PLAFOND (`ecrire-paquet.ts`) : à 33 Mio, il reste
    // moins d'un Mio pour les sons.
    pontAvec(33);
    const r = await exporterPaquet(api, demande(new Map([["gros", entreeDe(2 * MIO)], ["petit", entreeDe(1024)]])));
    expect(r?.paquet.ecartes.map((e) => [e.id, e.code])).toEqual([["gros", "plafond"]]);
    expect(r?.paquet.cache).toEqual(["petit"]);
    expect(alertes).toEqual(["ECARTES 1\n\nPLAFOND 33 : gros"]);
  });

  it("SANS LE PONT, LE MÊME CACHE PART ENTIER sous le plafond du format", async () => {
    const r = await exporterPaquet(api, demande(new Map([["gros", entreeDe(2 * MIO)], ["petit", entreeDe(1024)]])));
    expect(r?.paquet.ecartes).toEqual([]);
    expect(r?.paquet.cache).toEqual(["gros", "petit"]);
    expect(alertes).toEqual([]);
  });
});

describe("l'import lit sous le plafond de la configuration", () => {
  const temoins = () => ({
    setNodes: vi.fn(), setEdges: vi.fn(), setPile: vi.fn(), setCurrentFilePath: vi.fn(), rfInstance: null, repertoire: "",
    grapheRacineRef: { current: null }, vueAPoserRef: { current: null }, envoyer: vi.fn(), lancerRef: { current: vi.fn() },
  }) as unknown as OptionsImportProjet;

  it("UN PAQUET AU-DELÀ DU PLAFOND RÉGLÉ EST REFUSÉ SANS RIEN TOUCHER, et le refus dit les deux nombres", async () => {
    const paquet = await ecrirePaquet({ projet: PROJET, application: VERSION_APPLICATION, cache: new Map([["a", entreeDe(3 * MIO)]]), noeuds: [] });
    expect(paquet.ecartes).toEqual([]);
    // 2 Mio : en deçà de la marge du JSON, ce qu'aucun fichier ne permet (le schéma borne à 256). Le
    // pont témoin le rend quand même : c'est la valeur reçue qui doit atteindre la lecture.
    pontAvec(2);
    const o = temoins();
    await importerProjet(o, t, new File([paquet.octets as BlobPart], "gros.attic"));
    expect(alertes).toEqual(["REFUS:DECLARE 4 PLAFOND 2"]);
    expect(o.setNodes).not.toHaveBeenCalled();
    expect(o.envoyer).not.toHaveBeenCalled();
  });
});
