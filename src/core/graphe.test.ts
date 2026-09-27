import { describe, it, expect } from "vitest";
import {
  ordreTopologique, ancetres, descendants, empreinteEntrees, empreinteParametres,
  fermeraitUnCycle, noeudsEnCycle, resoudreEntree, valeursEntrantes, placerEnDernier,
} from "./graphe";
import type { AreteG } from "./meta";

const a = (source: string, target: string, sh = "out:0", th = "in:0"): AreteG =>
  ({ id: `${source}-${target}`, source, target, sourceHandle: sh, targetHandle: th });

// ── Le cycle, et les deux manières de le voir ───────────────────────────────────────────────────
//
// POURQUOI CES TESTS SONT SÉVÈRES. Un cycle ne se voit pas à l'usage : les nœuds qu'il contient sont
// simplement absents de l'ordre d'exécution, donc jamais lancés, sans erreur ni message. Le graphe a
// l'air de marcher, et une branche entière ne calcule rien. Les deux contrôles doivent donc être
// exacts dans les deux sens — ne jamais manquer un cycle, et ne jamais en inventer un.

describe("noeudsEnCycle — la preuve par le tri topologique", () => {
  it("ne trouve rien sur un graphe acyclique, si emmêlé soit-il", () => {
    // Un losange, une fourche et un nœud isolé : aucun n'a de cycle.
    const aretes = [a("A", "B"), a("A", "C"), a("B", "D"), a("C", "D"), a("D", "E"), a("D", "F")];
    expect(noeudsEnCycle(["A", "B", "C", "D", "E", "F", "SEUL"], aretes)).toEqual([]);
  });

  it("NOMME EXACTEMENT LES NŒUDS PRIS DANS LE CYCLE, et pas ceux d'à côté", () => {
    // A → B → C → A, plus une branche saine D → E qui ne doit pas être accusée.
    const aretes = [a("A", "B"), a("B", "C"), a("C", "A"), a("D", "E")];
    expect(noeudsEnCycle(["A", "B", "C", "D", "E"], aretes)).toEqual(["A", "B", "C"]);
  });

  it("COMPTE AUSSI CE QUI DÉPEND D'UN CYCLE : un aval sain ne s'exécutera pas davantage", () => {
    // X est hors du cycle, mais il attend une valeur qui ne viendra jamais. Le dire est juste :
    // Kahn ne l'émet pas, et le moteur ne le lancera pas non plus.
    const aretes = [a("A", "B"), a("B", "A"), a("B", "X")];
    expect(noeudsEnCycle(["A", "B", "X"], aretes)).toEqual(["A", "B", "X"]);
  });

  it("voit une boucle d'un nœud sur lui-même", () => {
    expect(noeudsEnCycle(["A"], [a("A", "A")])).toEqual(["A"]);
  });

  it("voit deux cycles disjoints d'un seul coup", () => {
    const aretes = [a("A", "B"), a("B", "A"), a("C", "D"), a("D", "C"), a("E", "F")];
    expect(noeudsEnCycle(["A", "B", "C", "D", "E", "F"], aretes)).toEqual(["A", "B", "C", "D"]);
  });

  it("UN GRAPHE VIDE ET UN GRAPHE SANS ARÊTE SONT ACYCLIQUES, et non « indécidables »", () => {
    expect(noeudsEnCycle([], [])).toEqual([]);
    expect(noeudsEnCycle(["A", "B"], [])).toEqual([]);
  });

  it("ne se laisse pas tromper par une arête en double", () => {
    // Deux arêtes A → B comptent deux fois dans le degré entrant. Kahn les décompte toutes les
    // deux, et B sort quand même : un doublon n'est pas un cycle.
    const deux = [a("A", "B"), { ...a("A", "B"), id: "bis" }];
    expect(noeudsEnCycle(["A", "B"], deux)).toEqual([]);
  });
});

