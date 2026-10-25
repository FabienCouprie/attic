// core/registre-natifs.test.ts — Un composant recu ne prend pas la place d'un composant du socle.
//
// CE QUE CE CAS EMPECHE, releve le 2026-10-25 par une revue critique. `enregistrer` remplacait EN
// SILENCE un plugin de meme identifiant :
//
//   const existant = parId.get(def.id);
//   if (existant) { plugins[idx] = def; parId.set(def.id, def); return; }
//
// Un noeud installe depuis un `.zip` partage, ou un meta-composant porte par un projet recu,
// pouvait donc prendre la place d'un composant NATIF — garder son nom, son icone et sa place dans
// la palette, et faire autre chose. Rien ne le disait, pas meme un avertissement.
//
// ET LE REMPLACEMENT RESTE PERMIS POUR CE QUI N'EST PAS FIGE, parce qu'il le faut : c'est ainsi
// qu'un meta-composant se reenregistre quand on le modifie, et qu'un noeud installe se recharge a
// chaud. Ces cas tiennent les deux moities de la regle, sans quoi la reparation casserait l'edition
// d'un meta.
import { describe, expect, it, vi } from "vitest";

import { creerRegistre } from "./registre";

/** Une fiche minimale valide, dont seuls l'identifiant et la sortie comptent ici. */
const fiche = (id: string, marque: string) => ({
  id, nom: id, univers: "Essai", famille: "Essai",
  resume: "Une fiche d'essai.", resumeEn: "A test plugin.",
  entrees: [], sorties: [{ nom: "Sortie", type: "essai" }],
  parametres: [],
  executer: async () => ({ valeurs: [marque] }),
}) as never;

function registreAvecUnType() {
  const r = creerRegistre<unknown, unknown>();
  r.enregistrerTypeFlux({ id: "essai", couleur: "#888", forme: "rond", libelle: "Essai" });
  return r;
}

describe("figer les natifs", () => {
  it("UN IDENTIFIANT FIGE NE SE REMPLACE PAS, et le refus est dit", () => {
    const r = registreAvecUnType();
    r.enregistrer(fiche("reverberation", "socle"));
    r.figerLesNatifs();

    const cri = vi.spyOn(console, "error").mockImplementation(() => {});
    r.enregistrer(fiche("reverberation", "recu"));
    expect(cri, "un remplacement refuse en silence serait pire que le remplacement").toHaveBeenCalled();
    expect(String(cri.mock.calls[0]?.[0])).toMatch(/natif ne se remplace pas/);
    cri.mockRestore();

    expect(r.trouverDef("reverberation")?.nom).toBe("reverberation");
    // LA PREUVE EST DANS LE CODE EXECUTE, non dans le nom : un imposteur garde le nom justement.
    expect(r.tousLesInscrits().filter((p) => p.id === "reverberation")).toHaveLength(1);
  });

  it("ET CE QUI N'EST PAS FIGE SE REMPLACE ENCORE : sans quoi on ne pourrait plus modifier un meta", () => {
    const r = registreAvecUnType();
    r.enregistrer(fiche("socle", "socle"));
    r.figerLesNatifs();
    // Arrive apres le gel : c'est un meta ou un noeud installe.
    r.enregistrer(fiche("mon-meta", "v1"));
    r.enregistrer(fiche("mon-meta", "v2"));
    expect(r.tousLesInscrits().filter((p) => p.id === "mon-meta"), "un seul inscrit, remplace")
      .toHaveLength(1);
  });

  it("SANS GEL, RIEN NE CHANGE — le registre reste remplacable", () => {
    // Le coeur ne decide pas pour le domaine : un domaine qui ne fige pas garde l'ancien
    // comportement, et c'est `audio/adaptateur.ts` qui fige le socle audio apres sa boucle.
    const r = registreAvecUnType();
    r.enregistrer(fiche("libre", "v1"));
    r.enregistrer(fiche("libre", "v2"));
    expect(r.tousLesInscrits().filter((p) => p.id === "libre")).toHaveLength(1);
  });

  it("et figer deux fois n'elargit l'ensemble qu'a ce qui est arrive entre les deux", () => {
    const r = registreAvecUnType();
    r.enregistrer(fiche("a", "v1"));
    r.figerLesNatifs();
    r.enregistrer(fiche("b", "v1"));
    // `b` n'est pas encore fige : il se remplace.
    r.enregistrer(fiche("b", "v2"));
    expect(r.tousLesInscrits().filter((p) => p.id === "b")).toHaveLength(1);
    r.figerLesNatifs();
    const cri = vi.spyOn(console, "error").mockImplementation(() => {});
    r.enregistrer(fiche("b", "v3"));
    expect(cri, "fige au second appel, il ne se remplace plus").toHaveBeenCalled();
    cri.mockRestore();
  });
});
