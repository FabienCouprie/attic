// audio/evolution.test.ts — Une population qui évolue va-t-elle vers ce qu'on lui demande ?
//
// CE QU'ON ÉPROUVE SUR UNE HEURISTIQUE N'EST PAS CE QU'ON ÉPROUVE SUR UN CALCUL EXACT. Elle ne
// promet pas l'optimum, donc exiger un résultat précis serait exiger ce qu'elle ne donne pas. Ce
// qui se tient, en revanche : qu'elle descende et ne remonte jamais, qu'une graine la rejoue à
// l'identique, qu'elle s'arrête quand elle a atteint la cible, et qu'elle rende quelque chose là où
// la recherche exacte rend les mains vides. C'est cette dernière propriété qui justifie son
// existence à côté du solveur.
import { describe, expect, it } from "vitest";

import { domaineHauteurs, ecartMaximal, repetitionMaximale, resoudre } from "./contraintes";
import {
  evoluer, objectifAmpleur, objectifContraintes, objectifDouceur, objectifProfil,
  objectifRessemblance, sautMoyen,
} from "./evolution";
import { distanceEdition, profilPrimaire } from "./morphologie";
import { verifier } from "./contrepoint";

const gamme = domaineHauteurs(55, 79, [0, 2, 4, 5, 7, 9, 11]);
const domainesDe = (n: number) => new Array(n).fill(gamme);

describe("la convergence", () => {
  it("LE COÛT NE REMONTE JAMAIS : c'est ce que l'élitisme garantit", () => {
    const ev = evoluer(domainesDe(8), [objectifDouceur(1)], { generations: 60, graine: 1 });
    for (let i = 1; i < ev.histoire.length; i++) {
      expect(ev.histoire[i], `génération ${i}`).toBeLessThanOrEqual(ev.histoire[i - 1]);
    }
  });

  it("IL DESCEND VRAIMENT, et pas seulement en théorie", () => {
    const ev = evoluer(domainesDe(10), [objectifDouceur(1)], { generations: 120, graine: 2 });
    expect(ev.cout).toBeLessThan(ev.histoire[0]);
  });

  it("LA CIBLE ATTEINTE ARRÊTE LA RECHERCHE avant la dernière génération", () => {
    const ev = evoluer(domainesDe(6), [objectifProfil([60, 60, 60, 60, 60, 60], 1)], {
      generations: 500, cible: 0, graine: 3, population: 80,
    });
    expect(ev.atteinte).toBe(true);
    expect(ev.generations).toBeLessThan(500);
    expect(ev.cout).toBe(0);
  });

  it("le coût rendu est bien celui du meilleur, objectif par objectif", () => {
    const ev = evoluer(domainesDe(6), [objectifDouceur(2)], { generations: 40, graine: 4 });
    expect(ev.parObjectif).toHaveLength(1);
    expect(ev.parObjectif[0].nom).toBe("douceur");
    expect(2 * ev.parObjectif[0].cout).toBeCloseTo(ev.cout, 9);
  });
});

describe("le tirage", () => {
  it("LA MÊME GRAINE REJOUE LE MÊME RÉSULTAT", () => {
    const o = { generations: 50, graine: 9 };
    expect(evoluer(domainesDe(8), [objectifDouceur(1)], o).meilleur)
      .toEqual(evoluer(domainesDe(8), [objectifDouceur(1)], o).meilleur);
  });

  it("DEUX GRAINES DONNENT DEUX RÉSULTATS", () => {
    const un = evoluer(domainesDe(8), [objectifAmpleur(4, 1)], { generations: 50, graine: 1 });
    const deux = evoluer(domainesDe(8), [objectifAmpleur(4, 1)], { generations: 50, graine: 2 });
    expect(un.meilleur).not.toEqual(deux.meilleur);
  });
});

