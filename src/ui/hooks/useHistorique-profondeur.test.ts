// @vitest-environment jsdom
// ui/hooks/useHistorique-profondeur.test.ts — La profondeur de Ctrl+Z suit le budget mémoire de
// `config.json` (pièce C2 du fichier de configuration).
//
// LE CROCHET EST RENDU, et non sa règle seule : `ui/historique.ts` a ses cas, et c'est le fil entre
// le budget reçu et la pile que celui-ci tient. Soixante-dix actions, puis autant de Ctrl+Z qu'il en
// faut pour vider la pile : chacun qui défait quelque chose pose des nœuds.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { oublierConfigurationRecue } from "../configuration";
import { chargerLeBudget, oublierLeBudget } from "../budget-memoire";
import { useHistorique } from "./useHistorique";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** Le nombre de Ctrl+Z qui défont quelque chose, après `actions` actions. */
async function annulationsPossibles(actions: number): Promise<number> {
  const setNodes = vi.fn();
  let gestes: ReturnType<typeof useHistorique> | null = null;
  const Temoin = () => {
    gestes = useHistorique({
      noeudsRef: { current: [] }, aretesRef: { current: [] }, grapheRacineRef: { current: null }, envoyer: (() => []) as never,
      setNodes, setEdges: vi.fn(), setPile: vi.fn(), setSel: vi.fn(), setCurrentFilePath: vi.fn(),
      pile: [], currentFilePath: null, nodes: [],
    });
    return null;
  };
  const hote = document.createElement("div");
  const racine: Root = createRoot(hote);
  await act(async () => { racine.render(createElement(Temoin)); });
  for (let i = 0; i < actions; i++) gestes!.pushHistorique();
  for (let i = 0; i < actions + 5; i++) gestes!.undo();
  await act(async () => { racine.unmount(); });
  return setNodes.mock.calls.length;
}

const pontAvec = (budgetMemoireGio: number) => vi.stubGlobal("api", {
  configuration: async () => ({ fichier: "lu", systeme: "windows", valeurs: { budgetMemoireGio }, sources: {}, problemes: [] }),
});

beforeEach(() => { oublierConfigurationRecue(); oublierLeBudget(); });
afterEach(() => { vi.unstubAllGlobals(); oublierConfigurationRecue(); oublierLeBudget(); });

describe("la profondeur de l'historique suit le budget mémoire", () => {
  it("SANS BUDGET, CINQUANTE, comme avant", async () => {
    expect(await annulationsPossibles(70)).toBe(50);
  });

  it("SOUS 8 GIO, VINGT-CINQ ; SOUS 64 GIO, LES SOIXANTE-DIX", async () => {
    pontAvec(8);
    await chargerLeBudget();
    expect(await annulationsPossibles(70)).toBe(25);
    oublierConfigurationRecue();
    pontAvec(64);
    await chargerLeBudget();
    expect(await annulationsPossibles(70)).toBe(70);
  });
});
