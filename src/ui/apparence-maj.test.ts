// ui/apparence-maj.test.ts — Ce que l'icône de mise à jour dit de chaque état.
//
// CE QUE CE TEST TIENT, et le premier cas est celui qui a tout déclenché : `indisponible` n'était
// montré par AUCUNE branche. En développement le metteur à jour n'existe pas, donc c'est le seul
// état que voie qui travaille sur les sources : le clic ne répondait rien, et la place réservée
// pour les messages restait vide. Relevé par Fabien en une phrase — « à quoi ça sert si plus aucun
// message n'apparaît ? ».
//
// ET IL TIENT CE QU'UN CLIC A LE DROIT DE FAIRE. Une vérification de plus pendant une vérification
// ne donne pas une réponse plus rapide, et un second téléchargement pendant le premier n'a pas de
// sens : ces deux états-là ne proposent rien. Les autres proposent exactement une chose.
import { describe, expect, it } from "vitest";
import { apparenceMaj } from "./apparence-maj";

describe("l'icône de mise à jour", () => {
  it("DIT « INDISPONIBLE » AU LIEU DE NE RIEN DIRE, et c'est le cas qui manquait", () => {
    const a = apparenceMaj({ statut: "indisponible" });
    expect(a.variante).toBe("muet");
    expect(a.cle).toBe("maj.indisponible");
    expect(a.action, "un clic qui ne peut rien faire ne doit rien proposer").toBeNull();
  });

  it("propose de vérifier quand elle n'a rien à dire", () => {
    for (const etat of [null, undefined, {}, { statut: "" }]) {
      const a = apparenceMaj(etat);
      expect(a.action, JSON.stringify(etat)).toBe("verifier");
      expect(a.badge).toBeNull();
    }
  });

  it("NE RELANCE RIEN PENDANT UNE VÉRIFICATION NI PENDANT UN TÉLÉCHARGEMENT", () => {
    expect(apparenceMaj({ statut: "verification" }).action).toBeNull();
    expect(apparenceMaj({ statut: "telechargement", progression: 42 }).action).toBeNull();
  });

  it("montre l'avancement d'un téléchargement, arrondi", () => {
    const a = apparenceMaj({ statut: "telechargement", progression: 41.6 });
    expect(a.badge).toBe("42");
    expect(a.vars).toEqual([42]);
    expect(a.variante).toBe("cours");
  });

  it("offre de prendre une mise à jour disponible, et le dit avec sa version", () => {
    const a = apparenceMaj({ statut: "disponible", version: "5.0.5" });
    expect(a.action).toBe("telecharger");
    expect(a.badge).toBe("↓");
    expect(a.vars).toEqual(["5.0.5"]);
  });

  it("offre d'installer une mise à jour prête", () => {
    const a = apparenceMaj({ statut: "pret", version: "5.0.5" });
    expect(a.action).toBe("installer");
    expect(a.badge).toBe("⟳");
    expect(a.variante).toBe("bon");
  });

  it("laisse reprendre après une erreur, sans quoi elle serait sans issue", () => {
    const a = apparenceMaj({ statut: "erreur" });
    expect(a.variante).toBe("faute");
    expect(a.badge).toBe("!");
    expect(a.action).toBe("verifier");
  });

  it("dit « à jour » sans pastille : il n'y a rien à prendre", () => {
    const a = apparenceMaj({ statut: "a-jour" });
    expect(a.variante).toBe("bon");
    expect(a.badge).toBeNull();
    expect(a.action).toBe("verifier");
  });

  it("rend toujours une clé d'infobulle, quel que soit l'état", () => {
    for (const statut of ["", "verification", "a-jour", "disponible", "telechargement", "pret",
      "erreur", "indisponible", "un-etat-inconnu"]) {
      expect(apparenceMaj({ statut }).cle, statut).toMatch(/^maj\./);
    }
  });
});
