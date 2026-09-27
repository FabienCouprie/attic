// plugins/boucle-creneau.test.ts — Une boîte qui calcule sa valeur en connaissant sa place.
//
// CE QUI SE VÉRIFIE ICI EST LA SECONDE MOITIÉ DE LA MAQUETTE. Le nœud « Maquette » pose des
// séquences déjà calculées ; ici la chaîne est calculée UNE FOIS PAR CRÉNEAU, et elle connaît celui
// qu'elle remplit. Les deux preuves qui comptent : que le contenu reçoive bien sa place, donc qu'il
// puisse en dépendre, et que la fin plie ce qu'il rend à la largeur du créneau, sans quoi le créneau
// ne serait qu'une étiquette.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import type { Sequence } from "../audio/sequence";
import {
  FICHE_CRENEAU_DEBUT, FICHE_CRENEAU_FIN, planifierBoucle, planifierBoucles, publierBoucle,
} from "./boucleSequencesGlobal";
import { fiches as fichesCreneau } from "./boucle-creneau";
import { fiches as fichesArbre } from "./arbre-rythmique";
import { fiches as fichesFormule } from "./formule-sequence";

const debut = fichesCreneau.find((f) => f.id === FICHE_CRENEAU_DEBUT)!;
const fin = fichesCreneau.find((f) => f.id === FICHE_CRENEAU_FIN)!;
const rythme = fichesArbre.find((f) => f.id === "rythme-sur-hauteurs")!;
const formule = fichesFormule.find((f) => f.id === "formule-sequence")!;

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

/** Ce que le pilote fait, reproduit : une passe de découverte, puis les suivantes. */
async function mener(
  reglagesDebut: Record<string, string | number>,
  corps: (creneau: Sequence, passe: number) => Promise<Sequence> | Sequence,
  reglagesFin: Record<string, string | number> = {},
): Promise<{ sortie: Sequence | null; passes: number; creneaux: [number, number][] }> {
  const etat = { debutId: "n1", finsIds: ["n1"], index: 0, morceaux: [] as Sequence[], recoltes: [] as Sequence[] };
  publierBoucle(etat);
  const creneaux: [number, number][] = [];
  let sortie: Sequence | null = null;
  let passes = 0;
  try {
    for (;;) {
      const d = await debut.executer(contexte([], reglagesDebut) as any);
      const creneau = d.valeurs[0] as unknown as Sequence;
      const note = creneau.notes[0];
      creneaux.push([note.debut, note.fin - note.debut]);
      const produite = await corps(creneau, etat.index);
      const f = await fin.executer(contexte([produite], reglagesFin) as any);
      sortie = f.valeurs[0] as unknown as Sequence | null;
      passes++;
      if (etat.index >= etat.morceaux.length - 1) break;
      etat.index++;
    }
  } finally {
    publierBoucle(null);
  }
  return { sortie, passes, creneaux };
}

/** Une petite phrase de deux secondes, à mettre dans un créneau. */
async function phrase(hauteurs = "60 62 64 65"): Promise<Sequence> {
  const r = await rythme.executer(
    contexte(["(4/4 (1 1 1 1))", hauteurs, null], { Tempo: 120 }) as any,
  );
  return r.valeurs[0] as unknown as Sequence;
}

describe("le planificateur reconnaît les deux sortes de boucle", () => {
  it("UN DÉBUT PAR CRÉNEAU EN EST UN", () => {
    expect(planifierBoucle([{ id: "c", data: { ficheId: FICHE_CRENEAU_DEBUT } }]))
      .toEqual({ debutId: "c", finsIds: [], plusieursDebuts: false });
  });

  it("UN DÉBUT PAR VOIX AUSSI, et le pilote n'a pas à les distinguer", () => {
    expect(planifierBoucle([{ id: "v", data: { ficheId: "boucle-voix-debut" } }])?.debutId).toBe("v");
  });

  it("LES FINS SONT RELEVÉES, parce que le corps se désigne par ses DEUX bouts", () => {
    // Un contenu qui ne consulte pas sa place n'est pas un descendant du début ; sans l'amont des
    // fins, le cache le gèlerait et la boucle rendrait la même passe autant de fois.
    const plan = planifierBoucle([
      { id: "c", data: { ficheId: FICHE_CRENEAU_DEBUT } },
      { id: "corps", data: { ficheId: "formule-sequence" } },
      { id: "f", data: { ficheId: FICHE_CRENEAU_FIN } },
    ]);
    expect(plan?.finsIds).toEqual(["f"]);
  });
});

