// ui/dictee/pose-dictee.test.ts — Où la dictée pose, et sur quoi elle enchaîne.
import { describe, expect, it } from "vitest";
import { PAS_X, PAS_Y, dernierDeFiche, noeudCourant, planInsertion, positionSuivante, type NoeudPose } from "./pose-dictee";

const n = (id: string, x: number, y: number, ficheId = "f"): NoeudPose =>
  ({ id, position: { x, y }, data: { ficheId } });

describe("le composant sur lequel on enchaîne", () => {
  const noeuds = [n("a", 0, 0), n("b", 100, 0), n("c", 200, 0)];

  it("LA SÉLECTION L'EMPORTE, ce qui fait coopérer la voix et la souris", () => {
    expect(noeudCourant(noeuds, "a", "c")?.id).toBe("a");
  });

  it("sans sélection, c'est le dernier composant dicté : une suite de noms fait une chaîne", () => {
    expect(noeudCourant(noeuds, null, "b")?.id).toBe("b");
  });

  it("sans l'un ni l'autre, il n'y a pas de courant : le premier dicté ne s'enchaîne sur personne", () => {
    expect(noeudCourant(noeuds, null, null)).toBeUndefined();
  });

  it("une sélection qui ne désigne plus rien retombe sur le dernier dicté", () => {
    // Un nœud supprimé laisse une sélection périmée : elle ne doit pas rendre la dictée muette.
    expect(noeudCourant(noeuds, "disparu", "b")?.id).toBe("b");
  });
});

describe("où poser le prochain composant", () => {
  it("à droite du courant, comme une chaîne tirée à la souris", () => {
    expect(positionSuivante(n("a", 300, 80), [], false)).toEqual({ x: 300 + PAS_X, y: 80 });
  });

  it("en parallèle, une rangée plus bas et à la MÊME abscisse", () => {
    // Les deux branches partent du même point : c'est ce que « en parallèle » veut dire.
    expect(positionSuivante(n("a", 300, 80), [], true)).toEqual({ x: 300, y: 80 + PAS_Y });
  });

  it("sans courant, APRÈS ce qui existe déjà, et non à l'origine", () => {
    // Poser à l'origine recouvrirait un graphe en cours, et le composant dicté serait invisible.
    const noeuds = [n("a", 0, 400), n("b", 500, 90)];
    expect(positionSuivante(undefined, noeuds, false)).toEqual({ x: 500 + PAS_X, y: 90 });
  });

  it("sur un canevas vide, un coin franc", () => {
    expect(positionSuivante(undefined, [], false)).toEqual({ x: 120, y: 120 });
  });
});

describe("insérer, et non dériver", () => {
  const A = (id: string, source: string, target: string) => ({ id, source, target });
  // Une chaîne ordinaire : entrée → réverbération → sortie.
  const CHAINE = [A("e1", "entree", "reverb"), A("e2", "reverb", "sortie")];

  it("APRÈS : ce qui partait de la référence part désormais du nouveau", () => {
    // C'est ce qui met le compresseur SUR le chemin du son, et non à côté.
    const p = planInsertion(CHAINE, "reverb", "compresseur", "apres");
    expect(p.aRediriger).toEqual(["e2"]);
    expect(p.lien).toEqual({ source: "reverb", target: "compresseur" });
  });

  it("AVANT : ce qui entrait dans la référence entre désormais dans le nouveau", () => {
    const p = planInsertion(CHAINE, "reverb", "filtre", "avant");
    expect(p.aRediriger).toEqual(["e1"]);
    expect(p.lien).toEqual({ source: "filtre", target: "reverb" });
  });

  it("une référence sans suite ne détourne rien, et le lien suffit", () => {
    const p = planInsertion(CHAINE, "sortie", "n", "apres");
    expect(p.aRediriger).toEqual([]);
    expect(p.lien).toEqual({ source: "sortie", target: "n" });
  });

  it("détourne TOUTES les arêtes concernées, et elles seules", () => {
    const fourche = [...CHAINE, A("e3", "reverb", "analyse"), A("e4", "entree", "autre")];
    expect(planInsertion(fourche, "reverb", "n", "apres").aRediriger).toEqual(["e2", "e3"]);
  });

  it("sur un canevas sans arête, il n'y a que le lien à poser", () => {
    expect(planInsertion([], "reverb", "n", "apres"))
      .toEqual({ aRediriger: [], lien: { source: "reverb", target: "n" } });
  });
});

describe("le nœud qu'un nom désigne", () => {
  it("LE DERNIER POSÉ de cette fiche, parce qu'on parle de ce qu'on vient de faire", () => {
    const noeuds = [n("vieux", 0, 0, "reverb"), n("x", 100, 0, "autre"), n("recent", 200, 0, "reverb")];
    expect(dernierDeFiche(noeuds, "reverb")?.id).toBe("recent");
  });

  it("rien quand aucun nœud ne porte cette fiche", () => {
    expect(dernierDeFiche([n("a", 0, 0, "autre")], "reverb")).toBeUndefined();
    expect(dernierDeFiche([], "reverb")).toBeUndefined();
  });
});
