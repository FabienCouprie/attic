// src/workers/servir-par-demande.test.ts — Le dialogue des calculs asynchrones : une demande à la fois.
//
// LA RÈGLE QUI COMPTE est l'ordre. Une session onnxruntime ne se lance pas deux fois de front : une
// seconde demande arrivée pendant la première doit attendre qu'elle ait répondu, et le dialogue qui
// la servirait aussitôt ferait se croiser deux `session.run` sur la même session.
//
// LE FAUX `self` capte ce que le worker poste, comme pour les deux autres dialogues.
import { afterEach, describe, expect, it, vi } from "vitest";
import { servirParDemande } from "./servir-par-demande";

interface Envoi { message: { type: string; requestId?: string; [k: string]: unknown }; transfert: unknown }

function fauxSelf() {
  const envois: Envoi[] = [];
  const s = {
    onmessage: null as null | ((e: { data: unknown }) => void),
    postMessage: (message: Envoi["message"], transfert?: unknown) => { envois.push({ message, transfert }); },
  };
  vi.stubGlobal("self", s);
  return { s, envois };
}

/** Laisse passer les tours de microtâches qu'il faut au dialogue pour répondre. */
const attendre = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { vi.unstubAllGlobals(); });

describe("le dialogue des calculs asynchrones", () => {
  it("UNE DEMANDE ARRIVÉE PENDANT UNE AUTRE ATTEND QU'ELLE AIT RÉPONDU", async () => {
    const { s, envois } = fauxSelf();
    const journal: string[] = [];
    let libererLaPremiere!: () => void;
    const premiere = new Promise<void>((r) => { libererLaPremiere = r; });
    servirParDemande<{ nom: string }, string>(async (d) => {
      journal.push(`début ${d.nom}`);
      if (d.nom === "a") await premiere;
      journal.push(`fin ${d.nom}`);
      return d.nom;
    });
    s.onmessage!({ data: { requestId: "1", nom: "a" } });
    s.onmessage!({ data: { requestId: "2", nom: "b" } });
    await attendre();
    expect(journal, "la seconde a commencé avant que la première ait fini").toEqual(["début a"]);
    libererLaPremiere();
    await attendre();
    expect(journal).toEqual(["début a", "fin a", "début b", "fin b"]);
    expect(envois.map((e) => [e.message.type, e.message.requestId, e.message.resultat]))
      .toEqual([["done", "1", "a"], ["done", "2", "b"]]);
  });

  it("l'avancement porte l'identifiant de la demande, et la réponse transfère ses tableaux", async () => {
    const { s, envois } = fauxSelf();
    servirParDemande<object, { voix: Float32Array[] }>(async (_d, avancement) => {
      avancement(0.5);
      return { voix: [new Float32Array(4), new Float32Array(4)] };
    });
    s.onmessage!({ data: { requestId: "x" } });
    await attendre();
    expect(envois[0].message).toEqual({ type: "progress", requestId: "x", avancement: 0.5 });
    const fin = envois[1];
    const voix = (fin.message.resultat as { voix: Float32Array[] }).voix;
    expect(fin.transfert).toEqual([voix[0].buffer, voix[1].buffer]);
  });

  it("UNE EXCEPTION DEVIENT UNE RÉPONSE D'ERREUR, et la demande suivante est servie", async () => {
    const { s, envois } = fauxSelf();
    servirParDemande<{ casse: boolean }, number>(async (d) => {
      if (d.casse) throw new Error("modèle illisible");
      return 7;
    });
    s.onmessage!({ data: { requestId: "1", casse: true } });
    s.onmessage!({ data: { requestId: "2", casse: false } });
    await attendre();
    expect(envois.map((e) => e.message)).toEqual([
      { type: "error", requestId: "1", msg: "modèle illisible" },
      { type: "done", requestId: "2", resultat: 7 },
    ]);
  });
});