describe("les boucles emboîtées", () => {
  /** Un graphe : créneau → voix → corps → fin voix → fin créneau. */
  const graphe = [
    { id: "cd", data: { ficheId: FICHE_CRENEAU_DEBUT } },
    { id: "vd", data: { ficheId: "boucle-voix-debut" } },
    { id: "co", data: { ficheId: "formule-sequence" } },
    { id: "vf", data: { ficheId: "boucle-voix-fin" } },
    { id: "cf", data: { ficheId: FICHE_CRENEAU_FIN } },
  ];
  const aval: Record<string, string[]> = {
    cd: ["vd", "co", "vf", "cf"], vd: ["co", "vf", "cf"], co: ["vf", "cf"], vf: ["cf"], cf: [],
  };
  const amont: Record<string, string[]> = {
    cd: [], vd: ["cd"], co: ["cd", "vd"], vf: ["cd", "vd", "co"], cf: ["cd", "vd", "co", "vf"],
  };

  it("SONT ORDONNÉES DE L'EXTÉRIEURE À L'INTÉRIEURE, d'après le graphe et non un réglage", () => {
    const plan = planifierBoucles(graphe, (id) => aval[id] ?? [], (id) => amont[id] ?? []);
    expect(plan?.boucles.map((b) => b.debutId)).toEqual(["cd", "vd"]);
    expect(plan?.independantes).toBe(false);
  });

  it("CHAQUE BOUCLE PREND LES FINS DE SA SORTE, et elles seules", () => {
    // Les prendre par l'aval seul donnait à la boucle extérieure toutes les fins, y compris celle
    // de l'intérieure : les deux se contenaient alors l'une l'autre, et l'ordre sortait au hasard,
    // un comparateur qui répond oui dans les deux sens ne triant rien.
    const plan = planifierBoucles(graphe, (id) => aval[id] ?? [], (id) => amont[id] ?? []);
    expect(plan?.boucles.find((b) => b.debutId === "vd")?.finsIds).toEqual(["vf"]);
    expect(plan?.boucles.find((b) => b.debutId === "cd")?.finsIds).toEqual(["cf"]);
  });

  it("DEUX BOUCLES QUI NE S'EMBOÎTENT PAS SONT SIGNALÉES, non tues", () => {
    // Deux chaînes séparées : aucune ne contient l'autre, et le pilote ne saurait les mener côte
    // à côte, le graphe s'exécutant d'un bloc.
    const cote = [
      { id: "a", data: { ficheId: FICHE_CRENEAU_DEBUT } },
      { id: "af", data: { ficheId: FICHE_CRENEAU_FIN } },
      { id: "b", data: { ficheId: "boucle-voix-debut" } },
      { id: "bf", data: { ficheId: "boucle-voix-fin" } },
    ];
    const plan = planifierBoucles(
      cote,
      (id) => (id === "a" ? ["af"] : id === "b" ? ["bf"] : []),
      (id) => (id === "af" ? ["a"] : id === "bf" ? ["b"] : []),
    );
    expect(plan?.independantes).toBe(true);
  });

  it("une seule boucle n'est jamais dite indépendante", () => {
    const plan = planifierBoucles(
      [{ id: "c", data: { ficheId: FICHE_CRENEAU_DEBUT } }, { id: "f", data: { ficheId: FICHE_CRENEAU_FIN } }],
      (id) => (id === "c" ? ["f"] : []), (id) => (id === "f" ? ["c"] : []),
    );
    expect(plan?.independantes).toBe(false);
    expect(plan?.boucles).toHaveLength(1);
  });

  it("sans début de boucle, il n'y a rien à mener", () => {
    expect(planifierBoucles([{ id: "x", data: { ficheId: "autre" } }], () => [], () => [])).toBeNull();
  });
});

describe("les créneaux", () => {
  it("SONT DÉCRITS PAR DES RAMPES ET DES SUITES, comme la matrice de paramètres", async () => {
    const r = await mener({ "Créneaux": 4, "Départs": "0:6", "Durées": "2" }, (c) => c);
    expect(r.passes).toBe(4);
    expect(r.creneaux).toEqual([[0, 2], [2, 2], [4, 2], [6, 2]]);
  });

  it("LEURS DURÉES PEUVENT CHANGER D'UN CRÉNEAU À L'AUTRE", async () => {
    const r = await mener({ "Créneaux": 3, "Départs": "0 2 6", "Durées": "1:3" }, (c) => c);
    expect(r.creneaux).toEqual([[0, 1], [2, 2], [6, 3]]);
  });

  it("UN SEUL CRÉNEAU FAIT UNE SEULE PASSE", async () => {
    const r = await mener({ "Créneaux": 1, "Départs": "0", "Durées": "4" }, (c) => c);
    expect(r.passes).toBe(1);
  });
});

