// core/fiches-du-coeur.test.ts — Un second domaine édite un méta-composant sans écrire de fiche-frontière.
//
// CE QUE CE FICHIER TIENT, depuis la pièce P1 du 2026-11-21. Les deux nœuds-frontière d'un méta sont
// déclarés par le cœur (`core/fiches-du-coeur.ts`) et inclus par le domaine. Jusque-là, un domaine qui
// voulait des méta-composants devait redéclarer leurs fiches sous les identifiants du cœur, et le type
// de leur port avec elles : `PORTING-A-DOMAIN.md` l'écrivait, et promettait pourtant ailleurs des
// méta-composants « sans une ligne de code supplémentaire ».
//
// LE DOMAINE D'ESSAI EST UN DOMAINE DE NOMBRES, sans rien d'audio : trois fiches, un type de flux à
// lui, et ce que le cœur fournit. Son type de valeur admet `null`, que la frontière d'entrée rend.
import { afterEach, describe, expect, it, vi } from "vitest";

import { fichesDuCoeur, typesFluxDuCoeur, TYPE_FRONTIERE } from "./fiches-du-coeur";
import {
  creerMeta, frontieresPourEdition, ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE, redériverMeta,
  type AreteG, type NoeudG,
} from "./meta";
import { creerRegistre } from "./registre";
import type { PluginDef, PortDef } from "./types";

type Valeur = number | null;

const fiche = (id: string, entrees: PortDef[], sorties: PortDef[]): PluginDef<Valeur, null> => ({
  id, nom: id, univers: "Nombres", famille: "Essai", resume: "Fiche d'essai du domaine des nombres.",
  notice: "Fiche d'essai.", entrees, sorties, parametres: [],
  executer: async () => ({ valeurs: sorties.map(() => 0) }),
});
const N: PortDef = { nom: "N", type: "nombre" };

/** Un domaine de nombres qui inclut ce que le cœur fournit, avec ou sans ses types de flux. */
function domaine({ avecLesTypesDuCoeur }: { avecLesTypesDuCoeur: boolean }) {
  const r = creerRegistre<Valeur, null>();
  r.enregistrerTypeFlux({ id: "nombre", couleur: "#00ff00", libelle: "Nombre" });
  if (avecLesTypesDuCoeur) for (const t of typesFluxDuCoeur()) r.enregistrerTypeFlux(t);
  for (const f of [fiche("nombres:source", [], [N]), fiche("nombres:doubler", [N], [N]), fiche("nombres:puits", [N], [])]) {
    r.enregistrer(f);
  }
  for (const f of fichesDuCoeur<Valeur, null>()) r.enregistrer(f);
  return r;
}

const n = (id: string, ficheId: string): NoeudG => ({ id, position: { x: 0, y: 0 }, data: { ficheId, parametres: {} } });
const a = (id: string, source: string, target: string): AreteG =>
  ({ id, source, target, sourceHandle: "out:0", targetHandle: "in:0" });

afterEach(() => { vi.restoreAllMocks(); });

describe("un second domaine a des méta-composants sans écrire de fiche-frontière", () => {
  it("LES DEUX FRONTIÈRES S'INSCRIVENT DANS SON REGISTRE, avec le type de leur port", () => {
    const r = domaine({ avecLesTypesDuCoeur: true });
    for (const id of [ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE]) {
      const def = r.trouverDef(id);
      expect(def, `${id} doit s'inscrire dans un domaine qui ne l'écrit pas`).toBeDefined();
      for (const p of [...def!.entrees, ...def!.sorties]) expect(p.type).toBe(TYPE_FRONTIERE);
    }
  });

  it("UN MÉTA S'Y ÉDITE AVEC SES FRONTIÈRES, ET L'INTÉRIEUR ÉDITÉ REDONNE SES PORTS", () => {
    const r = domaine({ avecLesTypesDuCoeur: true });
    const getDef = (id: string) => r.trouverDef(id);
    let k = 0;
    const { meta } = creerMeta("meta-doubler", "m1", "Doubler", new Set(["d"]),
      [n("s", "nombres:source"), n("d", "nombres:doubler"), n("p", "nombres:puits")],
      [a("e1", "s", "d"), a("e2", "d", "p")], getDef, () => `e${++k}`);
    expect(meta.entrees.map((p) => p.type)).toEqual(["nombre"]);
    expect(meta.sorties.map((p) => p.type)).toEqual(["nombre"]);

    // L'INTÉRIEUR TEL QUE L'ÉDITEUR LE MONTRE : chaque frontière synthétisée a une fiche dans ce registre.
    const fr = frontieresPourEdition(meta);
    expect(fr.noeuds.map((x) => x.data.ficheId).sort()).toEqual([ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE].sort());
    for (const x of fr.noeuds) expect(getDef(x.data.ficheId), x.data.ficheId).toBeDefined();

    const r2 = redériverMeta([...meta.sousNoeuds, ...fr.noeuds], [...meta.sousAretes, ...fr.aretes], getDef);
    expect(r2.entrees.map((p) => p.type)).toEqual(["nombre"]);
    expect(r2.sorties.map((p) => p.type)).toEqual(["nombre"]);
    expect(r2.sousNoeuds.map((x) => x.id)).toEqual(["d"]);
  });

  it("SANS LES TYPES DU CŒUR, SON REGISTRE REFUSE LES DEUX FICHES : les deux vont ensemble", () => {
    // Le refus se dit dans la console ; il est attendu ici, et se tait donc.
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = domaine({ avecLesTypesDuCoeur: false });
    expect(r.trouverDef(ID_ENTREE_FRONTIERE)).toBeUndefined();
    expect(r.trouverDef(ID_SORTIE_FRONTIERE)).toBeUndefined();
    expect(erreurs.mock.calls.map((c) => String(c[0])).filter((m) => m.includes(TYPE_FRONTIERE))).toHaveLength(2);
  });
});
