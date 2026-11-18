// core/rendu-du-visible.test.ts — Ce que le nœud visible montre, choisi dans les tables de la passe.
//
// CE QUI DOIT ÊTRE TENU, branche par branche du choix :
//   - un nœud ordinaire montre ses valeurs, PAR RÉFÉRENCE, son message et ses deux canaux ; ce qui
//     manque n'est pas écrit ;
//   - rien à montrer sans valeur ni message, et un méta hors du périmètre du run garde ce qu'il
//     montrait ;
//   - un méta montre ses sorties exposées, et l'échec de sa branche quand ses internes n'ont rien
//     rendu, avec la fiche du premier resté vide ; un message le dispense de l'échec ;
//   - une bulle montre la seule sortie qui la représente, ou aucune.
//
// Ce que l'affichage fait de ce choix est tenu par `ui/correctif-resultat.test.ts`, qui joue les deux
// enchaînés ; le témoin de la boucle (`core/execution-boucle.test.ts`) tient que `noeudFini` porte
// ce que la pose d'avant lisait.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { choisirLeRendu, type TablesDuRendu } from "./rendu-du-visible";
import type { AreteG, NoeudG } from "./meta";
import { configurerRegistre, enregistrerMeta, supprimerMeta } from "./metastore";

const noeud = (id: string, ficheId: string, data: Record<string, unknown> = {}): NoeudG => ({ id, data: { ficheId, ...data } });
const FICHES: Record<string, { entrees: never[]; sorties: { nom: string; type: string }[] }> = {
  son: { entrees: [], sorties: [{ nom: "Audio", type: "audio" }] },
};

function tables(partiel: Partial<TablesDuRendu> = {}): TablesDuRendu {
  return {
    resultats: new Map(), messages: new Map(), affichageParNoeud: new Map(), designeParNoeud: new Map(),
    tousNoeudsG: [], aretesReelles: [], ordreFiltre: [], noeudsPlats: [], estMetaEnScope: () => true,
    trouverDef: (f) => FICHES[f] as never,
    ...partiel,
  };
}

describe("un nœud ordinaire", () => {
  it("IL MONTRE SES VALEURS PAR RÉFÉRENCE, son message et ses deux canaux", () => {
    const valeurs = [{ tampon: "a" }];
    const affichage = { film: "blob:f" }, designe = { source: 0 };
    const rendu = choisirLeRendu(noeud("a", "son"), tables({
      resultats: new Map([["a", valeurs]]), messages: new Map([["a", "dit"]]),
      affichageParNoeud: new Map([["a", affichage]]), designeParNoeud: new Map([["a", designe]]),
    }));
    expect(rendu).toEqual({ valeurs, message: "dit", affichage, designe });
    expect(rendu!.valeurs).toBe(valeurs);
    expect(rendu!.affichage).toBe(affichage);
  });

  it("CE QUI MANQUE N'EST PAS ÉCRIT : ni message, ni canal, ni échec", () => {
    expect(Object.keys(choisirLeRendu(noeud("a", "son"), tables({ resultats: new Map([["a", [1]]]) }))!)).toEqual(["valeurs"]);
  });

  it("RIEN À MONTRER SANS VALEUR NI MESSAGE ; un message seul se montre, sans valeur", () => {
    expect(choisirLeRendu(noeud("a", "son"), tables())).toBeUndefined();
    expect(choisirLeRendu(noeud("a", "son"), tables({ resultats: new Map([["a", []]]) }))).toBeUndefined();
    expect(choisirLeRendu(noeud("a", "son"), tables({ messages: new Map([["a", "dit"]]) }))).toEqual({ valeurs: [], message: "dit" });
  });
});

describe("un méta, d'après ce que ses internes ont rendu", () => {
  beforeEach(() => {
    configurerRegistre({ enregistrer: () => {}, desenregistrer: () => {} } as never);
    enregistrerMeta({
      id: "meta-essai", nom: "Essai", entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "Reste", type: "audio" }],
      mapEntrees: [], mapSorties: [{ noeudInterne: "cd", portIndex: 1 }, { noeudInterne: "ef", portIndex: 0 }],
      sousNoeuds: [], sousAretes: [],
    } as never);
  });
  afterEach(() => { supprimerMeta("meta-essai"); });

  it("HORS DU PÉRIMÈTRE DU RUN, il n'a rien à montrer", () => {
    expect(choisirLeRendu(noeud("x", "meta-essai"), tables({ estMetaEnScope: () => false, resultats: new Map([["x::cd", [0, 1]]]) })))
      .toBeUndefined();
  });

  it("IL MONTRE CE QUE SES INTERNES ONT RENDU SUR SES SORTIES EXPOSÉES, et rien pour une sortie vide", () => {
    const rendu = choisirLeRendu(noeud("x", "meta-essai"), tables({ resultats: new Map([["x::cd", ["a", "b"]]]) }));
    expect(rendu).toEqual({ valeurs: ["b", null] });
  });

  it("SES INTERNES N'ONT RIEN RENDU : sa branche est en échec, et le premier resté vide est nommé", () => {
    const enEchec = tables({
      ordreFiltre: ["autre::ab", "x::ab", "x::cd"],
      resultats: new Map([["x::ab", [null]], ["autre::ab", []]]),
      noeudsPlats: [noeud("x::ab", "gain"), noeud("x::cd", "son")],
    });
    expect(choisirLeRendu(noeud("x", "meta-essai"), enEchec)).toEqual({ valeurs: [null, null], brancheEnEchec: { fautif: "gain" } });
    // Sans interne dans l'ordre, l'échec ne nomme personne.
    expect(choisirLeRendu(noeud("y", "meta-essai"), tables()))
      .toEqual({ valeurs: [null, null], brancheEnEchec: {} });
    // Un message le dispense de l'échec : il a quelque chose à dire.
    expect(choisirLeRendu(noeud("y", "meta-essai"), tables({ messages: new Map([["y", "dit"]]) })))
      .toEqual({ valeurs: [null, null], message: "dit" });
  });
});

describe("une bulle, d'après ce qui en sort", () => {
  const membres: NoeudG[] = [noeud("b", "bulle::b"), noeud("m", "son", { bulle: "b" }), noeud("z", "son")];
  const sortante: AreteG[] = [{ id: "e", source: "m", target: "z", sourceHandle: "out:0", targetHandle: "in:0" }];

  it("ELLE MONTRE LA SEULE SORTIE QUI LA REPRÉSENTE, et rien si aucune ne la représente à elle seule", () => {
    const resultats = new Map([["m", ["son de m"]]]);
    expect(choisirLeRendu(noeud("b", "bulle::b"), tables({ tousNoeudsG: membres, aretesReelles: sortante, resultats })))
      .toEqual({ valeurs: ["son de m"] });
    // Deux sorties qui franchissent la frontière n'ont pas de gagnante : rien à montrer.
    const deux: NoeudG[] = [...membres, noeud("n", "son", { bulle: "b" }), noeud("w", "son")];
    const aretes: AreteG[] = [...sortante, { id: "f", source: "n", target: "w", sourceHandle: "out:0", targetHandle: "in:0" }];
    expect(choisirLeRendu(noeud("b", "bulle::b"), tables({ tousNoeudsG: deux, aretesReelles: aretes, resultats }))).toBeUndefined();
  });
});
