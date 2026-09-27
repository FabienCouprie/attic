// plugins/cercle-assemblage.test.ts — Bout à bout et superposition, sur les cercles et sur les séquences.
//
// CE QUI SE VÉRIFIE ICI. Deux réunions qui se ressemblent de loin et ne se ressemblent pas de près.
// Bout à bout, l'ordre décide et rien ne se perd ; superposé, l'ordre ne décide de rien mais deux
// attaques peuvent tomber au même endroit, et il faut alors dire laquelle reste. Et la grille
// commune est le point dur : rapprocher une attaque de la place la plus proche déplacerait le
// rythme sans le dire, d'où le plus petit commun multiple et le refus au-delà du maximum.
import { describe, expect, it } from "vitest";

import { POSITIONS_MAX, estCercle, estSuite, melanger, type Cercle } from "../audio/cercle";
import { estSequence, type Sequence } from "../audio/sequence";
import { fiches as fichesCercle } from "./cercle-assemblage";
import { fiches as fichesSequence } from "./sequence-assemblage";

const par = (id: string) =>
  [...fichesCercle, ...fichesSequence].find((f) => f.id === id)!;

const perc = (positions: number, places: number[], valeur = 36): Cercle => ({
  positions, sorte: "percussion", sommets: places.map((position) => ({ position, valeur })),
});
const melo = (positions: number, paires: [number, number][]): Cercle => ({
  positions, sorte: "hauteur", sommets: paires.map(([position, valeur]) => ({ position, valeur })),
});

const seq = (debuts: number[], duree: number, note = 60, tempo?: number): Sequence => ({
  notes: debuts.map((d) => ({ note, velocite: 100, debut: d, fin: d + 0.25 })),
  duree, ...(tempo === undefined ? {} : { tempo }),
});

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

const places = (c: Cercle) => c.sommets.map((s) => s.position).sort((a, b) => a - b);

describe("la superposition de cercles, dans le calcul", () => {
  it("LA GRILLE EST LE PLUS PETIT COMMUN MULTIPLE, et chaque attaque garde son instant", () => {
    // Un cercle de quatre et un de trois se posent sur douze : la place 1 sur quatre devient 3, la
    // place 1 sur trois devient 4. Les deux ne tombent pas au même endroit, et c'est bien ce qu'on
    // entend — rapprocher l'une de l'autre aurait déplacé le rythme.
    const m = melanger([perc(4, [0, 1]), perc(3, [0, 1])])!;
    expect(m.positions).toBe(12);
    expect(places(m)).toEqual([0, 3, 4]);
  });

  it("des tailles qui se divisent donnent la plus grande", () => {
    expect(melanger([perc(16, [0]), perc(8, [1])])!.positions).toBe(16);
    expect(melanger([perc(12, [0]), perc(4, [1]), perc(6, [2])])!.positions).toBe(12);
  });

  it("ELLE REFUSE AU-DELÀ DU MAXIMUM, plutôt que de rendre un cercle qu'aucun éditeur ne montre", () => {
    expect(melanger([perc(16, [0]), perc(10, [0])])).toBeNull();
    expect(POSITIONS_MAX).toBeLessThan(80);
  });

  it("elle refuse deux sortes différentes", () => {
    expect(melanger([perc(8, [0]), melo(8, [[1, 60]])])).toBeNull();
  });

  it("DEUX ATTAQUES SUR LA MÊME PLACE N'EN FONT QU'UNE, celle du premier reçu", () => {
    const m = melanger([melo(4, [[0, 60]]), melo(4, [[0, 72]])])!;
    expect(m.sommets).toHaveLength(1);
    expect(m.sommets[0].valeur).toBe(60);
  });

  it("un cercle seul se mêle à lui-même sans rien changer", () => {
    const m = melanger([perc(8, [0, 3, 5])])!;
    expect(m.positions).toBe(8);
    expect(places(m)).toEqual([0, 3, 5]);
  });
});

describe("la jointure de cercles", () => {
  it("L'UN APRÈS L'AUTRE REND UNE SUITE, chaque cercle gardant ses places", async () => {
    const r = await par("cercle-jointure")
      .executer!(contexte([perc(16, [0]), perc(12, [1])], { Assemblage: "suite" }) as never) as any;
    expect(estSuite(r.valeurs[0])).toBe(true);
    expect((r.valeurs[0] as Cercle[]).map((c) => c.positions)).toEqual([16, 12]);
  });

  it("EN UN SEUL CYCLE, LES PLACES S'ADDITIONNENT et le second est décalé", async () => {
    const r = await par("cercle-jointure")
      .executer!(contexte([perc(16, [0, 3]), perc(12, [1])], { Assemblage: "cycle" }) as never) as any;
    const c = r.valeurs[0] as Cercle;
    expect(c.positions).toBe(28);
    expect(places(c)).toEqual([0, 3, 17]);
  });

  it("un seul cercle branché ressort tel quel, et non en suite d'un", async () => {
    const r = await par("cercle-jointure")
      .executer!(contexte([perc(8, [0])], { Assemblage: "suite" }) as never) as any;
    expect(Array.isArray(r.valeurs[0])).toBe(false);
    expect(estCercle(r.valeurs[0])).toBe(true);
  });

  it("une suite reçue se déplie, elle ne s'imbrique pas", async () => {
    const r = await par("cercle-jointure")
      .executer!(contexte([[perc(8, [0]), perc(8, [1])], perc(4, [0])], { Assemblage: "suite" }) as never) as any;
    expect(r.valeurs[0]).toHaveLength(3);
  });

  it("en un seul cycle, deux sortes différentes sont refusées", async () => {
    const r = await par("cercle-jointure")
      .executer!(contexte([perc(8, [0]), melo(8, [[1, 60]])], { Assemblage: "cycle" }) as never) as any;
    expect(r.erreur).toBe(true);
  });
});

