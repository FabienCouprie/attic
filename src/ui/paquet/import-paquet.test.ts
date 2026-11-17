// ui/paquet/import-paquet.test.ts — Un paquet abîmé n'écrase pas le projet ouvert ; un paquet sain rend
// son cache, ses médias, et demande la passe de repose.
//
// L'ATELIER EST REMPLACÉ PAR DES TÉMOINS : chaque setter note qu'on l'a appelé, le cache est une table
// qui porte déjà l'entrée d'un graphe ouvert, et la vue, la pile et le graphe racine sont des
// références qu'on relit après. Un paquet refusé ne doit avoir touché à AUCUN d'eux.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configurerRegistreMeta, creerRegistre } from "../../core";
import { configurerServicesDomaine, oublierServicesDomaine } from "../../core/services-domaine";
import { depuisPaquetAudio, versPaquetAudio } from "../../audio/paquet-audio";
import { configurerRegistreUI } from "../registre-actif";
import { importerProjet, type OptionsImportProjet } from "../hooks/useImportProjet";
import { ecrirePaquet } from "./ecrire-paquet";
import { lireRepertoire } from "./zip";
import { VERSION_APPLICATION } from "./format-paquet";

const PROJET = JSON.stringify({ formatVersion: 1, nodes: [
  { id: "a", type: "atelier", position: { x: 0, y: 0 }, data: { ficheId: "source", parametres: {}, audioNom: "voix.wav" } },
  { id: "b", type: "atelier", position: { x: 300, y: 0 }, data: { ficheId: "effet", parametres: {} } },
], edges: [{ id: "ab", source: "a", target: "b", sourceHandle: "out:0", targetHandle: "in:0" }] }, null, 2);

function temoins() {
  const appels: string[] = [];
  const note = (nom: string) => (...a: unknown[]) => { appels.push(nom); return a; };
  const vue = { x: 1, y: 2, zoom: 1 };
  const racine = { nodes: [{ id: "ancien" }], edges: [] };
  const lancer = vi.fn();
  const o = {
    setNodes: vi.fn(note("setNodes")), setEdges: vi.fn(note("setEdges")), setPile: vi.fn(note("setPile")),
    setCurrentFilePath: vi.fn(note("setCurrentFilePath")), rfInstance: null, repertoire: "",
    grapheRacineRef: { current: racine }, vueAPoserRef: { current: vue },
    cacheExec: { current: new Map<string, unknown>([["ancien", { valeurs: [1] }]]) }, lancerRef: { current: lancer },
  } as unknown as OptionsImportProjet;
  return { o, appels, vue, racine, lancer };
}

const alertes: string[] = [];
const t = (cle: string) => (cle === "persistance.paquetRefuse" ? "REFUS:{raison}" : cle === "paquet.refus.application" ? "ATTIC {v} > {n}" : cle);

beforeEach(() => {
  alertes.length = 0;
  vi.stubGlobal("window", {});
  vi.stubGlobal("alert", (m: unknown) => { alertes.push(String(m)); });
  configurerRegistreMeta(creerRegistre<unknown, unknown>());
  configurerRegistreUI(creerRegistre<unknown, unknown>());
  configurerServicesDomaine({ versPaquet: versPaquetAudio, depuisPaquet: depuisPaquetAudio });
});
afterEach(() => { vi.unstubAllGlobals(); oublierServicesDomaine(); });

async function paquetSain(application = VERSION_APPLICATION): Promise<Uint8Array> {
  const son = new AudioBuffer({ numberOfChannels: 1, length: 64, sampleRate: 48000 });
  son.copyToChannel(Float32Array.from({ length: 64 }, (_, i) => i / 64), 0);
  const entree = { valeurs: [son], hashParams: "p", hashEntree: "", hashSorties: "", hashValeursEntree: "[]", tempsExecution: 3 };
  return (await ecrirePaquet({
    projet: PROJET, application, cache: new Map([["a", entree]]),
    noeuds: [{ id: "a", data: { audioFichier: new File([new Uint8Array([1, 2])], "voix.wav", { type: "audio/wav" }) } }],
  })).octets;
}

/** Les trois façons d'abîmer un paquet sain que l'import doit refuser. */
async function abimes(): Promise<Record<string, Uint8Array>> {
  const sain = await paquetSain();
  const tronque = sain.subarray(0, sain.length - 30);
  const empreinte = sain.slice();
  // LE CANAL DU TAMPON, 256 octets : l'atome 0 est le média, deux octets seulement.
  const r = lireRepertoire(sain).get("donnees/000001.bin")!;
  expect(r.taille).toBe(256);
  empreinte[r.debut + 10] ^= 0x40;
  const crcAJour = empreinte.slice();
  // LE CRC EST REFAIT POUR QUE SEULE L'EMPREINTE SHA-256 TROUVE LA FAUTE.
  const { crc32 } = await import("./zip");
  const dv = new DataView(crcAJour.buffer);
  const crc = crc32(crcAJour.subarray(r.debut, r.debut + r.taille));
  const fin = crcAJour.length - 22;
  let o = dv.getUint32(fin + 16, true);
  for (let k = 0; k < dv.getUint16(fin + 10, true); k++) {
    const l = dv.getUint16(o + 28, true);
    if (new TextDecoder().decode(crcAJour.subarray(o + 46, o + 46 + l)) === "donnees/000001.bin") {
      dv.setUint32(o + 16, crc, true);
      dv.setUint32(dv.getUint32(o + 42, true) + 14, crc, true);
    }
    o += 46 + l;
  }
  return { tronque, crc: empreinte, empreinte: crcAJour };
}

