// audio/arbre-rythmique.test.ts — Les proportions sont exactes, ou elles ne servent à rien.
//
// POURQUOI LES CHIFFRES SONT RONDS ICI. Le tempo des essais est soixante à la noire, de sorte qu'un
// temps dure exactement une seconde : une division en trois donne alors un tiers, et l'on voit
// immédiatement si le compte tombe. À un tempo quelconque, la même erreur se cacherait derrière des
// décimales.
import { describe, expect, it } from "vitest";

import {
  derouler, dureeArbre, dureeMesure, ecrireArbre, lireArbre, type Mesure,
} from "./arbre-rythmique";

const T = 60; // une noire par seconde

describe("lire la notation en listes", () => {
  it("lit une mesure simple", () => {
    const m = lireArbre("(4/4 (1 1 1 1))");
    expect(m).toHaveLength(1);
    expect(m[0].metrique).toEqual([4, 4]);
    expect(m[0].contenu.map((n) => n.valeur)).toEqual([1, 1, 1, 1]);
  });

  it("LE NOMBRE NÉGATIF DEVIENT UN SILENCE, et son poids redevient positif", () => {
    // Garder le signe obligerait chaque calcul de proportion à prendre une valeur absolue, et
    // l'oubli ne s'entendrait qu'à l'audition.
    const m = lireArbre("(4/4 (1 -2 1))");
    expect(m[0].contenu.map((n) => n.valeur)).toEqual([1, 2, 1]);
    expect(m[0].contenu.map((n) => !!n.silence)).toEqual([false, true, false]);
  });

  it("lit une division gigogne", () => {
    const m = lireArbre("(4/4 (1 (1 (1 1 1)) 1 1))");
    const division = m[0].contenu[1];
    expect(division.valeur).toBe(1);
    expect(division.enfants?.map((n) => n.valeur)).toEqual([1, 1, 1]);
  });

  it("LA VIRGULE MARQUE LA LIAISON, et c'est la seule chose qui distingue 1.0 de 1", () => {
    const m = lireArbre("(4/4 (1 1.0 1 1))");
    expect(m[0].contenu.map((n) => n.valeur)).toEqual([1, 1, 1, 1]);
    expect(m[0].contenu.map((n) => !!n.liee)).toEqual([false, true, false, false]);
  });

  it("lit plusieurs mesures, avec ou sans liste englobante", () => {
    expect(lireArbre("(4/4 (1 1 1 1)) (3/4 (1 1 1))")).toHaveLength(2);
    expect(lireArbre("((4/4 (1 1 1 1)) (3/4 (1 1 1)))")).toHaveLength(2);
  });

  it("NOMME L'ERREUR AVEC SA POSITION, un arbre se tapant à la main", () => {
    expect(() => lireArbre("(4/4 (1 1 1)")).toThrow(/parenthèse fermante/);
    expect(() => lireArbre("(4 (1 1))")).toThrow(/métrique/);
    expect(() => lireArbre("(4/4 (1 a 1))")).toThrow(/nombre attendu/);
    expect(() => lireArbre("(4/4 (1 1)) )")).toThrow(/en trop/);
  });

  it("UNE DIVISION N'EST NI SILENCE NI LIÉE, et le signe qui le prétend est abandonné", () => {
    // Écrit à la main, `(-1 (1 1))` était accepté, dessiné avec les hachures d'un silence, et joué
    // en deux notes : le déroulement descend dans la division et jette le signe. Le dessin disait
    // une chose et l'oreille en entendait une autre.
    const m = lireArbre("(4/4 ((-1 (1 1)) 1 1 1))");
    expect(!!m[0].contenu[0].silence, "le silence ne survit pas à la division").toBe(false);
    expect(m[0].contenu[0].enfants).toHaveLength(2);
    // Et l'arbre se réécrit sans le signe : ce qui est relu est ce qui sonne.
    expect(ecrireArbre(m)).toBe("(4/4 ((1 (1 1)) 1 1 1))");
    for (const e of derouler(m, T)) expect(e.silence).toBe(false);
  });

  it("la même règle vaut pour une liaison portée par une division", () => {
    const m = lireArbre("(4/4 ((1.0 (1 1)) 1 1 1))");
    expect(!!m[0].contenu[0].liee).toBe(false);
    expect(ecrireArbre(m)).toBe("(4/4 ((1 (1 1)) 1 1 1))");
  });

  it("un silence ORDINAIRE, lui, n'est pas touché", () => {
    const m = lireArbre("(4/4 (1 -2 1))");
    expect(m[0].contenu.map((n) => !!n.silence)).toEqual([false, true, false]);
    expect(ecrireArbre(m)).toBe("(4/4 (1 -2 1))");
  });

  it("rend une liste vide sur un texte vide, au lieu de jeter", () => {
    expect(lireArbre("")).toEqual([]);
    expect(lireArbre("   ")).toEqual([]);
  });

  it("l'aller-retour se referme : écrit puis relu, l'arbre est le même", () => {
    for (const texte of [
      "(4/4 (1 1 1 1))",
      "(4/4 (1 -2 1))",
      "(4/4 (1 (1 (1 1 1)) 1 1))",
      "(3/4 (1 1.0 1))",
      "((4/4 (1 1 1 1)) (6/8 (1 1 1 1 1 1)))",
    ]) {
      expect(ecrireArbre(lireArbre(texte)), texte).toBe(texte);
    }
  });
});