describe("le mélangeur de cercles", () => {
  it("il superpose ce qu'on lui tire, et dit ce qui s'est confondu", async () => {
    const r = await par("cercle-melangeur")
      .executer!(contexte([perc(4, [0, 1]), perc(4, [1, 2])]) as never) as any;
    expect(places(r.valeurs[0] as Cercle)).toEqual([0, 1, 2]);
    expect(r.message).toContain("1");
  });

  it("UN SEUL CERCLE NE SE MÉLANGE PAS, et il vaut mieux le dire", async () => {
    const r = await par("cercle-melangeur").executer!(contexte([perc(8, [0])]) as never) as any;
    expect(r.erreur).toBe(true);
  });

  it("une grille hors des bornes se dit, et ne se confond pas avec un refus de sorte", async () => {
    const r = await par("cercle-melangeur")
      .executer!(contexte([perc(16, [0]), perc(10, [0])]) as never) as any;
    expect(r.erreur).toBe(true);
    expect(r.message).toContain("grille");
  });
});

describe("la jointure de séquences", () => {
  it("CHACUNE COMMENCE OÙ LA PRÉCÉDENTE FINIT, et la durée déclarée fait la fin", async () => {
    // La première dure deux secondes bien que sa dernière note tombe à 0,5 : le silence de fin lui
    // appartient, et la seconde ne remonte pas dedans.
    const r = await par("sequence-jointure")
      .executer!(contexte([seq([0, 0.5], 2), seq([0, 1], 3)]) as never) as any;
    const s = r.valeurs[0] as Sequence;
    expect(s.notes.map((n) => n.debut)).toEqual([0, 0.5, 2, 3]);
    expect(s.duree).toBeCloseTo(5, 9);
  });

  it("« Silence » écarte les séquences, et ne s'ajoute pas après la dernière", async () => {
    const r = await par("sequence-jointure")
      .executer!(contexte([seq([0], 1), seq([0], 1)], { Silence: 0.5 }) as never) as any;
    const s = r.valeurs[0] as Sequence;
    expect(s.notes.map((n) => n.debut)).toEqual([0, 1.5]);
    expect(s.duree).toBeCloseTo(2.5, 9);
  });

  it("SANS VOIX PAR ENTRÉE, LES NOTES N'EN PORTENT AUCUNE : deux lignes ne se collent pas sur la même portée", async () => {
    const r = await par("sequence-jointure")
      .executer!(contexte([seq([0], 1), seq([0], 1)]) as never) as any;
    expect((r.valeurs[0] as Sequence).notes.every((n) => n.voix === undefined)).toBe(true);
  });

  it("avec une voix par entrée, chacune reçoit la sienne", async () => {
    const r = await par("sequence-jointure")
      .executer!(contexte([seq([0], 1), seq([0], 1)], { "Une voix par séquence": "oui" }) as never) as any;
    const s = r.valeurs[0] as Sequence;
    expect(new Set(s.notes.map((n) => n.voix))).toEqual(new Set([0, 1]));
    expect(s.voix).toHaveLength(2);
  });

  it("le tempo est celui de la première qui en déclare un, et les autres se comptent", async () => {
    const r = await par("sequence-jointure")
      .executer!(contexte([seq([0], 1, 60, 90), seq([0], 1, 60, 120)]) as never) as any;
    expect((r.valeurs[0] as Sequence).tempo).toBe(90);
    expect(r.message).toContain("1");
  });

  it("une seule séquence ne se joint pas, et il vaut mieux le dire", async () => {
    const r = await par("sequence-jointure").executer!(contexte([seq([0], 1)]) as never) as any;
    expect(r.erreur).toBe(true);
  });
});

describe("le mélangeur de séquences", () => {
  it("TOUTES COMMENCENT À ZÉRO, et chacune devient une voix", async () => {
    const r = await par("sequence-melangeur")
      .executer!(contexte([seq([0, 1], 2), seq([0.5], 4)]) as never) as any;
    const s = r.valeurs[0] as Sequence;
    expect(estSequence(s)).toBe(true);
    expect(s.notes.map((n) => n.debut)).toEqual([0, 0.5, 1]);
    expect(new Set(s.notes.map((n) => n.voix))).toEqual(new Set([0, 1]));
  });

  it("la durée est celle de la plus longue, silence final compris", async () => {
    const r = await par("sequence-melangeur")
      .executer!(contexte([seq([0], 2), seq([0], 7)]) as never) as any;
    expect((r.valeurs[0] as Sequence).duree).toBeCloseTo(7, 9);
  });

  it("une seule séquence ne se mélange pas", async () => {
    const r = await par("sequence-melangeur").executer!(contexte([seq([0], 1)]) as never) as any;
    expect(r.erreur).toBe(true);
  });
});
