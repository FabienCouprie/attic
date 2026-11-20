// core/registre-alias.test.ts — Les anciens identifiants sont ceux d'un registre, et non du cœur.
//
// CE QUE CES CAS EMPÊCHENT, relevé par la relecture de `PORTING-A-DOMAIN.md` (PR 403). La table des
// alias était une constante de `core/registre.ts`, résolue par tout registre avant chaque recherche :
//
//   function resoudre(id: string): string { return ALIAS[id] ?? id; }
//
// Le cœur portait donc quatorze identifiants audio, et deux défauts en sortaient :
//
//   · UN AUTRE DOMAINE PERDAIT SES HOMONYMES. Sa fiche `filtre` s'inscrivait, et `trouverDef("filtre")`
//     cherchait `reponse-filtre`, qu'il n'a pas : introuvable, sans un mot.
//   · LE DOMAINE AUDIO LUI-MÊME PERDAIT UN NŒUD INSTALLÉ DE CE NOM. Inscrit, il paraissait dans la
//     palette sous son nom, puis, posé, s'affichait et s'exécutait en « Réponse de filtre ».
//
// Fabien a décidé le 2026-11-20 de passer la table au registre, remise par l'adaptateur du domaine,
// et de faire refuser par `enregistrer` un identifiant qui est un alias.
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

/** Un registre qui porte un alias réel du domaine audio, `filtre` vers `reponse-filtre`. */
function registreAvecAlias() {
  const r = creerRegistre<unknown, unknown>({ alias: { filtre: "reponse-filtre" } });
  r.enregistrerTypeFlux({ id: "essai", couleur: "#888", forme: "rond", libelle: "Essai" });
  r.enregistrer(fiche("reponse-filtre", "socle"));
  r.figerLesNatifs();
  return r;
}

function registreSansAlias() {
  const r = creerRegistre<unknown, unknown>();
  r.enregistrerTypeFlux({ id: "essai", couleur: "#888", forme: "rond", libelle: "Essai" });
  return r;
}

describe("les alias d'un registre", () => {
  it("UN REGISTRE NE RÉSOUT QUE LES ALIAS QU'ON LUI REMET : l'homonyme d'un autre domaine se trouve", () => {
    const audio = registreAvecAlias();
    const autre = registreSansAlias();
    autre.enregistrer(fiche("filtre", "autre"));

    expect(audio.trouverDef("filtre")?.id, "le registre qui porte l'alias l'ouvre").toBe("reponse-filtre");
    expect(autre.trouverDef("filtre")?.id, "un registre sans table ne détourne rien").toBe("filtre");
    expect(autre.trouverPlugin("filtre"), "et son exécuteur se trouve aussi").toBeDefined();
  });

  it("UN IDENTIFIANT QUI EST UN ALIAS NE S'INSCRIT PAS, et le refus nomme la fiche qui l'ouvre", () => {
    const r = registreAvecAlias();
    const cri = vi.spyOn(console, "error").mockImplementation(() => {});
    r.enregistrer(fiche("filtre", "installe"));
    expect(cri, "un refus muet serait pire que l'inscription").toHaveBeenCalledTimes(1);
    const message = String(cri.mock.calls[0]?.[0]);
    cri.mockRestore();

    expect(message).toMatch(/« filtre » : cet identifiant est un ancien identifiant de « reponse-filtre »/);
    expect(message).toMatch(/non enregistré/);
    // LA PALETTE NE LE MONTRE PLUS, et c'était le piège : il y paraissait sous son nom.
    expect(r.tousLesPlugins().map((p) => p.id)).toEqual(["reponse-filtre"]);
    expect(r.tousLesInscrits().map((p) => p.id)).toEqual(["reponse-filtre"]);
    // ET LES GRAPHES ENREGISTRÉS OUVRENT TOUJOURS LA FICHE D'ARRIVÉE.
    expect(r.trouverDef("filtre")?.id).toBe("reponse-filtre");
  });

  it("UNE CLÉ HÉRITÉE D'`Object.prototype` N'EST PAS UN ALIAS : `constructor` s'inscrit et se trouve", () => {
    const r = registreAvecAlias();
    const cri = vi.spyOn(console, "error").mockImplementation(() => {});
    r.enregistrer(fiche("constructor", "a"));
    r.enregistrer(fiche("toString", "b"));
    expect(cri, "aucun des deux n'est un alias de la table").not.toHaveBeenCalled();
    cri.mockRestore();

    expect(r.trouverDef("constructor")?.id).toBe("constructor");
    expect(r.trouverDef("toString")?.id).toBe("toString");
  });
});