describe("le contenu connaît sa place", () => {
  it("LA CHAÎNE REÇOIT LE CRÉNEAU, donc elle peut en dépendre", async () => {
    const vus: [number, number][] = [];
    await mener({ "Créneaux": 3, "Départs": "0:8", "Durées": "2" }, async (creneau) => {
      const note = creneau.notes[0];
      vus.push([note.debut, note.fin - note.debut]);
      return phrase();
    });
    expect(vus).toEqual([[0, 2], [4, 2], [8, 2]]);
  });

  it("ET ELLE PEUT S'EN SERVIR : une transposition qui suit le rang du créneau", async () => {
    const r = await mener({ "Créneaux": 3, "Départs": "0:8", "Durées": "2" }, async (_c, passe) => {
      const f = await formule.executer(
        contexte([await phrase()], { Hauteur: `note + ${12 * passe}` }) as any,
      );
      return f.valeurs[0] as unknown as Sequence;
    }, { "Une voix par créneau": "oui" });
    const parVoix = (v: number) => r.sortie!.notes.filter((x) => x.voix === v).map((x) => x.note);
    expect(parVoix(0)).toEqual([60, 62, 64, 65]);
    expect(parVoix(1)).toEqual([72, 74, 76, 77]);
    expect(parVoix(2)).toEqual([84, 86, 88, 89]);
  });
});

describe("le pliage, qui donne sa largeur à la boîte", () => {
  it("UNE PHRASE DE DEUX SECONDES REMPLIT UN CRÉNEAU DE SIX", async () => {
    const r = await mener({ "Créneaux": 1, "Départs": "0", "Durées": "6" }, () => phrase());
    const notes = r.sortie!.notes;
    expect(Math.max(...notes.map((x) => x.fin))).toBeCloseTo(6, 9);
    // Les rapports du rythme sont gardés : quatre notes égales restent égales.
    const durees = notes.map((x) => x.fin - x.debut);
    for (const d of durees) expect(d).toBeCloseTo(1.5, 9);
  });

  it("CHAQUE PASSE EST POSÉE AU DÉBUT DE SON CRÉNEAU", async () => {
    const r = await mener({ "Créneaux": 3, "Départs": "0 10 20", "Durées": "2" }, () => phrase());
    const departs = [...new Set(r.sortie!.notes.map((x) => Math.floor(x.debut / 10) * 10))];
    expect(departs.sort((a, b) => a - b)).toEqual([0, 10, 20]);
  });

  it("SANS PLIAGE, chaque passe garde sa durée propre", async () => {
    const r = await mener(
      { "Créneaux": 2, "Départs": "0 10", "Durées": "6" }, () => phrase(), { "Plier": "non" },
    );
    const premiere = r.sortie!.notes.filter((x) => x.debut < 5);
    expect(Math.max(...premiere.map((x) => x.fin))).toBeCloseTo(2, 9);
  });

  it("UN CRÉNEAU QUE LA CHAÎNE LAISSE VIDE NE FAIT PAS DE TROU DÉCLARÉ", async () => {
    const r = await mener({ "Créneaux": 3, "Départs": "0 4 8", "Durées": "2" }, async (_c, passe) => {
      if (passe === 1) return { notes: [], tempo: 120 } as Sequence;
      return phrase();
    }, { "Une voix par créneau": "oui" });
    expect(r.sortie!.voix).toHaveLength(2);
  });
});

describe("ce qui ne doit pas casser", () => {
  it("hors d'une boucle, la fin laisse passer ce qu'elle reçoit", async () => {
    publierBoucle(null);
    const une = await phrase();
    const r = await fin.executer(contexte([une]) as any);
    expect((r.valeurs[0] as unknown as Sequence).notes).toHaveLength(4);
  });

  it("hors d'une boucle, le début rend le premier créneau", async () => {
    publierBoucle(null);
    const r = await debut.executer(contexte([], { "Créneaux": 4, "Départs": "3", "Durées": "5" }) as any);
    const note = (r.valeurs[0] as unknown as Sequence).notes[0];
    expect([note.debut, note.fin - note.debut]).toEqual([3, 5]);
  });

  it("toutes les passes vides le disent au lieu de rendre une séquence vide", async () => {
    const r = await mener({ "Créneaux": 2, "Départs": "0 4", "Durées": "2" },
      () => ({ notes: [], tempo: 120 }) as Sequence);
    expect(r.sortie).toBeNull();
  });
});
