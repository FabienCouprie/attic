import { describe, it, expect } from "vitest";
import {
  ordreTopologique, ancetres, descendants, empreinteEntrees, empreinteParametres,
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

  it("place un mélangeur terminal après ses branches parallèles", () => {
    const ordre = ordreTopologique(
      ["tts", "autre", "mix"],
      [a("tts", "mix"), a("autre", "mix")],
    );
    expect(ordre.indexOf("mix")).toBeGreaterThan(ordre.indexOf("tts"));
    expect(ordre.indexOf("mix")).toBeGreaterThan(ordre.indexOf("autre"));
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

// ── Aval d'un nœud : ce que les deux réinitialisations ont à distinguer ──
//
// `reinitialiserNoeud` efface un nœud ET son aval ; `reinitialiserAval` épargne
// le nœud. La frontière entre les deux est exactement cette fonction, d'où des
// tests sur le nœud de départ plus insistants que sur la traversée elle-même.
describe("descendants (aval transitif)", () => {
  it("EXCLUT le nœud de départ", () => {
    // Le contrat, et la seule différence avec `ancetres`.
    const set = descendants("A", [a("A", "B"), a("B", "C")]);
    expect(set.has("A"), "A ne doit pas être dans son propre aval").toBe(false);
    expect([...set].sort()).toEqual(["B", "C"]);
  });

  it("ne remonte jamais en amont", () => {
    // Réinitialiser l'aval de B ne doit pas toucher A : son résultat reste bon,
    // et l'effacer forcerait un recalcul inutile — un décodage de fichier, une
    // génération, parfois une inférence de modèle.
    const set = descendants("B", [a("A", "B"), a("B", "C")]);
    expect([...set]).toEqual(["C"]);
  });

  it("rend un ensemble vide pour un nœud terminal", () => {
    expect([...descendants("C", [a("A", "B"), a("B", "C")])]).toEqual([]);
  });

  it("rend un ensemble vide pour un nœud isolé", () => {
    expect([...descendants("seul", [])]).toEqual([]);
  });

  it("suit toutes les branches d'une fourche", () => {
    const set = descendants("A", [a("A", "B"), a("A", "C"), a("C", "D")]);
    expect([...set].sort()).toEqual(["B", "C", "D"]);
  });

  it("ne compte qu'une fois le point de convergence d'un diamant", () => {
    const set = descendants("A", [a("A", "B"), a("A", "C"), a("B", "D"), a("C", "D")]);
    expect([...set].sort()).toEqual(["B", "C", "D"]);
    expect(set.size).toBe(3);
  });

  it("ne compte qu'une fois un nœud relié par deux ports", () => {
    // Le cas du sélecteur multi-zones vers un masque : deux arêtes, Audio et
    // Zones, entre la même paire de nœuds.
    const set = descendants("sel", [
      a("sel", "masque", "out:0", "in:0"),
      a("sel", "masque", "out:1", "in:1"),
    ]);
    expect([...set]).toEqual(["masque"]);
  });

  it("ignore les branches sans rapport", () => {
    const set = descendants("A", [a("A", "B"), a("X", "Y")]);
    expect([...set]).toEqual(["B"]);
  });

  it("termine sur un cycle", () => {
    // L'interface n'interdit pas de refermer une boucle. Sans le garde, la
    // traversée ne rendrait jamais la main — et c'est l'interface qui se figerait,
    // pas un test.
    const set = descendants("A", [a("A", "B"), a("B", "A")]);
    expect([...set].sort()).toEqual(["A", "B"]);
  });

  it("compose avec le nœud lui-même pour l'autre réinitialisation", () => {
    // Ce que fait `reinitialiserNoeud` : l'aval PLUS le nœud de départ. Écrit ici
    // pour que la différence entre les deux modes soit lisible d'un coup d'œil.
    const aretes = [a("A", "B"), a("B", "C")];
    const avalSeul = descendants("B", aretes);
    const avecLui = new Set(["B", ...avalSeul]);
    expect([...avalSeul].sort()).toEqual(["C"]);
    expect([...avecLui].sort()).toEqual(["B", "C"]);
  });
});

describe("le cas des zones sélectionnées", () => {
  // Entrée audio → Sélecteur multi-zones → Masque de zones.
  const aretes = [
    a("entree", "sel", "out:0", "in:0"),
    a("sel", "masque", "out:0", "in:0"),
    a("sel", "masque", "out:1", "in:1"),
  ];

  it("retirer une zone périme le masque, pas le sélecteur ni l'entrée", () => {
    // Mesuré dans l'app avant correction : le masque restait « Terminé » avec un
    // trou de 1 à 3 s dans son WAV alors que le sélecteur n'affichait plus
    // aucune zone. Ce que le badge affirme doit correspondre à ce qu'on voit.
    const aPerimer = descendants("sel", aretes);
    expect([...aPerimer]).toEqual(["masque"]);
    expect(aPerimer.has("sel"), "le sélecteur garde sa forme d'onde et son lecteur").toBe(false);
    expect(aPerimer.has("entree"), "et l'entrée n'est pas redécodée").toBe(false);
  });

  it("changer le FICHIER de l'entrée périme toute la chaîne, elle comprise", () => {
    const aPerimer = new Set(["entree", ...descendants("entree", aretes)]);
    expect([...aPerimer].sort()).toEqual(["entree", "masque", "sel"]);
  });
});
