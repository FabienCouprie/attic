// @vitest-environment jsdom
// ui/ecriture-projet.test.ts — Chaque chemin de la cascade qui choisit où un projet s'écrit.
//
// LA CASCADE VIVAIT DANS `sauvegarder`, au milieu d'un crochet : aucun test ne la parcourait, et ses
// chemins ne s'éprouvaient que dans l'application, un par épreuve. Sortie dans `ui/ecriture-projet.ts`
// avec un pont prêté, elle se parcourt ici entière, avec un pont témoin qui note ce qu'on lui
// demande et répond ce que chaque cas veut : un dialogue accepté ou fermé, une écriture acceptée ou
// refusée, un pont sans écriture directe.
//
// CE QUE CHAQUE CAS EXIGE : les appels au pont, dans leur ordre et avec leurs arguments, l'alerte,
// et ce que la cascade rend. C'est ce que `sauvegarder` lit ensuite pour poser le fichier courant,
// écrire l'en-cours ou s'arrêter avant.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ecrireParLePont, telechargerProjet, type DemandeEcriture } from "./ecriture-projet";

const FILTRES = [{ name: "Workflow Attic", extensions: ["json"] }];
const JSON_PROJET = '{"formatVersion":3,"nodes":[]}';
const NOM_DU_JOUR = "attic-2026-11-09.json";

type Appel = [string, ...unknown[]];

/** Un pont témoin : il note chaque appel et rend, dans l'ordre, les réponses qu'on lui donne. */
function pont(reponses: { dialogue?: (string | undefined)[]; ecriture?: unknown[]; dossier?: string | undefined },
  sans: { ecriture?: boolean; dossier?: boolean } = {}) {
  const appels: Appel[] = [];
  const dialogues = [...(reponses.dialogue ?? [])];
  const ecritures = [...(reponses.ecriture ?? [])];
  const api: Record<string, unknown> = {
    sauvegarderFichier: async (o: unknown) => { appels.push(["sauvegarderFichier", o]); return dialogues.shift(); },
  };
  if (!sans.ecriture) api.ecrireFichier = async (c: string, d: string) => { appels.push(["ecrireFichier", c, d]); return ecritures.shift(); };
  if (!sans.dossier) api.obtenirRepertoireTravail = async () => { appels.push(["obtenirRepertoireTravail"]); return reponses.dossier; };
  return { api, appels };
}

const demande = (d: Partial<DemandeEcriture> = {}): DemandeEcriture => ({
  json: JSON_PROJET,
  currentFilePath: null,
  forceDialog: false,
  defaultName: d.currentFilePath ? undefined : NOM_DU_JOUR,
  repertoire: "",
  t: (cle) => (cle === "persistance.ecritureRefusee" ? "refusé : {chemin}" : cle),
  ...d,
});