describe("un paquet abîmé n'écrase pas le projet ouvert", () => {
  it("TRONQUÉ, AU CRC FAUX, À L'EMPREINTE FAUSSE : aucun témoin n'est appelé, et la raison est dite", async () => {
    for (const [cas, octets] of Object.entries(await abimes())) {
      const { o, appels, vue, racine, lancer } = temoins();
      alertes.length = 0;
      await importerProjet(o, t, new File([octets as BlobPart], "projet.attic"));
      expect(appels, cas).toEqual([]);
      expect([...o.cacheExec.current.keys()], cas).toEqual(["ancien"]);
      expect(o.vueAPoserRef.current, cas).toBe(vue);
      expect(o.grapheRacineRef.current, cas).toBe(racine);
      expect(lancer, cas).not.toHaveBeenCalled();
      expect(alertes, cas).toEqual([`REFUS:paquet.refus.${cas === "crc" ? "crc" : cas === "tronque" ? "tronque" : "empreinte"}`]);
    }
  });

  it("UN PAQUET D'UN ATTIC PLUS RÉCENT N'Y TOUCHE PAS NON PLUS, et le refus dit les deux versions", async () => {
    const { o, appels, vue, racine, lancer } = temoins();
    await importerProjet(o, t, new File([await paquetSain("99.0.0") as BlobPart], "projet.attic"));
    expect(appels).toEqual([]);
    expect([...o.cacheExec.current.keys()]).toEqual(["ancien"]);
    expect([o.vueAPoserRef.current, o.grapheRacineRef.current]).toEqual([vue, racine]);
    expect(lancer).not.toHaveBeenCalled();
    expect(alertes).toEqual([`REFUS:ATTIC 99.0.0 > ${VERSION_APPLICATION}`]);
  });
});

describe("un paquet sain s'ouvre avec son cache", () => {
  it("LE PROJET EST POSÉ SANS FICHIER COURANT, SES MÉDIAS SUR LES NŒUDS, SON CACHE AU MOTEUR, ET LA REPOSE DEMANDÉE", async () => {
    const { o, lancer } = temoins();
    // LE PONT CONNAÎT LE CHEMIN DU FICHIER, sans quoi « sans fichier courant » ne se distinguerait pas
    // d'un chemin inconnu : les deux posent `null`.
    vi.stubGlobal("window", { api: { cheminFichier: () => "C:/p/projet.attic" } });
    await importerProjet(o, t, new File([await paquetSain() as BlobPart], "projet.attic"));
    expect((o.setCurrentFilePath as unknown as { mock: { calls: unknown[][] } }).mock.calls).toEqual([[null]]);
    const noeuds = (o.setNodes as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { id: string; data: Record<string, unknown> }[];
    expect(noeuds.map((n) => n.id)).toEqual(["a", "b"]);
    expect(noeuds[0].data.audioFichier).toBeInstanceOf(File);
    expect(String(noeuds[0].data.audioUrl)).toMatch(/^blob:/);
    expect(noeuds[1].data.audioFichier).toBeUndefined();
    expect([...o.cacheExec.current.keys()], "l'ancien graphe est oublié, le paquet le remplace").toEqual(["a"]);
    expect((o.cacheExec.current.get("a") as { valeurs: unknown[] }).valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(lancer).toHaveBeenCalledWith(undefined, { cacheSeulement: true, attendre: ["a", "b"] });
  });

  it("UN PAQUET D'UN ATTIC PLUS ANCIEN S'OUVRE AVEC SON CACHE, et le rapport est celui de la même version", async () => {
    // LE REGISTRE EST VIDE : le rapport de chargement dit des fiches inconnues dans les deux cas, et
    // c'est ce qui permet de voir qu'il ne dit rien de plus pour un paquet ancien.
    await importerProjet(temoins().o, t, new File([await paquetSain() as BlobPart], "projet.attic"));
    const memeVersion = alertes.splice(0);
    const { o, lancer } = temoins();
    await importerProjet(o, t, new File([await paquetSain("0.0.1") as BlobPart], "projet.attic"));
    expect([...o.cacheExec.current.keys()]).toEqual(["a"]);
    expect(lancer).toHaveBeenCalledWith(undefined, { cacheSeulement: true, attendre: ["a", "b"] });
    expect(alertes).toEqual(memeVersion);
  });

  it("LE CONTENU DÉCIDE ET NON L'EXTENSION : un paquet nommé .json reste un paquet", async () => {
    const { o, lancer } = temoins();
    await importerProjet(o, t, new File([await paquetSain() as BlobPart], "projet.json"));
    expect(o.cacheExec.current.has("a")).toBe(true);
    expect(lancer).toHaveBeenCalledTimes(1);
  });
});

describe("un .json s'ouvre comme avant", () => {
  it("SANS CACHE NI REPOSE, et son fichier courant posé avant l'analyse, comme avant", async () => {
    const { o, appels, lancer } = temoins();
    vi.stubGlobal("window", { api: { cheminFichier: () => "C:/p/projet.attic" } });
    await importerProjet(o, t, new File([PROJET], "projet.attic"));
    expect(appels.slice(0, 2)).toEqual(["setCurrentFilePath", "setPile"]);
    expect(o.setCurrentFilePath).toHaveBeenCalledWith("C:/p/projet.attic");
    expect(o.cacheExec.current.size).toBe(0);
    expect(lancer).not.toHaveBeenCalled();
  });

  it("UN JSON ILLISIBLE POSE ENCORE LE FICHIER COURANT AVANT L'ANALYSE, comme avant, et n'ouvre rien", async () => {
    const { o, appels } = temoins();
    await importerProjet(o, t, new File(["{pas du json"], "casse.json"));
    expect(appels).toEqual(["setCurrentFilePath"]);
    expect(alertes).toEqual(["persistance.importInvalide"]);
  });
});
