// ui/budget-memoire.test.ts — Ce que le budget mémoire de `config.json` règle dans l'interface.
//
// LE PONT EST UN TÉMOIN : `globalThis.api.configuration` rend ce que le processus principal rendrait.
// Le chemin réel, du fichier lu au démarrage jusqu'à l'indicateur, est tenu dans Electron par
// `tests-e2e/budget-memoire-dans-electron.spec.ts`.
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oublierConfigurationRecue } from "./configuration";
import { apparenceMemoire, detailParProcessus } from "./memoire-vive";
import { configurerServicesApercu, facteurMemoireCourant, oublierServicesApercu, valeursLourdes } from "./services-apercu";
import {
  BUDGET_REFERENCE_GIO, PROFONDEUR_HISTORIQUE, alerteMemoire, budgetCourant, chargerLeBudget, memoireAuDela,
  oublierLeBudget, reglagesDuBudget,
} from "./budget-memoire";

const RACINE = resolve(__dirname, "../..");
const CONFIG = createRequire(import.meta.url)(join(RACINE, "electron", "configuration.cjs"));
const Gio = 1024 ** 3;

const pontAvec = (budgetMemoireGio: number, systeme = "windows") => vi.stubGlobal("api", {
  configuration: async () => ({ fichier: "lu", systeme, valeurs: { budgetMemoireGio }, sources: { budgetMemoireGio: "fichier" }, problemes: [] }),
});

beforeEach(() => { oublierConfigurationRecue(); oublierLeBudget(); });
afterEach(() => { vi.unstubAllGlobals(); oublierConfigurationRecue(); oublierLeBudget(); oublierServicesApercu(); });

describe("les réglages d'un budget", () => {
  it("LA MACHINE DE RÉFÉRENCE EST CELLE DU PROCESSUS PRINCIPAL, et 16 Gio sous Windows rendent le comportement d'avant", () => {
    expect(BUDGET_REFERENCE_GIO).toBe(CONFIG.BUDGET_REFERENCE_GIO);
    expect(reglagesDuBudget(16, "windows")).toEqual({ gio: 16, facteur: 1, profondeurHistorique: PROFONDEUR_HISTORIQUE, alerteOctets: Math.floor(12.8 * Gio) });
  });

  it("SOUS LINUX, LA PART UTILE EST PLUS ÉTROITE : 16 Gio y valent les trois quarts", () => {
    expect(reglagesDuBudget(16, "linux")).toMatchObject({ facteur: 0.75, profondeurHistorique: 38, alerteOctets: Math.floor(9.6 * Gio) });
  });

  it("LA PROFONDEUR SUIT LE FACTEUR, ENTRE 10 ET 200", () => {
    expect([2, 8, 63.7, 4096].map((g) => reglagesDuBudget(g, "windows").profondeurHistorique)).toEqual([10, 25, 199, 200]);
  });

  it("SANS BUDGET LISIBLE, LES RÉGLAGES D'AVANT ET AUCUNE ALERTE", () => {
    for (const g of [undefined, null, 0, -1, Number.NaN, "16"]) {
      expect(reglagesDuBudget(g), String(g)).toEqual({ gio: null, facteur: 1, profondeurHistorique: PROFONDEUR_HISTORIQUE, alerteOctets: null });
    }
    expect(memoireAuDela(1e15)).toBe(false);
  });
});

describe("le budget reçu du pont", () => {
  it("SANS LE PONT, RIEN NE CHANGE", async () => {
    await chargerLeBudget();
    expect(budgetCourant().gio).toBeNull();
    expect(facteurMemoireCourant()).toBe(1);
  });

  it("LE BUDGET REÇU POSE LE FACTEUR QUE LE SHELL TRANSMET AU DOMAINE", async () => {
    pontAvec(64);
    await chargerLeBudget();
    expect(budgetCourant()).toMatchObject({ gio: 64, facteur: 4, profondeurHistorique: 200 });
    expect(facteurMemoireCourant()).toBe(4);
    oublierLeBudget();
    expect(facteurMemoireCourant()).toBe(1);
  });

  it("LA QUESTION DU MOTEUR PORTE LE FACTEUR : un domaine témoin le reçoit", async () => {
    const recus: unknown[] = [];
    configurerServicesApercu({ apercuUtile: (_v, o) => { recus.push(o); return true; } });
    pontAvec(32);
    await chargerLeBudget();
    valeursLourdes([1]);
    expect(recus).toEqual([{ regarde: false, economie: true, facteurMemoire: 2 }]);
  });

  it("L'ALERTE DIT LA PART ET LE BUDGET, au-delà de la part utile seulement", async () => {
    pontAvec(16, "linux");
    await chargerLeBudget();
    const t = () => "PART {part} BUDGET {budget}";
    expect(alerteMemoire(9 * Gio, t)).toBeNull();
    expect(alerteMemoire(10 * Gio, t)).toBe("PART 60 BUDGET 16");
    // L'INDICATEUR DE LA BARRE, par `ui/memoire-vive.ts` : rouge et dit au-delà, inchangé en deçà.
    const tt = (cle: string) => (cle === "barre.memoire.alerte" ? t() : cle);
    expect(apparenceMemoire({ total: 9 * Gio, parType: [{ type: "GPU", octets: 9 * Gio }] }, tt)).toEqual({
      className: "attic-memoire", style: undefined, title: `barre.memoire.titre\n${detailParProcessus({ total: 9 * Gio, parType: [{ type: "GPU", octets: 9 * Gio }] })}`,
    });
    const au = apparenceMemoire({ total: 10 * Gio, parType: [] }, tt);
    expect(au).toMatchObject({ className: "attic-memoire attic-memoire-alerte", style: { color: "var(--arret)" }, title: "barre.memoire.titre\nPART 60 BUDGET 16" });
  });
});