let alertes: string[];
beforeEach(() => {
  alertes = [];
  vi.stubGlobal("alert", (m: string) => { alertes.push(m); });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("la cascade qui choisit où un projet s'écrit", () => {
  it("SANS FICHIER COURANT, LE DIALOGUE S'OUVRE DANS LE DOSSIER DE TRAVAIL, sous le nom du jour", async () => {
    const { api, appels } = pont({ dialogue: ["D:\\travail\\choisi.json"] });
    const issue = await ecrireParLePont(api, demande({ repertoire: "D:\\travail" }));
    expect(appels).toEqual([["sauvegarderFichier", { defaultPath: `D:\\travail\\${NOM_DU_JOUR}`, filters: FILTRES, data: JSON_PROJET }]]);
    expect(issue).toEqual({ abandon: false, chemin: "D:\\travail\\choisi.json" });
    expect(alertes).toEqual([]);
  });

  it("SANS DOSSIER RÉGLÉ, LE PONT DIT LE SIEN ; sans réponse, le nom du jour seul", async () => {
    const a = pont({ dialogue: ["E:\\w\\x.json"], dossier: "E:\\w" });
    await ecrireParLePont(a.api, demande());
    expect(a.appels).toEqual([
      ["obtenirRepertoireTravail"],
      ["sauvegarderFichier", { defaultPath: `E:\\w\\${NOM_DU_JOUR}`, filters: FILTRES, data: JSON_PROJET }],
    ]);
    const b = pont({ dialogue: ["x.json"], dossier: undefined });
    await ecrireParLePont(b.api, demande());
    expect(b.appels[1]).toEqual(["sauvegarderFichier", { defaultPath: NOM_DU_JOUR, filters: FILTRES, data: JSON_PROJET }]);
    // Un pont qui ne sait pas dire son dossier : la même chose, sans erreur.
    const c = pont({ dialogue: ["x.json"] }, { dossier: true });
    await ecrireParLePont(c.api, demande());
    expect(c.appels).toEqual([["sauvegarderFichier", { defaultPath: NOM_DU_JOUR, filters: FILTRES, data: JSON_PROJET }]]);
  });

  it("UN DIALOGUE FERMÉ REND UN CHEMIN VIDE, ET NON UN ABANDON : la sauvegarde écrit quand même l'en-cours", async () => {
    const { api } = pont({ dialogue: [undefined] });
    expect(await ecrireParLePont(api, demande({ repertoire: "D:\\travail" }))).toEqual({ abandon: false, chemin: undefined });
    expect(alertes).toEqual([]);
  });

  it("« ENREGISTRER SOUS » OUVRE LE DIALOGUE SUR LE FICHIER COURANT, sans écriture directe", async () => {
    const { api, appels } = pont({ dialogue: ["D:\\p\\copie.json"] });
    const issue = await ecrireParLePont(api, demande({ currentFilePath: "D:\\p\\projet.json", forceDialog: true, repertoire: "D:\\travail" }));
    expect(appels).toEqual([["sauvegarderFichier", { defaultPath: "D:\\p\\projet.json", filters: FILTRES, data: JSON_PROJET }]]);
    expect(issue).toEqual({ abandon: false, chemin: "D:\\p\\copie.json" });
  });

  it("UN FICHIER COURANT S'ÉCRIT DIRECTEMENT, sans dialogue", async () => {
    const { api, appels } = pont({ ecriture: [true] });
    const issue = await ecrireParLePont(api, demande({ currentFilePath: "D:\\p\\projet.json" }));
    expect(appels).toEqual([["ecrireFichier", "D:\\p\\projet.json", JSON_PROJET]]);
    expect(issue).toEqual({ abandon: false, chemin: "D:\\p\\projet.json" });
  });

  it("UN REFUS DU PONT OUVRE LE DIALOGUE PRÉREMPLI DU MÊME CHEMIN, et le chemin choisi est retenu", async () => {
    const { api, appels } = pont({ ecriture: [null], dialogue: ["D:\\p\\projet.json"] });
    const issue = await ecrireParLePont(api, demande({ currentFilePath: "D:\\p\\projet.json" }));
    expect(appels).toEqual([
      ["ecrireFichier", "D:\\p\\projet.json", JSON_PROJET],
      ["sauvegarderFichier", { defaultPath: "D:\\p\\projet.json", filters: FILTRES, data: JSON_PROJET }],
    ]);
    expect(issue).toEqual({ abandon: false, chemin: "D:\\p\\projet.json" });
    expect(alertes).toEqual([]);
  });

  it("UN REFUS DONT ON ANNULE LE DIALOGUE SE DIT, ET ABANDONNE : rien n'est tenu pour écrit", async () => {
    const { api, appels } = pont({ ecriture: [null], dialogue: [undefined] });
    const issue = await ecrireParLePont(api, demande({ currentFilePath: "D:\\p\\projet.json" }));
    expect(appels.map((a) => a[0])).toEqual(["ecrireFichier", "sauvegarderFichier"]);
    expect(issue).toEqual({ abandon: true });
    expect(alertes).toEqual(["refusé : D:\\p\\projet.json"]);
  });

  it("SANS ÉCRITURE DIRECTE, LE DIALOGUE S'OUVRE PRÉREMPLI DU FICHIER COURANT", async () => {
    const { api, appels } = pont({ dialogue: ["D:\\p\\projet.json"] }, { ecriture: true });
    const issue = await ecrireParLePont(api, demande({ currentFilePath: "D:\\p\\projet.json" }));
    expect(appels).toEqual([["sauvegarderFichier", { defaultPath: "D:\\p\\projet.json", filters: FILTRES, data: JSON_PROJET }]]);
    expect(issue).toEqual({ abandon: false, chemin: "D:\\p\\projet.json" });
  });

  it("LA CONSOLE DIT, COMME AVANT, SI LE PONT ÉCRIT DIRECTEMENT", async () => {
    const journal = vi.spyOn(console, "log").mockImplementation(() => {});
    await ecrireParLePont(pont({ ecriture: [true] }).api, demande({ currentFilePath: "D:\\p\\projet.json" }));
    await ecrireParLePont(pont({ dialogue: ["x"] }, { ecriture: true }).api, demande({ currentFilePath: "D:\\p\\projet.json" }));
    expect(journal.mock.calls).toEqual([
      ["[persistance] api available, ecrireFichier=", true],
      ["[persistance] api available, ecrireFichier=", false],
    ]);
  });
});

describe("le téléchargement du mode web", () => {
  it("TÉLÉCHARGE LE PROJET SOUS LE NOM DU JOUR, ou « attic.json » sans nom", () => {
    const liens: HTMLAnchorElement[] = [];
    const creer = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const e = creer(tag);
      if (tag === "a") { (e as HTMLAnchorElement).click = vi.fn(); liens.push(e as HTMLAnchorElement); }
      return e;
    });
    const contenus: Blob[] = [];
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL: (b: Blob) => { contenus.push(b); return "blob:projet"; } }));
    telechargerProjet(JSON_PROJET, NOM_DU_JOUR);
    telechargerProjet(JSON_PROJET, undefined);
    expect(liens.map((a) => a.download)).toEqual([NOM_DU_JOUR, "attic.json"]);
    expect(liens.map((a) => a.href)).toEqual(["blob:projet", "blob:projet"]);
    expect(liens.every((a) => (a.click as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 1)).toBe(true);
    expect(contenus.map((b) => b.type)).toEqual(["application/json", "application/json"]);
  });
});
