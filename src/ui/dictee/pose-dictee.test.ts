// ui/dictee/pose-dictee.test.ts — Où la dictée pose, et sur quoi elle enchaîne.
import { describe, expect, it } from "vitest";
import { PAS_X, PAS_Y, dernierDeFiche, noeudCourant, positionSuivante, type NoeudPose } from "./pose-dictee";

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
