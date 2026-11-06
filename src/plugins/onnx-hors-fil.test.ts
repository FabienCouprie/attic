// plugins/onnx-hors-fil.test.ts — L'attente d'une inférence hors du fil, et ce qui l'interrompt.
//
// TROIS ISSUES, ET AUCUNE NE DOIT LAISSER UN NŒUD EN COURS. La réponse arrive : la promesse se
// règle sur elle, et sur elle seule, l'ouvrier restant prêt pour la suivante. L'arrêt est demandé,
// par le signal ou par un `onProgress` qui lève : l'ouvrier est terminé, car une inférence ne
// s'interrompt pas de l'extérieur, et le suivant repart à neuf. L'ouvrier meurt : la demande en vol
// échoue avec la raison du garde au lieu d'attendre toujours.
//
// UN FAUX `Worker` tient la place du vrai : il note ce qu'on lui poste et s'il a été terminé.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estAnnulation } from "../core/annulation";
import type { DemandeGtcrn } from "../audio/inference-onnx";

class FauxWorker extends EventTarget {
  static crees: FauxWorker[] = [];
  postes: { requestId: string; [k: string]: unknown }[] = [];
  termine = false;
  constructor() { super(); FauxWorker.crees.push(this); }
  postMessage(m: { requestId: string }) { this.postes.push(m); }
  terminate() { this.termine = true; }
  repondre(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data })); }
}

const DEMANDE: DemandeGtcrn = {
  type: "debruiter-gtcrn", cle: "gtcrn", modele: new ArrayBuffer(8), signal: new Float32Array(4), force: 1,
};

/** Laisse le client poster sa demande, ce qu'il fait après un tour de promesse. */
const attendre = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  FauxWorker.crees = [];
  vi.stubGlobal("Worker", FauxWorker);
  vi.resetModules();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("une inférence hors du fil", () => {
  it("SE RÈGLE SUR SA RÉPONSE, et l'ouvrier sert la suivante sans renaître", async () => {
    const { inferer } = await import("./onnx-hors-fil");
    const p = inferer<Float32Array>(DEMANDE);
    await attendre();
    const w = FauxWorker.crees[0];
    const id = w.postes[0].requestId;
    w.repondre({ type: "done", requestId: "une-autre", resultat: new Float32Array(1) });
    w.repondre({ type: "done", requestId: id, resultat: new Float32Array([1, 2]) });
    expect(Array.from(await p)).toEqual([1, 2]);
    expect(w.termine).toBe(false);

    const q = inferer<Float32Array>(DEMANDE);
    await attendre();
    expect(FauxWorker.crees, "un seul ouvrier pour deux demandes").toHaveLength(1);
    w.repondre({ type: "done", requestId: w.postes[1].requestId, resultat: new Float32Array(0) });
    await q;
  });

  it("L'ARRÊT PAR LE SIGNAL TERMINE L'OUVRIER, et la demande suivante en crée un neuf", async () => {
    const { inferer } = await import("./onnx-hors-fil");
    const arret = new AbortController();
    const p = inferer(DEMANDE, { signal: arret.signal });
    await attendre();
    arret.abort();
    const raison = await p.catch((e) => e);
    expect(estAnnulation(raison), `rejetée par ${raison}`).toBe(true);
    expect(FauxWorker.crees[0].termine).toBe(true);

    void inferer(DEMANDE).catch(() => {});
    await attendre();
    expect(FauxWorker.crees).toHaveLength(2);
  });

  it("UN AVANCEMENT QUI LÈVE TERMINE L'OUVRIER et rejette par cette exception", async () => {
    const { inferer } = await import("./onnx-hors-fil");
    const p = inferer(DEMANDE, { surAvancement: () => { throw new Error("arrêt demandé"); } });
    await attendre();
    const w = FauxWorker.crees[0];
    w.repondre({ type: "progress", requestId: w.postes[0].requestId, avancement: 0.1 });
    await expect(p).rejects.toThrow("arrêt demandé");
    expect(w.termine).toBe(true);
  });

  it("UN OUVRIER QUI MEURT FAIT ÉCHOUER LA DEMANDE au lieu de la laisser attendre", async () => {
    const { inferer } = await import("./onnx-hors-fil");
    const p = inferer(DEMANDE);
    await attendre();
    // Un `Event` qui porte un message, `ErrorEvent` n'existant pas hors du navigateur.
    FauxWorker.crees[0].dispatchEvent(Object.assign(new Event("error"), { message: "wasm introuvable" }));
    await expect(p).rejects.toThrow("wasm introuvable");
  });
});