describe("fermeraitUnCycle — le contrôle à la pose d'une arête", () => {
  const chaine = [a("A", "B"), a("B", "C")];

  it("REFUSE CE QUI REFERMERAIT LA CHAÎNE, à n'importe quelle distance", () => {
    expect(fermeraitUnCycle("C", "A", chaine)).toBe(true);
    expect(fermeraitUnCycle("B", "A", chaine)).toBe(true);
    expect(fermeraitUnCycle("C", "B", chaine)).toBe(true);
  });

  it("refuse une arête d'un nœud vers lui-même, que nulle descente ne verrait", () => {
    expect(fermeraitUnCycle("A", "A", chaine)).toBe(true);
    expect(fermeraitUnCycle("SEUL", "SEUL", [])).toBe(true);
  });

  it("LAISSE PASSER CE QUI VA VERS L'AVAL, y compris en sautant un maillon", () => {
    expect(fermeraitUnCycle("A", "C", chaine)).toBe(false);
    expect(fermeraitUnCycle("A", "B", chaine)).toBe(false);
    expect(fermeraitUnCycle("B", "C", chaine)).toBe(false);
  });

  it("laisse passer une seconde arête entre les deux mêmes nœuds, sur un autre port", () => {
    // Un nœud à deux entrées nourri deux fois par le même amont : ce n'est pas un cycle.
    expect(fermeraitUnCycle("A", "B", [...chaine, a("A", "B", "out:1", "in:1")])).toBe(false);
  });

  it("laisse passer une convergence en losange, qui n'est pas un cycle", () => {
    // A → B → D et A → C → D : D reçoit deux fois de A, et pourtant rien ne remonte.
    const losange = [a("A", "B"), a("A", "C"), a("B", "D")];
    expect(fermeraitUnCycle("C", "D", losange)).toBe(false);
  });

  it("ACCORDE SON VERDICT AVEC LE TRI : ce qu'il refuse est ce que Kahn ne classerait pas", () => {
    // Le contrôle rapide et la preuve mathématique doivent dire la même chose, sans quoi l'un des
    // deux ment. Éprouvé sur toutes les arêtes possibles d'un petit graphe.
    const ids = ["A", "B", "C", "D"];
    const base = [a("A", "B"), a("B", "C"), a("A", "D")];
    for (const s of ids) {
      for (const t of ids) {
        const refus = fermeraitUnCycle(s, t, base);
        const casse = noeudsEnCycle(ids, [...base, a(s, t)]).length > 0;
        expect(refus, `${s} → ${t}`).toBe(casse);
      }
    }
  });

  it("RÉPOND SUR UN GRAPHE DÉJÀ CYCLIQUE AU LIEU DE S'Y PERDRE", () => {
    // Un projet enregistré avant ce contrôle peut porter un cycle. La descente ne doit pas y tourner
    // sans fin : l'ensemble des nœuds vus l'en empêche.
    const dejaCasse = [a("A", "B"), a("B", "A"), a("B", "C")];
    expect(fermeraitUnCycle("C", "A", dejaCasse)).toBe(true);
    expect(fermeraitUnCycle("X", "A", dejaCasse)).toBe(false);
  });

  it("tient sur une longue chaîne sans déborder la pile", () => {
    // Mille maillons : une descente récursive y passerait, mais on écrit en pile explicite pour ne
    // pas dépendre de la profondeur permise par le moteur JavaScript.
    const longue: AreteG[] = [];
    for (let i = 0; i < 1000; i++) longue.push(a(`n${i}`, `n${i + 1}`));
    expect(fermeraitUnCycle("n1000", "n0", longue)).toBe(true);
    expect(fermeraitUnCycle("n0", "n1000", longue)).toBe(false);
  });
});

describe("placerEnDernier", () => {
  it("repousse un nœud sans entrée, que le tri avait mis en tête", () => {
    const ordre = ordreTopologique(["D", "A", "B"], [a("A", "B")]);
    expect(ordre[0]).toBe("D");
    expect(placerEnDernier(ordre, (id) => id === "D")).toEqual(["A", "B", "D"]);
  });

  it("emmène ses descendants avec lui, et garde l'ordre relatif des autres", () => {
    const aretes = [a("A", "B"), a("D", "E")];
    const ordre = ordreTopologique(["A", "D", "B", "E", "C"], aretes);
    const r = placerEnDernier(ordre, (id) => id === "D", aretes);
    expect(r.slice(-2)).toEqual(["D", "E"]);
    expect(r.slice(0, 3)).toEqual(ordre.filter((id) => !["D", "E"].includes(id)));
  });

  it("sans nœud dernier, l'ordre est rendu tel quel", () => {
    const ordre = ["A", "B"];
    expect(placerEnDernier(ordre, () => false)).toBe(ordre);
  });
});

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
