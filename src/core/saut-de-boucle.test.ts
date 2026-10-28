// core/saut-de-boucle.test.ts — Quand le corps d'une boucle se saute, et quand il doit se refaire.
//
// LE CAS DE FABIEN EST LE PREMIER : une boucle terminée, un point d'écoute posé après sa fin. Les
// suivants sont les raisons de NE PAS sauter, une par une : sauter à tort servirait un son périmé en
// silence, ce qui est pire que de recalculer.
import { describe, expect, it } from "vitest";
import { FICHE_DEBUT, FICHE_FIN, deplierBoucles } from "./boucle-graphe";
import { empreinteEntrees, empreinteParametres, empreinteSorties } from "./graphe";
import type { AreteG, NoeudG } from "./meta";
import {
  empreinteDeBoucle, lacherLeCorps, peutSauterLaBoucle, sautsDeBoucles, type CacheDeFin, type MoteurDuRun,
} from "./saut-de-boucle";

const n = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG =>
  ({ id, position: { x: 0, y: 0 }, data: { ficheId, parametres } });
const a = (id: string, source: string, target: string, si = 0, ti = 0): AreteG =>
  ({ id, source, target, sourceHandle: `out:${si}`, targetHandle: `in:${ti}` });

const REGLAGES = "{\"frequenceDeTravail\":44100}";

/** Source → début (deux tours) → transposeur → fin → point d'écoute, et le moteur d'un run. */
function monter(o: { sortieDuCorps?: boolean; valeur?: unknown; transposition?: number } = {}) {
  const noeuds = [
    n("src", "generateur-frequence", { Fréquence: 440 }), n("d", FICHE_DEBUT, { Tours: 2 }),
    n("tr", "transposition", { Demitons: o.transposition ?? 1 }), n("f", FICHE_FIN), n("ec", "point-ecoute"),
    ...(o.sortieDuCorps ? [n("vu", "oscilloscope")] : []),
  ];
  const aretes = [
    a("e1", "src", "d"), a("e2", "d", "tr"), a("e3", "tr", "f"), a("e4", "f", "ec"),
    ...(o.sortieDuCorps ? [a("e5", "tr", "vu")] : []),
  ];
  const r = deplierBoucles(noeuds, aretes);
  const cache = new Map<string, CacheDeFin>();
  const jamais = new Set<string>();
  const m: MoteurDuRun = {
    noeuds: r.noeuds, aretes: r.aretes, cache, reglages: REGLAGES, toursDesCopies: r.toursDesCopies,
    resultats: new Map<string, unknown[]>([["src", [o.valeur ?? "un son de 2 s"]]]),
    jamaisCache: (id) => jamais.has(id),
  };
  const boucle = r.depliees[0];
  return { r, m, cache, jamais, boucle };
}

/** Ce que le moteur range quand la fin a tourné, empreinte de sa boucle comprise. */
function finAyantTourne(x: ReturnType<typeof monter>, o: { consulteSorties?: boolean } = {}): CacheDeFin {
  const fin = x.r.noeuds.find((nd) => nd.id === "f")!;
  return {
    hashParams: empreinteParametres(fin.data as Record<string, unknown>) + REGLAGES,
    hashEntree: empreinteEntrees("f", x.r.aretes), hashSorties: empreinteSorties("f", x.r.aretes),
    hashValeursEntree: "copies lâchées depuis", consulteSorties: o.consulteSorties,
    empreinteBoucle: empreinteDeBoucle(x.boucle, x.m)!,
  };
}

describe("le dépliage dit la fin et le corps de chaque boucle", () => {
  it("la fin qui la referme, et ses copies dans le graphe rendu", () => {
    const { boucle } = monter();
    expect(boucle.finId).toBe("f");
    expect([...boucle.copies].sort()).toEqual(["d#0::tr", "d#1::tr"]);
  });

  it("UNE BOUCLE INTÉRIEURE N'A PAS DE CORPS À ELLE : l'extérieure a recopié ses copies", () => {
    const r = deplierBoucles(
      [n("s", "x"), n("D", FICHE_DEBUT, { Tours: 2 }), n("d", FICHE_DEBUT, { Tours: 2 }), n("t", "y"),
        n("f", FICHE_FIN), n("F", FICHE_FIN)],
      [a("1", "s", "D"), a("2", "D", "d"), a("3", "d", "t"), a("4", "t", "f"), a("5", "f", "F")],
    );
    const interieure = r.depliees.find((d) => d.debutId === "d")!;
    const exterieure = r.depliees.find((d) => d.debutId === "D")!;
    expect(interieure.copies).toEqual([]);
    expect(exterieure.copies.length).toBe(6);
    expect(exterieure.copies.every((c) => c.startsWith("D#"))).toBe(true);
  });
});

