// ui/metasLocaux.test.ts — Ce qui suit un méta-composant quand on l'enregistre.
//
// `serialiserMeta` est la source unique de vérité de la sérialisation d'un méta : elle sert à
// l'en-cours de la session comme au fichier de projet. Un champ qu'elle oublie est perdu au premier
// redémarrage, en silence, et le méta revient diminué sans que rien ne le signale.
import { describe, expect, it } from "vitest";

import type { MetaComposant } from "../core";

import { serialiserMeta } from "./metasLocaux";

const meta = (sur: Partial<MetaComposant> = {}): MetaComposant => ({
  id: "m1", nom: "Mon outil",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  mapEntrees: [], mapSorties: [],
  sousNoeuds: [{ id: "a", data: { ficheId: "gain", parametres: { Gain: 3 } } }],
  sousAretes: [],
  ...sur,
});

describe("la sérialisation d'un méta-composant", () => {
  it("EMPORTE LA DESCRIPTION DE SON AUTEUR, qui serait sinon perdue au redémarrage", () => {
    const s = serialiserMeta(meta({ description: "Compresse puis adoucit les aigus." })) as any;
    expect(s.description).toBe("Compresse puis adoucit les aigus.");
  });

  it("supporte un méta sans description, et n'invente rien", () => {
    expect((serialiserMeta(meta()) as any).description).toBeUndefined();
  });

  it("survit à l'aller-retour par JSON, qui est le chemin réel", () => {
    const relu = JSON.parse(JSON.stringify(serialiserMeta(meta({ description: "Deux filtres." }))));
    expect(relu.description).toBe("Deux filtres.");
    expect(relu.nom).toBe("Mon outil");
    expect(relu.sousNoeuds[0].data.parametres).toEqual({ Gain: 3 });
  });
});
