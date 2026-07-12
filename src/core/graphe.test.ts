import { describe, it, expect } from "vitest";
import {
  ordreTopologique, ancetres, empreinteEntrees, empreinteParametres,
  resoudreEntree, valeursEntrantes,
} from "./graphe";
import type { AreteG } from "./meta";

const a = (source: string, target: string, sh = "out:0", th = "in:0"): AreteG =>
  ({ id: `${source}-${target}`, source, target, sourceHandle: sh, targetHandle: th });

describe("logique de graphe (filet de sécurité du moteur)", () => {
  it("ordonne topologiquement une chaîne A→B→C", () => {
    const ordre = ordreTopologique(["A", "B", "C"], [a("A", "B"), a("B", "C")]);
    expect(ordre).toEqual(["A", "B", "C"]);
  });

  it("respecte les dépendances d'un diamant A→B,A→C,B→D,C→D", () => {
    const ordre = ordreTopologique(["A", "B", "C", "D"], [a("A", "B"), a("A", "C"), a("B", "D"), a("C", "D")]);
    expect(ordre.indexOf("A")).toBeLessThan(ordre.indexOf("B"));
    expect(ordre.indexOf("A")).toBeLessThan(ordre.indexOf("C"));
    expect(ordre.indexOf("B")).toBeLessThan(ordre.indexOf("D"));
    expect(ordre.indexOf("C")).toBeLessThan(ordre.indexOf("D"));
    expect(ordre).toHaveLength(4);
  });

  it("inclut les nœuds isolés (sans arête)", () => {
    expect(ordreTopologique(["X", "Y"], []).sort()).toEqual(["X", "Y"]);
  });

  it("ne boucle pas sur un cycle (renvoie l'acyclique)", () => {
    // A→B→A : aucun nœud d'indegree 0 → aucun n'est ordonné (comportement figé).
    expect(ordreTopologique(["A", "B"], [a("A", "B"), a("B", "A")])).toEqual([]);
  });

  it("collecte les ancêtres (nœud cible inclus)", () => {
    const set = ancetres("D", [a("A", "B"), a("B", "D"), a("C", "D")]);
    expect([...set].sort()).toEqual(["A", "B", "C", "D"]);
  });

  it("empreinte des entrées = sources triées", () => {
    expect(empreinteEntrees("D", [a("C", "D"), a("A", "D")])).toBe("A,C");
    expect(empreinteEntrees("Z", [a("A", "B")])).toBe("");
  });

  it("empreinte des paramètres stable et sensible aux champs clés", () => {
    expect(empreinteParametres({ parametres: { g: 5 } }))
      .toBe(empreinteParametres({ parametres: { g: 5 } }));
    expect(empreinteParametres({ parametres: { g: 5 } }))
      .not.toBe(empreinteParametres({ parametres: { g: 6 } }));
    // le nom de fichier compte
    expect(empreinteParametres({ audioFichier: { name: "a.wav" } }))
      .not.toBe(empreinteParametres({ audioFichier: { name: "b.wav" } }));
  });

  it("résout une entrée via les handles (out:2 → in:1)", () => {
    const aretes = [a("S", "N", "out:2", "in:1")];
    const res = new Map<string, string[]>([["S", ["x", "y", "z"]]]);
    expect(resoudreEntree("N", 1, aretes, res)).toBe("z"); // sortie index 2 = "z"
    expect(resoudreEntree("N", 0, aretes, res)).toBeNull(); // entrée 0 non connectée
  });

  it("liste toutes les valeurs entrantes (null si non calculé)", () => {
    const aretes = [a("A", "N", "out:0", "in:0"), a("B", "N", "out:1", "in:1")];
    const res = new Map<string, (number | null)[]>([["A", [10]]]); // B pas encore calculé
    expect(valeursEntrantes("N", aretes, res)).toEqual([10, null]);
  });
});
