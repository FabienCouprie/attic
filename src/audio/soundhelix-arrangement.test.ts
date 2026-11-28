// audio/soundhelix-arrangement.test.ts — La matrice d'activité tient ses contraintes, par la loi.
//
// NIVEAU 2. Le tirage n'est pas celui de SoundHelix, et rien ne s'y compare tirage pour tirage : ce
// qui se vérifie est ce que la recherche garantit. Sur cinquante graines, la recherche exacte rend une
// matrice où chaque voix tient chacune de ses contraintes, et le nombre de voix de chaque section est
// celui que les comptes ont tiré ; les comptes tiennent l'entrée, la sortie, les bornes et le pas. La
// recherche gloutonne rend toujours une matrice, et dit ses écarts.

import { describe, expect, it } from "vitest";
import { creerAleatoire } from "../core";
import { FauteArrangement, arranger, lireVoix, tirerComptes } from "./soundhelix-arrangement";
import { fautesDeVoix, rechercherMatrice } from "./soundhelix-recherche";

const VOIX = lireVoix([
  "nappe     part=50-90 longueur=2-",
  "basse     part=50-90 entree=1-3 longueur=2-",
  "arpege    part=30-70 longueur=2-",
  "accomp    part=30-70 longueur=2- pause=2-",
  "batterie  part=40-80 entree=3- longueur=2-",
  "melodie   part=20-50 entree=5- sortie=3- segments=1-3 longueur=2-4",
  "contre    part=0-40 entree=5- longueur=2- muette debut=-2 fin=3",
].join("\n"));

const OPTIONS = { sections: 16, voix: VOIX.length, min: 3, max: 6, changement: 2, entree: [1, 2, 3, 4], sortie: [3, 2] };

describe("les comptes de voix", () => {
  it("tiennent l'entrée, la sortie, les bornes et le pas, sur cinquante graines", () => {
    for (let graine = 1; graine <= 50; graine++) {
      const c = tirerComptes(OPTIONS, creerAleatoire(graine));
      expect(c.slice(0, 4)).toEqual([1, 2, 3, 4]);
      expect(c.slice(-2)).toEqual([3, 2]);
      for (let s = 4; s < 14; s++) {
        expect(c[s]).toBeGreaterThanOrEqual(3);
        expect(c[s]).toBeLessThanOrEqual(6);
        expect(Math.abs(c[s] - c[s - 1])).toBeLessThanOrEqual(2);
      }
    }
  });

  it("ne gardent le même compte qu'une fois sur dix quand un autre est possible", () => {
    let egaux = 0;
    let total = 0;
    for (let graine = 1; graine <= 200; graine++) {
      const c = tirerComptes(OPTIONS, creerAleatoire(graine));
      for (let s = 5; s < 14; s++) { total++; if (c[s] === c[s - 1]) egaux++; }
    }
    expect(egaux / total).toBeGreaterThan(0.04);
    expect(egaux / total).toBeLessThan(0.16);
  });
});

describe("la recherche exacte", () => {
  it("rend, sur cinquante graines, une matrice où chaque voix tient chacune de ses contraintes", () => {
    const { voix: _, ...comptes } = OPTIONS;
    let reprises = 0;
    for (let graine = 1; graine <= 50; graine++) {
      const r = arranger({ voix: VOIX, comptes, exacte: true, essais: 200_000, aleatoire: creerAleatoire(graine) });
      expect(r.matrice, `graine ${graine}, bloquée sur ${JSON.stringify(r.blocage)}`).not.toBeNull();
      VOIX.forEach((v, i) => expect(fautesDeVoix(v, r.matrice![i], 16), `graine ${graine}, ${v.nom}`).toEqual([]));
      r.comptes.forEach((c, s) => expect(r.matrice!.filter((l) => l[s]).length, `graine ${graine}, section ${s}`).toBe(c));
      expect(r.essais).toBeLessThanOrEqual(200_000);
      reprises += r.reprises;
    }
    // Des comptes sans issue existent, et la reprise sur des comptes neufs les franchit.
    expect(reprises).toBeGreaterThan(0);
  });

  it("dit la contrainte qui bloque quand aucune matrice n'est possible", () => {
    const impossibles = lireVoix("a part=100 entree=3-");
    const r = rechercherMatrice({ voix: impossibles, comptes: [1, 1, 1, 1], exacte: true, essais: 500, aleatoire: creerAleatoire(1) });
    expect(r.matrice).toBeNull();
    expect(r.essais).toBe(500);
    expect(r.blocage?.voix).toBe("a");
  });
});

describe("la recherche gloutonne", () => {
  it("rend toujours une matrice, au compte de chaque section, et compte ses écarts", () => {
    for (let graine = 1; graine <= 20; graine++) {
      const alea = creerAleatoire(graine);
      const comptes = tirerComptes(OPTIONS, alea);
      const r = rechercherMatrice({ voix: VOIX, comptes, exacte: false, essais: 200, aleatoire: alea });
      expect(r.matrice).not.toBeNull();
      comptes.forEach((c, s) => expect(r.matrice!.filter((l) => l[s]).length).toBe(c));
      const fautes = VOIX.flatMap((v, i) => fautesDeVoix(v, r.matrice![i], 16));
      expect(r.fautes).toEqual(fautes);
    }
  });
});

describe("les contraintes d'une voix", () => {
  const v = lireVoix("m part=25-50 entree=2-3 sortie=2- segments=2 longueur=2-3 pause=1-2")[0];
  it.each([
    ["..xx.xx.", []],
    ["xx..xx..", ["entree"]],
    [".xxx.xx.", ["part"]],
    ["..xxxx..", ["segments", "longueur"]],
    [".x...xx.", ["longueur", "pause"]],
    ["..xx.x.x", ["segments", "longueur", "sortie"]],
    ["........", ["entree", "muette", "part"]],
  ])("%s : %j", (jeu, attendues) => {
    const fautes = fautesDeVoix(v, [...jeu].map((c) => c === "x"), 8).map((f) => f.contrainte);
    expect([...new Set(fautes)].sort()).toEqual([...attendues].sort());
  });

  it("lit les noms courts et refuse ce qu'il ne sait pas lire", () => {
    expect(VOIX[6]).toMatchObject({ nom: "contre", muette: true, debut: -2, fin: 3, part: { min: 0, max: 40 } });
    expect(VOIX[5].entree).toEqual({ min: 5, max: 1_000_000 });
    expect(() => lireVoix("a part=x")).toThrow(FauteArrangement);
    expect(() => lireVoix("a vitesse=3")).toThrow(/illisible/);
    expect(() => lireVoix("a\na")).toThrow(/deux fois/);
  });
});
