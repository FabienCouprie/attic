// plugins/gout-hors-fil.test.ts — Les nœuds qui partent d'un goût ou d'une odeur ne mesurent rien
// sur le fil.
//
// POURQUOI CE TEST EXISTE. « Accord mets-musique » et « Parfum → motif » mesurent le son qu'ils
// viennent de rendre pour corriger le registre de leur motif, puis le mesurent encore pour le dire.
// La seconde mesure passait déjà par `gout-worker.ts` ; la première était un appel direct à
// `mesurer`, sur le fil. Mesuré au banc dans la page le 2026-11-08 : 2 785 et 816 ms de gel, pour
// 4 042 et 1 476 ms de calcul. Le test de respiration ne pouvait pas le voir : sans `Worker`, le
// repli de `parCanal` est un seul bloc lui aussi, et les deux cas y étaient exclus pour une raison
// fausse, un rendu hors ligne qu'ils ne font pas.
//
// L'INSTRUMENT. Un faux `Worker` tient la place du vrai et fait le calcul de `gout-worker.ts`,
// `mesurerVoie`, après un tour de boucle, comme un ouvrier qui répond. Les deux points d'entrée de
// la mesure, `mesurer` et `mesurerVoie`, sont espionnés : tout appel qui ne vient pas du faux
// ouvrier a eu lieu sur le fil, quel que soit le module qui l'a fait.
import "node-web-audio-api/polyfill.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registre } from "../audio/adaptateur";
import { defautCanoniqueChoix } from "../i18n";

type Calcul = (x: Float32Array, o: { sampleRate: number }) => unknown;
const sonde = vi.hoisted(() => ({
  surLeFil: [] as string[], dansOuvrier: 0, calcul: null as Calcul | null,
}));

vi.mock("../audio/gout", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("../audio/gout")>();
  sonde.calcul = vrai.mesurerVoie as Calcul;
  return {
    ...vrai,
    mesurer: (b: AudioBuffer) => { sonde.surLeFil.push("mesurer"); return vrai.mesurer(b); },
    mesurerVoie: (x: Float32Array, o: { sampleRate: number }) => {
      sonde.surLeFil.push("mesurerVoie");
      return vrai.mesurerVoie(x, o);
    },
  };
});

class FauxOuvrier extends EventTarget {
  static adresses: string[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(adresse: URL | string) { super(); FauxOuvrier.adresses.push(String(adresse)); }
  postMessage(d: { requestId?: unknown; voies: Float32Array[]; sampleRate: number }) {
    setTimeout(() => {
      const resultats = d.voies.map((v) => sonde.calcul!(v, { sampleRate: d.sampleRate }));
      sonde.dansOuvrier += d.voies.length;
      const data = { type: "done", requestId: d.requestId, resultats };
      const e = new MessageEvent("message", { data });
      this.dispatchEvent(e);
      this.onmessage?.(e);
    }, 0);
  }
  terminate() {}
}

beforeEach(() => {
  sonde.surLeFil = [];
  sonde.dansOuvrier = 0;
  FauxOuvrier.adresses = [];
  vi.stubGlobal("Worker", FauxOuvrier);
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Le nœud, à ses réglages par défaut : ce qu'il fait quand on le pose et qu'on l'exécute. */
async function executer(id: string): Promise<{ valeurs?: unknown[] }> {
  const def = registre.trouverDef(id) as never as {
    parametres?: { nom: string; type?: string; defaut?: unknown }[];
    entrees?: unknown[];
    executer: (ctx: unknown) => Promise<{ valeurs?: unknown[] }>;
  };
  expect(def, id).toBeTruthy();
  const params: Record<string, unknown> = {};
  for (const p of def.parametres ?? []) {
    params[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p as never) : p.defaut;
  }
  const ctx = {
    noeud: { id: "t", data: { parametres: params } }, runtime: null, repertoireTravail: "",
    entree: () => null, entrees: () => (def.entrees ?? []).map(() => null),
    paramNombre: (n: string, d: number) => (typeof params[n] === "number" ? params[n] as number : d),
    paramTexte: (n: string, d: string) => (typeof params[n] === "string" ? params[n] as string : d),
    onProgress: () => {}, signal: new AbortController().signal,
  };
  return def.executer(ctx);
}

describe("la mesure de goût des nœuds crossmodaux", () => {
  for (const id of ["accord-mets-musique", "parfum-motif"]) {
    it(`${id} NE MESURE RIEN SUR LE FIL, ni pour corriger son registre ni pour le dire`, async () => {
      const r = await executer(id);
      expect(r.valeurs?.[0], `${id} doit rendre un son`).toBeInstanceOf(AudioBuffer);
      expect(sonde.surLeFil, `${id} a mesuré un goût sur le fil de l'interface`).toEqual([]);
      // Deux mesures au moins : celle qui corrige le registre, puis celle que le nœud affiche.
      expect(sonde.dansOuvrier, `${id} : mesures faites par l'ouvrier`).toBeGreaterThanOrEqual(2);
      expect(FauxOuvrier.adresses.filter((a) => !a.endsWith("/gout-worker.ts")),
        `${id} a ouvert un autre ouvrier que celui du goût`).toEqual([]);
    }, 60_000);
  }
});
