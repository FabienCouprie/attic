// ui/hooks/useRepliBulles.test.ts — Le garde-fou qui décide s'il faut normaliser.
//
// LE DÉFAUT QU'IL EMPÊCHE EST ARRIVÉ, et il ne se voyait qu'à l'écran : une bulle de trois nœuds,
// développée, laissait ses membres visibles mais les jointures entre eux avaient disparu. Ni la
// compilation ni les tests du cœur ne pouvaient le dire — `appliquerRepli` faisait ce qu'il fallait,
// c'est l'effet qui ne l'appelait plus. Rapporté par Fabien.
import { describe, it, expect } from "vitest";
import { appliquerRepli, type AreteG, type NoeudG } from "../../core";
import { normalisationUtile } from "./useRepliBulles";

const def = () => ({ entrees: [{ nom: "E", type: "audio" }], sorties: [{ nom: "S", type: "audio" }] });

/** Trois nœuds en chaîne, les deux premiers dans une bulle repliée. */
const graphe = () => {
  const noeuds: NoeudG[] = [
    { id: "b1", data: { ficheId: "bulle::b1" } },
    { id: "a", data: { ficheId: "gain", bulle: "b1" } },
    { id: "b", data: { ficheId: "gain", bulle: "b1" } },
    { id: "c", data: { ficheId: "gain" } },
  ];
  const aretes: AreteG[] = [
    { id: "ab", source: "a", target: "b", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "bc", source: "b", target: "c", sourceHandle: "out:0", targetHandle: "in:0" },
  ];
  return { noeuds, aretes };
};

describe("faut-il normaliser ?", () => {
  it("un graphe sans bulle ni arête cachée ne demande rien", () => {
    expect(normalisationUtile(
      [{ data: { ficheId: "gain" } }],
      [{ id: "ab" }],
    )).toBe(false);
  });

  it("une bulle présente demande une passe", () => {
    expect(normalisationUtile([{ data: { ficheId: "bulle::b1" } }], [])).toBe(true);
  });

  it("un substitut restant demande une passe", () => {
    expect(normalisationUtile([{ data: { ficheId: "gain" } }], [{ id: "sub::ab" }])).toBe(true);
  });

  it("UNE ARÊTE CACHÉE SANS BULLE DEMANDE UNE PASSE : c'est le défaut signalé", () => {
    expect(normalisationUtile([{ data: { ficheId: "gain" } }], [{ id: "ab", hidden: true }])).toBe(true);
  });
});

describe("replier puis développer", () => {
  it("l'arête interne est cachée au repli", () => {
    const { noeuds, aretes } = graphe();
    const r = appliquerRepli(noeuds, aretes, def);
    expect(r.aretes.find((a) => a.id === "ab")?.hidden).toBe(true);
  });

  it("développer, puis normaliser, rend les jointures", () => {
    const { noeuds, aretes } = graphe();
    const replie = appliquerRepli(noeuds, aretes, def);

    // Ce que fait le geste « développer » : la bulle disparaît, ses membres remontent, et les
    // substituts qui la touchaient sont retirés. Il ne touche PAS aux arêtes internes.
    const apres = replie.noeuds
      .filter((n) => n.id !== "b1")
      .map((n) => {
        if ((n.data as { bulle?: string }).bulle !== "b1") return n;
        const data = { ...n.data } as Record<string, unknown>;
        delete data.bulle;
        delete data.cacheParBulle;
        return { ...n, hidden: false, data } as unknown as NoeudG;
      });
    const aretesApres = replie.aretes.filter((a) => a.source !== "b1" && a.target !== "b1");

    // Sans le garde-fou corrigé, l'effet ne serait pas rappelé ici : plus de bulle, plus de
    // substitut, et « ab » resterait cachée pour toujours.
    expect(aretesApres.find((a) => a.id === "ab")?.hidden).toBe(true);
    expect(normalisationUtile(apres, aretesApres)).toBe(true);

    const normalise = appliquerRepli(apres, aretesApres, def);
    expect(normalise.aretes.find((a) => a.id === "ab")?.hidden).toBe(false);
    expect(normalise.aretes.find((a) => a.id === "bc")?.hidden).toBe(false);
    expect(normalise.noeuds.every((n) => (n as { hidden?: boolean }).hidden !== true)).toBe(true);
  });
});
