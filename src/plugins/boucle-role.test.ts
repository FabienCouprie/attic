// plugins/boucle-role.test.ts — Les fiches de boucle du domaine déclarent le rôle que le dépliage lit.
//
// CE QUE CE FICHIER TIENT, depuis la pièce P2 du 2026-11-21. `core/boucle-graphe.ts` ne nomme plus les
// identifiants des débuts et des fins : il lit `debutDeBoucle` et `finDeBoucle` sur la fiche. Une fiche
// qui l'oublierait ne déplierait plus rien, en silence. `boucle-deux-mecaniques.test.ts` tient le
// troisième rôle, `boucleParPasses`.
//
// ET LE DÉFAUT DE L'ALIAS, MESURÉ AVANT LA PIÈCE : une fin posée sous `boucle-graphe-fin-a`, l'ancien
// identifiant que le registre ouvre sur « Fin de boucle A », ne refermait rien. `preparerLaPasse` sur
// le vrai registre dépliait trois tours sous l'identifiant canonique, et zéro sous l'alias, le début
// relevant `debut-sans-fin`.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import type { AreteG, NoeudG } from "../core/meta";
import { preparerLaPasse } from "../core/preparation-passe";
import { toutesLesFiches } from "./index";

const role = (id: string) => toutesLesFiches.find((f) => f.id === id);

describe("les fiches de boucle déclarent leur rôle", () => {
  it("LE DÉBUT SUR UN SON REBOUCLE, LE DÉBUT SUR UN PLAN RÉPÈTE", () => {
    expect(role("boucle-graphe-debut")?.debutDeBoucle).toBe("reboucle");
    expect(role("boucle-plan-debut")?.debutDeBoucle).toBe("repete");
  });

  it("LES TROIS FINS SE DÉCLARENT FINS, et aucune autre fiche", () => {
    const fins = toutesLesFiches.filter((f) => f.finDeBoucle === true).map((f) => f.id).sort();
    expect(fins).toEqual(["boucle-graphe-fin", "boucle-graphe-fin-b", "boucle-graphe-fin-c"]);
    const debuts = toutesLesFiches.filter((f) => f.debutDeBoucle !== undefined).map((f) => f.id).sort();
    expect(debuts).toEqual(["boucle-graphe-debut", "boucle-plan-debut"]);
  });
});

describe("une fin posée sous son ancien identifiant", () => {
  const n = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG =>
    ({ id, position: { x: 0, y: 0 }, data: { ficheId, parametres } });
  const a = (id: string, source: string, target: string): AreteG =>
    ({ id, source, target, sourceHandle: "out:0", targetHandle: "in:0" });
  const passe = (fin: string) => preparerLaPasse({
    noeuds: [n("s", "oscillateur"), n("d", "boucle-graphe-debut", { Tours: 3 }), n("t", "amplificateur"), n("f", fin)],
    aretes: [a("e1", "s", "d"), a("e2", "d", "t"), a("e3", "t", "f")],
    prioriteDemandee: null, versLAval: false, trouverMeta: () => undefined,
    trouverDef: (id) => registre.trouverDef(id), fluxCompatibles: registre.fluxCompatibles, t: (c) => c,
  });

  it("LE REGISTRE L'OUVRE SUR « FIN DE BOUCLE A »", () => {
    expect(registre.trouverDef("boucle-graphe-fin-a")?.id).toBe("boucle-graphe-fin");
  });

  it("ET ELLE REFERME SA BOUCLE, comme sous l'identifiant canonique", () => {
    const canon = passe("boucle-graphe-fin");
    const alias = passe("boucle-graphe-fin-a");
    expect(canon.deplie.depliees.map((d) => d.tours)).toEqual([3]);
    expect(alias.deplie.problemes).toEqual([]);
    expect(alias.deplie.depliees.map((d) => d.tours)).toEqual([3]);
    expect(alias.nds.length).toBe(canon.nds.length);
  });
});
