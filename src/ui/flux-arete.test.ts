// ui/flux-arete.test.ts — Quelles arêtes montrent un point circulant.
//
// Le défaut signalé : sur une chaîne A → B → C dont on exécute B seul,
// l'animation apparaissait sur les DEUX arêtes de B. Celle qui l'alimente est
// juste — B consomme la sortie de A. Celle qui en part ne l'est pas : rien ne
// sort de B tant que C n'a pas démarré, et C ne démarrera peut-être jamais.
//
// La cause était une condition « source OU cible en cours », qui allumait une
// arête dès que l'une de ses extrémités travaillait.
import { describe, it, expect } from "vitest";
import { areteEnFlux, type StatutNoeud } from "./flux-arete";

describe("le cas signalé : A → B → C, on exécute B", () => {
  // Statuts pendant l'exécution ciblée de B.
  const A: StatutNoeud = "termine";
  const B: StatutNoeud = "en_cours";
  const C: StatutNoeud = "attente";

  it("anime l'arête qui ALIMENTE le nœud en cours", () => {
    expect(areteEnFlux(A, B), "A → B").toBe(true);
  });

  it("n'anime PAS l'arête qui en part", () => {
    // Le défaut. Rien ne circule vers C, qui n'a pas commencé.
    expect(areteEnFlux(B, C), "B → C").toBe(false);
  });
});

describe("la règle", () => {
  it("ne dépend que du nœud d'arrivée", () => {
    // Quel que soit l'état de la source, c'est la cible qui décide.
    for (const source of ["attente", "en_cours", "termine", "erreur", undefined] as StatutNoeud[]) {
      expect(areteEnFlux(source, "en_cours"), `source=${source}`).toBe(true);
      expect(areteEnFlux(source, "termine"), `source=${source}`).toBe(false);
    }
  });

  it("s'éteint quand la cible a fini, échoué ou attend", () => {
    for (const cible of ["attente", "termine", "erreur", undefined] as StatutNoeud[]) {
      expect(areteEnFlux("en_cours", cible), `cible=${cible}`).toBe(false);
    }
  });
});

describe("une chaîne exécutée en entier", () => {
  // Le comportement à ne pas casser en corrigeant : pendant un run global,
  // chaque arête s'allume à son tour, quand son nœud d'arrivée calcule.
  const chaine = (enCours: "A" | "B" | "C") => {
    const statut = (n: string): StatutNoeud =>
      n === enCours ? "en_cours" : n < enCours ? "termine" : "attente";
    return {
      AB: areteEnFlux(statut("A"), statut("B")),
      BC: areteEnFlux(statut("B"), statut("C")),
    };
  };

  it("aucune arête pendant que A calcule : rien n'est encore transmis", () => {
    expect(chaine("A")).toEqual({ AB: false, BC: false });
  });

  it("A → B pendant que B calcule", () => {
    expect(chaine("B")).toEqual({ AB: true, BC: false });
  });

  it("B → C pendant que C calcule, et A → B s'est éteinte", () => {
    expect(chaine("C")).toEqual({ AB: false, BC: true });
  });

  it("une seule arête allumée à la fois sur une chaîne linéaire", () => {
    // L'ancienne condition en allumait deux dès l'étape du milieu.
    for (const n of ["A", "B", "C"] as const) {
      const e = chaine(n);
      expect(Object.values(e).filter(Boolean).length, `pendant ${n}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("un nœud à plusieurs entrées", () => {
  it("allume toutes ses arêtes entrantes pendant qu'il calcule", () => {
    // Un mixeur qui consomme trois sources : les trois alimentent le calcul
    // en cours, les trois doivent le montrer.
    expect(areteEnFlux("termine", "en_cours")).toBe(true);
    expect(areteEnFlux("termine", "en_cours")).toBe(true);
    expect(areteEnFlux("erreur", "en_cours")).toBe(true);
  });
});
