// plugins/csound-entree-audio.test.ts — L'entrée Audio du nœud « Csound », et ce qu'il en dit.
//
// Fabien, le 2026-11-27 : « L'entrée son du node "CSOUND" sert-elle vraiment à quelque chose dans
// cette application ? ». Elle sert : un son branché est écrit dans le système de fichiers de Csound
// sous « entree1.wav », et `diskin2`, `soundin` ou une table GEN01 le rendent à l'identique, ce que
// `tests-e2e/csound-relit.spec.ts` mesure dans le navigateur. Mais deux messages la trahissaient :
//   - un son lu par la PARTITION, dans une table « f1 0 0 1 "entree1.wav" 0 0 0 », était dit « jamais
//     lu », l'avertissement ne cherchant que dans l'orchestre ;
//   - un orchestre qui lit « entree1.wav » sans son branché faisait refuser la note par Csound, qui
//     ne terminait plus la partition : le nœud accusait alors la partition après cinq tentatives.
//
// LE RENDU EST REMPLACÉ, comme dans `csound.test.ts` : ce qui se joue ici est ce que le nœud décide
// avant de rendre, et ce qu'il en dit.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctxDEssai } from "../core/contexte-essai";

const appels: string[] = [];

vi.mock("../audio/csound", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("../audio/csound")>();
  return {
    ...vrai,
    rendreCsd: async (csd: string) => {
      appels.push(csd);
      return {
        audio: new AudioBuffer({ numberOfChannels: 1, length: 1000, sampleRate: 16000 }),
        erreur: null, messages: ["rendu simule"], blocs: 100, ms: 12, crete: 0.5,
      };
    },
  };
});

const { fiches } = await import("./csound");
const csound = fiches.find((f) => f.id === "csound")!;

const son = () => new AudioBuffer({ numberOfChannels: 1, length: 16000, sampleRate: 16000 });
const instr = (...lignes: string[]) => ["instr 1", ...lignes, "endin"].join("\n");
const DISKIN = instr("  a1 diskin2 \"entree1.wav\", 1", "  out a1");
const LOSCIL = instr("  a1 loscil 0.5, 1, 1, 1, 0", "  out a1");
const TABLE = "f1 0 0 1 \"entree1.wav\" 0 0 0\ni1 0 1";

async function lancer(entrees: unknown[], reglages: Record<string, string>) {
  const r = await csound.executer(ctxDEssai(entrees, reglages) as never) as { valeurs: unknown[]; message: string; erreur?: boolean };
  return { ...r, rendus: appels.length };
}

beforeEach(() => { appels.length = 0; });

describe("un son lu par la partition n'est pas dit « jamais lu »", () => {
  it("UNE TABLE GEN01 DE LA PARTITION LIT LE SON", async () => {
    const r = await lancer([son(), null, null, null], { Orchestre: LOSCIL, Partition: TABLE });
    expect(r.message).not.toContain("jamais lu");
    expect(String(r.valeurs[1])).not.toContain("ne lit jamais");
  });

  it("et un son que ni l'orchestre ni la partition ne nomment reste signalé", async () => {
    const r = await lancer([son(), null, null, null], { Orchestre: instr("  out oscili:a(0.1, 440)"), Partition: "i1 0 1" });
    expect(r.message).toContain("« entree1.wav » n'est jamais lu");
  });
});

describe("un programme qui lit « entree1.wav » sans son branché est refusé, le fichier nommé", () => {
  it("L'ORCHESTRE LE LIT : refusé avant tout rendu", async () => {
    const r = await lancer([null, null, null, null], { Orchestre: DISKIN, Partition: "i1 0 1" });
    expect(r.erreur).toBe(true);
    expect(r.message).toContain("« entree1.wav »");
    expect(r.message).toContain("aucun son n'est branché");
    expect(r.valeurs).toHaveLength(2);
    expect(r.rendus).toBe(0);
  });

  it("LA PARTITION LE LIT, dans une table : refusé de même", async () => {
    const r = await lancer([null, null, null, null], { Orchestre: LOSCIL, Partition: TABLE });
    expect(r.erreur).toBe(true);
    expect(r.message).toContain("aucun son n'est branché");
  });

  it("un nom en commentaire ne compte pas, et sans le nommer le rendu a lieu", async () => {
    const r = await lancer([null, null, null, null], { Orchestre: instr("  ; a1 diskin2 \"entree1.wav\", 1", "  out oscili:a(0.1, 440)"), Partition: "i1 0 1" });
    expect(r.erreur).toBeUndefined();
    expect(r.rendus).toBe(1);
  });
});
