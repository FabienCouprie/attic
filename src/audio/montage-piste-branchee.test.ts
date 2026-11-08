// audio/montage-piste-branchee.test.ts — Une piste branchée du montage apparaît, et elle sonne.
//
// CE QUE CES CAS GARDENT. Relevé par Fabien le 2026-11-06 sur son propre projet : « la troisième
// piste branchée fait apparaître sa place réservée mais pas la piste ». Elle portait une liste
// `pistesVidees: [2]`, écrite le jour où son dernier morceau avait été retiré, et qui la tenait
// cachée quoi qu'on y branche ensuite. Sa règle, du même jour : « une source est branchée ou pas,
// branchée elle apparaît, non branchée elle n'apparaît pas ». La liste n'est plus lue nulle part.
//
// DEUX ÉTAGES : le projet tel qu'il est enregistré, et l'exécuteur réel du montage nourri des
// données de ce projet, liste comprise — c'est par lui qu'une lecture de la liste reviendrait sans
// se voir à l'écran. Le chemin de l'interface est tenu par `tests-e2e/montage-piste-branchee.spec.ts`.
import { describe, expect, it } from "vitest";

import { ctxDEssai } from "../core/contexte-essai";
import { morceauxAEcrire, morceauxCompletes, type Morceau } from "./montage-morceaux";

// `D:\work\attic-2026-11-05.json`, nœud `noeud-12`, recopié à l'identique pour ce qui le concerne :
// les réglages des trois pistes branchées, les quatre morceaux de la piste 2, et la liste d'avant.
const reglages = {
  "Caler sur l'heure d'enregistrement": "non",
  "Début 1": 0, "Gain 1": 0, "Fondu entrée 1": 10, "Fondu sortie 1": 10,
  "Début 2": 14.006532697033967, "Gain 2": -4.5, "Fondu entrée 2": 10, "Fondu sortie 2": 10,
  "Début 3": 18.558102477317384, "Gain 3": 0, "Fondu entrée 3": 10, "Fondu sortie 3": 10,
};
const piste1 = (id: string, debut: number): Morceau =>
  ({ id, piste: 1, debut, dans: 0, duree: 0, gain: -4.5, entree: 10, sortie: 10 });
const morceaux = [
  piste1("p2", 14.006532697033967), piste1("m1", 25.12407849835273),
  piste1("m3", 77.6269152927562), piste1("m2", 166.34796581094176),
];

describe("le projet de Fabien, tel qu'il est enregistré", () => {
  it("S'OUVRE AVEC SA TROISIÈME PISTE, à l'instant que ses réglages lui donnent", () => {
    const vus = morceauxCompletes(morceaux, [0, 1, 2], reglages);
    expect(vus.filter((m) => m.piste === 2)).toEqual([
      expect.objectContaining({ debut: 18.558102477317384, gain: 0, dans: 0, duree: 0 }),
    ]);
    expect(vus).toHaveLength(6);
  });

  it("SANS RIEN PERDRE DES QUATRE MORCEAUX DE LA PISTE 2", () => {
    expect(morceauxCompletes(morceaux, [0, 1, 2], reglages).filter((m) => m.piste === 1)).toEqual(morceaux);
  });

  it("ET SON PREMIER GESTE N'ÉCRIT QUE SES MORCEAUX : plus aucune liste de pistes vidées", () => {
    const e = morceauxAEcrire(morceauxCompletes(morceaux, [0, 1, 2], reglages), [0, 1, 2], reglages);
    expect(e).toEqual({ morceaux, reglages: expect.any(Object) });
    expect(Object.keys(e)).toEqual(["morceaux", "reglages"]);
  });
});

describe("l'exécuteur du montage, nourri des données de ce projet", () => {
  // Un son constant par piste, assez court pour que la piste 3, de 18,56 à 19,56 s, sonne seule.
  async function lancer(data: Record<string, unknown>) {
    const { toutesLesFiches } = await import("../plugins");
    await import("./adaptateur");
    const fiche = (toutesLesFiches as { id: string; executer: (ctx: unknown) => Promise<{ valeurs: unknown[]; message?: string }> }[])
      .find((f) => f.id === "montage")!;
    const son = (v: number, secondes: number) => {
      const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(8000 * secondes), sampleRate: 8000 });
      b.getChannelData(0).fill(v);
      return b;
    };
    const r = await fiche.executer(ctxDEssai([son(0.1, 1), son(0.2, 0.5), son(0.4, 1)], reglages,
      { ficheId: "montage", data }));
    const sortie = r.valeurs[0] as AudioBuffer;
    return { message: r.message ?? "", a19s: sortie.getChannelData(0)[Math.round(19 * 8000)] };
  }

  it("FAIT SONNER LA PISTE 3 MALGRÉ `pistesVidees: [2]`", async () => {
    const r = await lancer({ morceaux, pistesVidees: [2] });
    expect(r.message).toMatch(/^6 morceaux · 3 pistes/);
    expect(r.a19s, "à 19 s, seule la piste 3 sonne").toBeCloseTo(0.4, 6);
  });
});
