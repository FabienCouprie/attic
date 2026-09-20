// plugins/garde-worker.test.ts — Un worker qui meurt doit faire échouer les nœuds.
//
// CE QUI EST ÉPROUVÉ ICI n'est pas une forme mais un COMPORTEMENT : qu'une demande posée à un worker
// qui meurt ensuite reçoive bien une réponse. C'est le seul point qui compte — le défaut d'origine
// n'était pas une mauvaise réponse mais l'ABSENCE de réponse, et un nœud qui attend indéfiniment ne
// se signale nulle part.
//
// Le worker est un double : le garde-fou n'a besoin que de trois méthodes, et un vrai Worker
// n'existe pas sous Node. Le dialogue simulé est exactement celui des douze enveloppes d'Attic —
// écouteur filtrant sur `requestId`, message `done` ou `error`.
import { describe, expect, it, vi } from "vitest";
import { installerGardeWorker, type CibleWorker } from "./garde-worker";

class FauxWorker implements CibleWorker {
  ecouteurs = new Map<string, ((e: any) => void)[]>();
  postes: { message: any; transfert?: any }[] = [];

  addEventListener(type: string, f: (e: any) => void) {
    if (!this.ecouteurs.has(type)) this.ecouteurs.set(type, []);
    this.ecouteurs.get(type)!.push(f);
  }
  dispatchEvent(e: any): boolean {
    for (const f of [...(this.ecouteurs.get(e.type) ?? [])]) f(e);
    return true;
  }
  postMessage(message: any, transfert?: any) { this.postes.push({ message, transfert }); }
  retirerEcouteur(type: string, f: (e: any) => void) {
    const l = this.ecouteurs.get(type);
    if (l) this.ecouteurs.set(type, l.filter((x) => x !== f));
  }

  /** Le worker meurt : c'est l'événement que le navigateur émet, et que personne n'écoutait. */
  mourir(message = "Uncaught ReferenceError: window is not defined") {
    this.dispatchEvent({ type: "error", message });
  }
  /** Le worker répond. */
  repondre(donnees: any) { this.dispatchEvent({ type: "message", data: donnees }); }
}

/**
 * Une demande, écrite comme les douze enveloppes l'écrivent : on résout sur `done` comme sur `error`,
 * et jamais autrement. Si le garde-fou ne dit rien, la promesse ne se règle pas — et c'est ce que le
 * nœud vivait.
 */
function demander(w: FauxWorker, requestId?: string) {
  let regle = false;
  const promesse = new Promise<any>((resolve) => {
    const onMessage = (e: any) => {
      const msg = e.data;
      if (requestId !== undefined && msg.requestId !== requestId) return;
      if (msg.type === "progress") return;
      w.retirerEcouteur("message", onMessage);
      regle = true;
      resolve(msg);
    };
    w.addEventListener("message", onMessage);
    w.postMessage(requestId === undefined ? { texte: "bonjour" } : { texte: "bonjour", requestId });
  });
  return { promesse, estReglee: () => regle };
}

describe("le garde-fou d'un worker", () => {
  it("répond à la demande en vol quand le worker meurt, au lieu de la laisser attendre", async () => {
    const w = installerGardeWorker(new FauxWorker());
    const d = demander(w, "r1");
    expect(d.estReglee()).toBe(false);
    w.mourir();
    const msg = await d.promesse;
    expect(msg.type).toBe("error");
    expect(msg.requestId).toBe("r1");
    expect(msg.msg).toContain("window is not defined");
  });

  it("répond à TOUTES les demandes en vol, chacune sur son identifiant", async () => {
    const w = installerGardeWorker(new FauxWorker());
    const a = demander(w, "r1"), b = demander(w, "r2"), c = demander(w, "r3");
    w.mourir("mort subite");
    const rep = await Promise.all([a.promesse, b.promesse, c.promesse]);
    expect(rep.map((m) => m.requestId)).toEqual(["r1", "r2", "r3"]);
    for (const m of rep) expect(m.type).toBe("error");
  });

  it("sert aussi les appelants qui ne numérotent pas leurs demandes", async () => {
    // La traduction OPUS-MT n'emploie pas de `requestId` : un worker, une demande.
    const w = installerGardeWorker(new FauxWorker());
    const d = demander(w);
    w.mourir("mort");
    expect((await d.promesse).type).toBe("error");
  });

  it("porte la raison sous les DEUX noms employés dans Attic", async () => {
    // Douze enveloppes lisent `msg.msg`, Sherpa lit `msg.error` : le garde-fou ne doit pas dépendre
    // du vocabulaire de celui qu'il protège.
    const w = installerGardeWorker(new FauxWorker());
    const d = demander(w, "r1");
    w.mourir("la raison");
    const msg = await d.promesse;
    expect(msg.msg).toBe("la raison");
    expect(msg.error).toBe("la raison");
  });

  it("ne réveille pas une demande DÉJÀ répondue", async () => {
    const w = installerGardeWorker(new FauxWorker());
    // Un témoin posé pour de bon : il voit TOUT ce qui circule, y compris ce que le garde-fou émet.
    const vus: any[] = [];
    w.addEventListener("message", (e: any) => vus.push(e.data));

    const a = demander(w, "r1"), b = demander(w, "r2");
    w.repondre({ requestId: "r1", type: "done", texte: "fini" });
    expect((await a.promesse).type).toBe("done");

    w.mourir("mort après coup");
    // « r2 » est servie, « r1 » ne l'est pas : elle avait déjà sa réponse.
    expect((await b.promesse).type).toBe("error");
    const erreurs = vus.filter((m) => m.type === "error").map((m) => m.requestId);
    expect(erreurs).toEqual(["r2"]);
  });

  it("laisse passer les messages d'avancement sans clore la demande", async () => {
    const w = installerGardeWorker(new FauxWorker());
    const d = demander(w, "r1");
    w.repondre({ requestId: "r1", type: "progress", msg: "chargement…" });
    expect(d.estReglee()).toBe(false);
    w.mourir();
    expect((await d.promesse).type).toBe("error");
  });

  it("prévient l'appelant, pour qu'il oublie le worker mort", () => {
    const oublier = vi.fn();
    const w = installerGardeWorker(new FauxWorker(), oublier);
    w.mourir("fini");
    expect(oublier).toHaveBeenCalledTimes(1);
    expect(oublier.mock.calls[0][0]).toBe("fini");
  });

  it("réagit aussi à un message illisible", async () => {
    const w = installerGardeWorker(new FauxWorker());
    const d = demander(w, "r1");
    w.dispatchEvent({ type: "messageerror" });
    expect((await d.promesse).msg).toContain("illisible");
  });

  it("ne change rien à l'envoi : message et liste de transfert passent intacts", () => {
    const w = installerGardeWorker(new FauxWorker());
    const octets = new Uint8Array([1, 2, 3]).buffer;
    w.postMessage({ type: "go", requestId: "r1" }, [octets]);
    expect(w.postes).toEqual([{ message: { type: "go", requestId: "r1" }, transfert: [octets] }]);
    w.postMessage({ type: "go2" });
    expect(w.postes[1]).toEqual({ message: { type: "go2" }, transfert: undefined });
  });
});