describe("le saut d'une boucle", () => {
  it("UNE BOUCLE INCHANGÉE SE SAUTE : c'est le point d'écoute posé après sa fin", () => {
    const x = monter();
    x.cache.set("f", finAyantTourne(x));
    expect(peutSauterLaBoucle(x.boucle, x.m, new Set())).toBe(true);
  });

  it("un réglage du corps changé la fait recalculer", () => {
    const avant = monter();
    const apres = monter({ transposition: 3 });
    apres.cache.set("f", finAyantTourne(avant));
    expect(peutSauterLaBoucle(apres.boucle, apres.m, new Set())).toBe(false);
  });

  it("une valeur venue du dehors qui change de forme la fait recalculer", () => {
    const avant = monter();
    const apres = monter({ valeur: "un son de 3 s" });
    apres.cache.set("f", finAyantTourne(avant));
    expect(peutSauterLaBoucle(apres.boucle, apres.m, new Set())).toBe(false);
  });

  it("UNE SOURCE DU DEHORS QUI VIENT DE TOURNER la fait recalculer : une forme ne dit pas un contenu", () => {
    const x = monter();
    x.cache.set("f", finAyantTourne(x));
    expect(peutSauterLaBoucle(x.boucle, x.m, new Set(["src"]))).toBe(false);
  });

  it("une source du dehors pas encore calculée empêche de décider, donc de sauter", () => {
    const x = monter();
    x.cache.set("f", finAyantTourne(x));
    (x.m.resultats as Map<string, unknown[]>).delete("src");
    expect(empreinteDeBoucle(x.boucle, x.m)).toBeNull();
    expect(peutSauterLaBoucle(x.boucle, x.m, new Set())).toBe(false);
  });

  it("UN CÂBLE QUI SORT DU CORPS AILLEURS QUE PAR LA FIN interdit le saut : son destinataire attend une copie", () => {
    const x = monter({ sortieDuCorps: true });
    x.cache.set("f", finAyantTourne(x));
    expect(x.boucle.sortiesVersDehors).toBe(1);
    expect(peutSauterLaBoucle(x.boucle, x.m, new Set())).toBe(false);
  });

  it("un nœud du corps qui refuse le cache interdit le saut", () => {
    const x = monter();
    x.cache.set("f", finAyantTourne(x));
    x.jamais.add("d#1::tr");
    expect(peutSauterLaBoucle(x.boucle, x.m, new Set())).toBe(false);
  });

  it("une fin qui n'a jamais rangé d'empreinte ne se reprend pas", () => {
    const x = monter();
    x.cache.set("f", { ...finAyantTourne(x), empreinteBoucle: undefined });
    expect(peutSauterLaBoucle(x.boucle, x.m, new Set())).toBe(false);
  });

  it("une fin qui a consulté son câblage aval se refait quand il change", () => {
    const x = monter();
    x.cache.set("f", { ...finAyantTourne(x, { consulteSorties: true }), hashSorties: "un autre câblage" });
    expect(peutSauterLaBoucle(x.boucle, x.m, new Set())).toBe(false);
    // Le même changement, sur une fin qui n'a rien demandé, ne la périme pas.
    x.cache.set("f", { ...finAyantTourne(x), hashSorties: "un autre câblage" });
    expect(peutSauterLaBoucle(x.boucle, x.m, new Set())).toBe(true);
  });
});

describe("les sauts d'un run", () => {
  it("décidés au premier passage dans le corps, ils reprennent ensuite la fin", () => {
    const x = monter();
    x.cache.set("f", finAyantTourne(x));
    const s = sautsDeBoucles(x.r.depliees, x.m);
    expect(s.finReprise("f"), "rien n'est décidé avant le corps").toBe(false);
    expect(s.copieSautee("src", new Set())).toBe(false);
    expect(s.copieSautee("d#0::tr", new Set())).toBe(true);
    expect(s.copieSautee("d#1::tr", new Set())).toBe(true);
    expect(s.finReprise("f")).toBe(true);
    expect(s.empreintePour("f")).toBe(finAyantTourne(x).empreinteBoucle);
    expect(s.empreintePour("ec"), "un nœud qui ne ferme aucune boucle n'a pas d'empreinte de boucle").toBeUndefined();
  });
});

describe("le corps lâché en fin de run", () => {
  it("se lâche sous l'économie de mémoire, et reste sans elle", () => {
    const avec = new Map<string, unknown>([["d#0::tr", 1], ["f", 2]]);
    lacherLeCorps(["d#0::tr"], avec, true);
    expect([...avec.keys()]).toEqual(["f"]);
    const sans = new Map<string, unknown>([["d#0::tr", 1], ["f", 2]]);
    lacherLeCorps(["d#0::tr"], sans, false);
    expect([...sans.keys()]).toEqual(["d#0::tr", "f"]);
  });
});
