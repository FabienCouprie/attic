// core/boucle-role.test.ts — Le dépliage lit le rôle que la fiche déclare, et rien d'autre.
//
// POURQUOI UN FICHIER À PART : `boucle-graphe.test.ts` est dans la dette de taille et ne grossit plus.
// Ce qu'on tient ici est neuf depuis la pièce P2 du 2026-11-21 : le dépliage ne nomme plus aucun
// identifiant, il lit `debutDeBoucle`, `finDeBoucle` et `boucleParPasses` par la fonction qu'on lui
// donne, et la préparation lui donne `trouverDef`.
import { describe, expect, it } from "vitest";

import { deplierBoucles } from "./boucle-graphe";
import { FICHE_DEBUT, FICHES_FIN, FICHE_FIN, rolesDEssai } from "./boucles-essai";
import type { AreteG, NoeudG } from "./meta";
import { creerRegistre } from "./registre";
import type { PluginDef } from "./types";

const n = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG =>
  ({ id, position: { x: 0, y: 0 }, data: { ficheId, parametres } });
const a = (id: string, source: string, target: string): AreteG =>
  ({ id, source, target, sourceHandle: "out:0", targetHandle: "in:0" });

/** source → début → corps → fin, la fin portée par la fiche qu'on donne. */
const boucle = (ficheFin: string) => ({
  noeuds: [n("s", "x"), n("d", FICHE_DEBUT, { Tours: 2 }), n("m", "y"), n("f", ficheFin)],
  aretes: [a("e1", "s", "d"), a("e2", "d", "m"), a("e3", "m", "f")],
});

describe("le rôle de boucle se lit sur la fiche", () => {
  it("TOUTE FICHE QUI SE DÉCLARE FIN REFERME SA BOUCLE, et une fiche sans rôle ne referme rien", () => {
    for (const fiche of FICHES_FIN) {
      const g = boucle(fiche);
      expect(deplierBoucles(g.noeuds, g.aretes, rolesDEssai).depliees.map((d) => d.finId), fiche).toEqual(["f"]);
    }
    const g = boucle("sans-role");
    expect(deplierBoucles(g.noeuds, g.aretes, rolesDEssai).problemes).toEqual([{ noeudId: "d", code: "debut-sans-fin" }]);
  });

  it("UN ANCIEN IDENTIFIANT QUE LE REGISTRE OUVRE REFERME LA BOUCLE, le rôle passant par `trouverDef`", () => {
    // LE DÉFAUT QUE LA LISTE AVAIT : une fin posée sous un alias s'exécutait bien sous la fiche que
    // l'alias désigne, et ne refermait rien, le dépliage comparant l'identifiant brut à sa liste.
    const registre = creerRegistre<unknown, null>({ alias: { "essai:ancienne-fin": FICHE_FIN } });
    registre.enregistrerTypeFlux({ id: "x", couleur: "#000", libelle: "X" });
    const fiche = (id: string, role: Partial<PluginDef<unknown, null>>): PluginDef<unknown, null> => ({
      id, nom: id, univers: "Essai", famille: "Essai", resume: "Essai.", notice: "Essai.",
      entrees: [{ nom: "X", type: "x" }], sorties: [{ nom: "X", type: "x" }], parametres: [],
      executer: async () => ({ valeurs: [null] }), ...role,
    });
    registre.enregistrer(fiche(FICHE_DEBUT, { debutDeBoucle: "reboucle" }));
    registre.enregistrer(fiche(FICHE_FIN, { finDeBoucle: true }));

    const g = boucle("essai:ancienne-fin");
    const r = deplierBoucles(g.noeuds, g.aretes, (id) => registre.trouverDef(id));
    expect(r.problemes).toEqual([]);
    expect(r.depliees.map((d) => [d.debutId, d.finId, d.tours])).toEqual([["d", "f", 2]]);
  });
});