describe("la durée d'une mesure", () => {
  it("compte en noires, quelle que soit la métrique", () => {
    expect(dureeMesure([4, 4], T)).toBeCloseTo(4, 9);
    expect(dureeMesure([3, 4], T)).toBeCloseTo(3, 9);
    // Six croches font trois noires, donc trois secondes à soixante.
    expect(dureeMesure([6, 8], T)).toBeCloseTo(3, 9);
    expect(dureeMesure([2, 2], T)).toBeCloseTo(4, 9);
  });

  it("suit le tempo", () => {
    expect(dureeMesure([4, 4], 120)).toBeCloseTo(2, 9);
    expect(dureeMesure([4, 4], 30)).toBeCloseTo(8, 9);
  });
});

describe("dérouler un arbre", () => {
  it("quatre temps égaux tombent sur les secondes rondes", () => {
    const e = derouler(lireArbre("(4/4 (1 1 1 1))"), T);
    expect(e.map((x) => x.debut)).toEqual([0, 1, 2, 3]);
    expect(e.map((x) => x.duree)).toEqual([1, 1, 1, 1]);
  });

  it("LES PROPORTIONS DÉCIDENT, ET NON LES NOMBRES EUX-MÊMES", () => {
    // 1 1 2 sur quatre temps donne un, un, deux. Les mêmes poids multipliés par dix donnent la
    // même chose : seul leur rapport compte.
    const a = derouler(lireArbre("(4/4 (1 1 2))"), T).map((x) => x.duree);
    const b = derouler(lireArbre("(4/4 (10 10 20))"), T).map((x) => x.duree);
    expect(a).toEqual([1, 1, 2]);
    expect(b).toEqual(a);
  });

  it("UN TRIOLET DIVISE UN TEMPS EN TROIS TIERS EXACTS", () => {
    const e = derouler(lireArbre("(4/4 (1 (1 (1 1 1)) 1 1))"), T);
    expect(e).toHaveLength(6);
    for (const i of [1, 2, 3]) expect(e[i].duree).toBeCloseTo(1 / 3, 12);
    expect(e[1].debut).toBeCloseTo(1, 12);
    expect(e[4].debut).toBeCloseTo(2, 12);
  });

  it("UN QUINTOLET SUR LA MESURE ENTIÈRE DONNE CINQ FOIS QUATRE CINQUIÈMES", () => {
    const e = derouler(lireArbre("(4/4 ((4 (1 1 1 1 1))))"), T);
    expect(e).toHaveLength(5);
    for (const x of e) expect(x.duree).toBeCloseTo(0.8, 12);
  });

  it("les divisions s'emboîtent sans perdre le compte", () => {
    const e = derouler(lireArbre("(4/4 ((1 (1 (1 (1 1)))) 1 1 1))"), T);
    // Le premier temps se divise en deux, dont la seconde moitié en deux encore.
    expect(e.map((x) => +x.duree.toFixed(6))).toEqual([0.5, 0.25, 0.25, 1, 1, 1]);
  });

  it("LE TOTAL FAIT TOUJOURS LA MESURE, quel que soit l'arbre", () => {
    // C'est l'invariant qui garantit qu'aucune durée ne se perd en route.
    for (const texte of [
      "(4/4 (1 1 1 1))", "(4/4 (1 (1 (1 1 1)) 1 1))", "(4/4 ((4 (1 1 1 1 1))))",
      "(3/4 (2 1))", "(6/8 (1 1 (1 (1 1 1 1 1 1 1))))", "(4/4 (1 -1 (2 (1 1 1)) ))",
    ]) {
      const mesures = lireArbre(texte);
      const e = derouler(mesures, T);
      const total = e.reduce((s, x) => s + x.duree, 0);
      expect(total, texte).toBeCloseTo(dureeArbre(mesures, T), 9);
      // Et rien ne se chevauche ni ne laisse de trou.
      for (let i = 1; i < e.length; i++) {
        expect(e[i].debut, `${texte} rang ${i}`).toBeCloseTo(e[i - 1].debut + e[i - 1].duree, 9);
      }
    }
  });

  it("le silence occupe sa place sans être une note", () => {
    const e = derouler(lireArbre("(4/4 (1 -2 1))"), T);
    expect(e.map((x) => x.silence)).toEqual([false, true, false]);
    expect(e.map((x) => x.duree)).toEqual([1, 2, 1]);
  });

  it("UNE NOTE LIÉE ALLONGE LA PRÉCÉDENTE au lieu d'en créer une nouvelle", () => {
    const e = derouler(lireArbre("(4/4 (1 1.0 1 1))"), T);
    expect(e).toHaveLength(3);
    expect(e[0].duree).toBeCloseTo(2, 12);
    expect(e[1].debut).toBeCloseTo(2, 12);
  });

  it("une liaison en tête devient une note, n'ayant rien à prolonger", () => {
    const e = derouler(lireArbre("(4/4 (1.0 1 1 1))"), T);
    expect(e).toHaveLength(4);
    expect(e[0].duree).toBeCloseTo(1, 12);
  });

  it("enchaîne les mesures bout à bout", () => {
    const e = derouler(lireArbre("((4/4 (1 1 1 1)) (3/4 (1 1 1)))"), T);
    expect(e).toHaveLength(7);
    expect(e[4].debut).toBeCloseTo(4, 12);
    expect(e[4].mesure).toBe(1);
  });

  it("RELÈVE LE N-OLET POUR LA GRAVURE, sans en avoir besoin pour le son", () => {
    // Le son est déjà juste, les durées étant exactes ; c'est l'écriture qui doit savoir qu'un
    // groupe est un triolet plutôt que trois durées bizarres.
    const e = derouler(lireArbre("(4/4 (1 (1 (1 1 1)) 1 1))"), T);
    expect(e[0].nolet).toBe(0);
    expect(e[1].nolet).toBe(3);
    expect(e[4].nolet).toBe(0);
    const q = derouler(lireArbre("(4/4 ((4 (1 1 1 1 1))))"), T);
    expect(q[0].nolet).toBe(5);
    const binaire = derouler(lireArbre("(4/4 ((4 (1 1 1 1))))"), T);
    expect(binaire[0].nolet).toBe(0);
  });

  it("COMPTE DES GROUPES, ET NON DES NOTES EN GROUPE", () => {
    // Sans un rang de groupe, les trois notes d'un triolet se dénombrent comme trois triolets, et
    // le relevé du nœud annonçait « 3 groupes irréguliers » pour une seule division en trois.
    const un = derouler(lireArbre("(4/4 (1 (1 (1 1 1)) 1 1))"), T);
    expect(new Set(un.filter((e) => e.nolet > 0).map((e) => e.groupe)).size).toBe(1);
    const deux = derouler(lireArbre("(4/4 ((1 (1 1 1)) (1 (1 1 1)) 1 1))"), T);
    expect(new Set(deux.filter((e) => e.nolet > 0).map((e) => e.groupe)).size).toBe(2);
    // Et deux triolets dans deux mesures restent deux groupes distincts.
    const deuxMesures = derouler(lireArbre("((4/4 (1 (1 (1 1 1)) 1 1)) (4/4 (1 (1 (1 1 1)) 1 1)))"), T);
    expect(new Set(deuxMesures.filter((e) => e.nolet > 0).map((e) => e.groupe)).size).toBe(2);
  });

  it("ne bute ni sur un arbre vide ni sur une division vide", () => {
    expect(derouler([], T)).toEqual([]);
    expect(derouler(lireArbre("(4/4 ())"), T)).toEqual([]);
  });

  it("ignore un poids nul plutôt que de diviser par zéro", () => {
    const mesures: Mesure[] = [{ metrique: [4, 4], contenu: [{ valeur: 0 }, { valeur: 0 }] }];
    expect(derouler(mesures, T)).toEqual([]);
  });
});