describe("là où la recherche exacte rend les mains vides", () => {
  // Le cantus firmus du « Gradus ad Parnassum », et les mêmes règles que le solveur.
  const FUX = [62, 64, 65, 67, 65, 69, 67, 66, 62, 64, 62];
  const REGLES_DE_FIN = new Set(["fin", "fin.quinte", "cadence"]);
  const regleDeFux = {
    nom: "fux",
    admet: (v: readonly number[], i: number, complet: boolean) =>
      !verifier(FUX.slice(0, i + 1), v.slice(0, i + 1)).some(
        (x) => x.gravite === "erreur" && (complet || !REGLES_DE_FIN.has(x.regle)),
      ),
  };
  const mode = [...new Set(FUX.map((h) => ((h % 12) + 12) % 12))].sort((a, b) => a - b);
  const domaines = new Array(FUX.length).fill(domaineHauteurs(69, 86, mode));

  it("LE SOLVEUR PROUVE QU'IL N'Y A RIEN, sous un saut de quatre demi-tons", () => {
    const regles = [ecartMaximal(4), repetitionMaximale(2), regleDeFux];
    const exact = resoudre(domaines, regles, { budget: 500000, graine: 3 });
    expect(exact.solutions).toHaveLength(0);
    expect(exact.abandonne).toBe(false);
  });

  it("L'ÉVOLUTION REND LA LIGNE LA MOINS MAUVAISE, avec les mêmes règles et sans en réécrire une", () => {
    const regles = [ecartMaximal(4), repetitionMaximale(2), regleDeFux];
    const ev = evoluer(domaines, [objectifContraintes(regles, 1)], {
      population: 120, generations: 400, graine: 1, mutation: 0.12,
    });
    expect(ev.meilleur).toHaveLength(FUX.length);
    // Elle enfreint, sinon le solveur aurait trouvé ; mais très peu, et c'est tout l'intérêt.
    expect(ev.cout).toBeGreaterThan(0);
    expect(ev.cout).toBeLessThanOrEqual(3);
  });

  it("ET QUAND UNE SOLUTION EXISTE, elle la trouve et s'arrête", () => {
    const regles = [ecartMaximal(9), repetitionMaximale(2), regleDeFux];
    const ev = evoluer(domaines, [objectifContraintes(regles, 1)], {
      population: 120, generations: 400, graine: 1, mutation: 0.12, cible: 0,
    });
    expect(ev.cout).toBe(0);
    expect(ev.atteinte).toBe(true);
    expect(verifier(FUX, ev.meilleur).filter((x) => x.gravite === "erreur")).toEqual([]);
  });
});

describe("viser une taille plutôt que la réduire", () => {
  const modele = [60, 64, 62, 67, 65, 69, 67, 60];
  const outils = { profil: (v: readonly number[]) => profilPrimaire(v), distance: distanceEdition };

  it("LE GESTE DU MODÈLE EST REPRIS SANS SES HAUTEURS", () => {
    const ev = evoluer(new Array(modele.length).fill(gamme), [
      objectifRessemblance(modele, 10, outils), objectifAmpleur(sautMoyen(modele), 1),
    ], { population: 100, generations: 300, graine: 1 });
    expect(profilPrimaire(ev.meilleur)).toEqual(profilPrimaire(modele));
    expect(ev.meilleur).not.toEqual(modele);
  });

  it("L'AMPLEUR VISÉE EST ATTEINTE, et c'est ce qu'un minimum ne saurait faire", () => {
    // Relevé en réglant : la douceur, qui MINIMISE les sauts, ramène la ligne à une oscillation
    // d'un ton dès que le profil est trouvé, quel que soit son poids. Viser l'ampleur du modèle
    // place l'optimum là où on le veut.
    const ev = evoluer(new Array(modele.length).fill(gamme), [
      objectifRessemblance(modele, 10, outils), objectifAmpleur(sautMoyen(modele), 1),
    ], { population: 100, generations: 300, graine: 1 });
    expect(sautMoyen(ev.meilleur)).toBeCloseTo(sautMoyen(modele), 6);

    const plat = evoluer(new Array(modele.length).fill(gamme), [
      objectifRessemblance(modele, 10, outils), objectifDouceur(0.2),
    ], { population: 100, generations: 300, graine: 1 });
    expect(sautMoyen(plat.meilleur)).toBeLessThan(2);
  });
});

describe("ce qui ne doit pas casser", () => {
  it("aucune variable rend un résultat vide", () => {
    const ev = evoluer([], [objectifDouceur(1)]);
    expect(ev.meilleur).toEqual([]);
    expect(ev.generations).toBe(0);
  });

  it("UN DOMAINE VIDE NE FAIT PAS INVENTER DE NOTE", () => {
    expect(evoluer([gamme, []], [objectifDouceur(1)]).meilleur).toEqual([]);
  });

  it("sans objectif, tout coûte zéro et la recherche s'arrête aussitôt", () => {
    const ev = evoluer(domainesDe(5), [], { generations: 100, cible: 0 });
    expect(ev.cout).toBe(0);
    expect(ev.meilleur).toHaveLength(5);
  });

  it("LES GÈNES RESTENT DANS LEUR DOMAINE, mutation comprise", () => {
    const ev = evoluer(domainesDe(12), [objectifAmpleur(7, 1)], { generations: 80, graine: 5, mutation: 0.5 });
    for (const h of ev.meilleur) expect(gamme).toContain(h);
  });

  it("une population minuscule ne casse rien", () => {
    const ev = evoluer(domainesDe(4), [objectifDouceur(1)], { population: 1, generations: 10 });
    expect(ev.meilleur).toHaveLength(4);
  });
});

