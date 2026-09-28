// audio/cantor-deplacement.test.ts — Le compte est-il conservé, et la poussière est-elle la bonne ?
//
// LA PROPRIÉTÉ QUI DONNE SON NOM À L'OPÉRATION : autant d'événements en sortent qu'il en est entré.
// C'est ce qui la distingue de la construction de Cantor employée ailleurs dans le dépôt, laquelle
// ne sait que retirer et fait donc baisser la densité à chaque niveau.
//
// ET LA SECONDE, moins évidente : après déplacement complet, plus aucun événement ne tombe dans un
// trou. Sans elle, l'opération aurait l'air de marcher tout en laissant la moitié de la matière là
// où elle était.
import { describe, expect, it } from "vitest";

import {
  dansLaPoussiere, deplacerSurCantor, mesureDeLaPoussiere, plusProcheDansLaPoussiere,
  poussiereDeCantor, tireDansLaPoussiere, type FormeDeCantor,
} from "./cantor-deplacement";

const TIERS: FormeDeCantor = { parts: 3, otee: "centre", profondeur: 3 };

/** Une suite régulière, la plus lisible pour voir ce qui bouge. */
const reguliere = (combien: number, pas: number) =>
  Array.from({ length: combien }, (_, i) => ({ debut: i * pas, fin: i * pas + pas * 0.5, note: 60 + i }));

describe("la poussière de Cantor", () => {
  it("le premier niveau ôte le tiers médian, et il ne reste que les deux bords", () => {
    const s = poussiereDeCantor(9, { ...TIERS, profondeur: 1 });
    expect(s).toEqual([{ debut: 0, fin: 3 }, { debut: 6, fin: 9 }]);
  });

  it("LE NOMBRE DE SEGMENTS DOUBLE À CHAQUE NIVEAU, et la longueur se réduit des deux tiers", () => {
    for (const profondeur of [1, 2, 3, 4]) {
      const s = poussiereDeCantor(1, { ...TIERS, profondeur });
      expect(s.length, `niveau ${profondeur}`).toBe(2 ** profondeur);
      expect(mesureDeLaPoussiere(s)).toBeCloseTo((2 / 3) ** profondeur, 10);
    }
  });

  it("une profondeur nulle laisse le temps entier, et rien n'est un trou", () => {
    const s = poussiereDeCantor(10, { ...TIERS, profondeur: 0 });
    expect(s).toEqual([{ debut: 0, fin: 10 }]);
    expect(dansLaPoussiere(5, s)).toBe(true);
  });

  it("le bord ôté se choisit, et ce n'est pas le même ensemble", () => {
    const gauche = poussiereDeCantor(9, { parts: 3, otee: "gauche", profondeur: 1 });
    const droite = poussiereDeCantor(9, { parts: 3, otee: "droite", profondeur: 1 });
    expect(gauche).toEqual([{ debut: 3, fin: 6 }, { debut: 6, fin: 9 }]);
    expect(droite).toEqual([{ debut: 0, fin: 3 }, { debut: 3, fin: 6 }]);
  });

  it("une autre subdivision donne une autre poussière, et sa longueur suit la loi", () => {
    const s = poussiereDeCantor(1, { parts: 5, otee: "centre", profondeur: 2 });
    expect(s.length).toBe(16);
    expect(mesureDeLaPoussiere(s)).toBeCloseTo((4 / 5) ** 2, 10);
  });

  it("la récursion s'arrête avant de fabriquer des segments inaudibles", () => {
    // Le nombre de segments croît comme une puissance : sans borne, une profondeur élevée sur une
    // durée courte fabriquerait des millions de segments d'une microseconde.
    const s = poussiereDeCantor(1, { ...TIERS, profondeur: 30 });
    expect(s.length).toBeLessThan(5000);
    expect(s[0].fin - s[0].debut).toBeGreaterThan(0);
  });
});

describe("où l'on pose ce qui sort d'un trou", () => {
  const s = poussiereDeCantor(9, { ...TIERS, profondeur: 1 });

  it("LE PLUS PROCHE TOMBE BIEN DANS LA POUSSIÈRE, et du bon côté", () => {
    expect(plusProcheDansLaPoussiere(4, s)).toBeCloseTo(3, 5);   // le trou est ]3, 6[
    expect(plusProcheDansLaPoussiere(5, s)).toBeCloseTo(6, 5);
    expect(dansLaPoussiere(plusProcheDansLaPoussiere(4, s), s)).toBe(true);
    expect(dansLaPoussiere(plusProcheDansLaPoussiere(5, s), s)).toBe(true);
  });

  it("un instant déjà dans la poussière n'est pas déplacé", () => {
    expect(plusProcheDansLaPoussiere(1.5, s)).toBe(1.5);
  });

  it("LE TIRAGE SE FAIT SUR LA LONGUEUR, non sur le nombre de segments", () => {
    // Deux segments de longueurs très inégales doivent recevoir en proportion de leur longueur.
    const inegal = [{ debut: 0, fin: 9 }, { debut: 10, fin: 11 }];
    let dansLeLong = 0;
    let g = 1;
    const alea = () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
    for (let i = 0; i < 4000; i++) if (tireDansLaPoussiere(inegal, alea) < 9) dansLeLong++;
    expect(dansLeLong / 4000).toBeGreaterThan(0.85);
    expect(dansLeLong / 4000).toBeLessThan(0.95);
  });

  it("tout instant tiré tombe dans la poussière", () => {
    let g = 7;
    const alea = () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
    for (let i = 0; i < 500; i++) expect(dansLaPoussiere(tireDansLaPoussiere(s, alea), s)).toBe(true);
  });
});

describe("le déplacement à somme constante", () => {
  const SUITE = reguliere(64, 0.25);   // 64 événements sur 16 secondes

  it("LE COMPTE EST CONSERVÉ, et c'est le nom même de l'opération", () => {
    for (const ou of ["proche", "hasard"] as const) {
      for (const part of [0, 0.25, 0.5, 1]) {
        const r = deplacerSurCantor(SUITE, 16, { ...TIERS, part, ou, graine: 7 });
        expect(r.evenements.length, `${ou} à ${part}`).toBe(SUITE.length);
        expect(r.rapport.total).toBe(SUITE.length);
      }
    }
  });

  it("APRÈS UN DÉPLACEMENT COMPLET, PLUS RIEN N'EST DANS UN TROU", () => {
    const segments = poussiereDeCantor(16, TIERS);
    for (const ou of ["proche", "hasard"] as const) {
      const r = deplacerSurCantor(SUITE, 16, { ...TIERS, part: 1, ou, graine: 7 });
      const restes = r.evenements.filter((e) => !dansLaPoussiere(e.debut, segments));
      expect(restes, `${ou} : ${restes.length} événements restés dans un trou`).toEqual([]);
    }
  });

  it("À PART NULLE, RIEN NE BOUGE : la suite rendue est celle qu'on a donnée", () => {
    const r = deplacerSurCantor(SUITE, 16, { ...TIERS, part: 0, ou: "hasard", graine: 7 });
    expect(r.evenements).toEqual([...SUITE]);
    expect(r.rapport.deplaces).toBe(0);
    expect(r.rapport.dansLesTrous).toBeGreaterThan(0);
  });

  it("et la moitié des événements des trous bougent à une part d'un demi, à peu près", () => {
    const r = deplacerSurCantor(reguliere(400, 0.04), 16, { ...TIERS, part: 0.5, ou: "hasard", graine: 3 });
    const proportion = r.rapport.deplaces / r.rapport.dansLesTrous;
    expect(proportion).toBeGreaterThan(0.4);
    expect(proportion).toBeLessThan(0.6);
  });

  it("CE QUI ÉTAIT DÉJÀ DANS LA POUSSIÈRE N'EST JAMAIS TOUCHÉ", () => {
    const segments = poussiereDeCantor(16, TIERS);
    const dedans = SUITE.filter((e) => dansLaPoussiere(e.debut, segments));
    const r = deplacerSurCantor(SUITE, 16, { ...TIERS, part: 1, ou: "hasard", graine: 11 });
    for (const e of dedans) {
      expect(r.evenements.some((x) => x.note === e.note && x.debut === e.debut),
        `la note ${e.note} était déjà dans la poussière`).toBe(true);
    }
  });

  it("LA DURÉE SUIT L'ÉVÉNEMENT, et la poussière ne décrit que des attaques", () => {
    const r = deplacerSurCantor(SUITE, 16, { ...TIERS, part: 1, ou: "hasard", graine: 5 });
    for (const e of r.evenements) expect(e.fin - e.debut).toBeCloseTo(0.125, 9);
  });

  it("la suite rendue est triée, deux événements pouvant se croiser en se déplaçant", () => {
    const r = deplacerSurCantor(SUITE, 16, { ...TIERS, part: 1, ou: "hasard", graine: 9 });
    for (let i = 1; i < r.evenements.length; i++) {
      expect(r.evenements[i].debut).toBeGreaterThanOrEqual(r.evenements[i - 1].debut);
    }
  });

  it("LE DÉPLACEMENT AU PLUS PROCHE EST PLUS COURT QUE LE TIRAGE, et c'est sa raison d'être", () => {
    const proche = deplacerSurCantor(SUITE, 16, { ...TIERS, part: 1, ou: "proche", graine: 7 });
    const hasard = deplacerSurCantor(SUITE, 16, { ...TIERS, part: 1, ou: "hasard", graine: 7 });
    expect(proche.rapport.ecartMoyen).toBeLessThan(hasard.rapport.ecartMoyen);
  });

  it("LA MÊME GRAINE REND LA MÊME SUITE, et deux graines deux suites", () => {
    const suite = (graine: number) =>
      deplacerSurCantor(SUITE, 16, { ...TIERS, part: 1, ou: "hasard", graine })
        .evenements.map((e) => e.debut.toFixed(6)).join(",");
    expect(suite(7)).toBe(suite(7));
    expect(suite(7)).not.toBe(suite(8));
  });

  it("UN RÉGLAGE VOISIN DONNE UNE PIÈCE VOISINE : la part ne décale pas toute la suite des tirages", () => {
    // Le tirage se fait pour chaque événement des trous, même quand il ne bouge pas. Sans cela,
    // passer la part de 50 à 51 % changerait la place de TOUS les suivants.
    //
    // LA COMPARAISON SE FAIT SUR LES PAIRES, ET NON PAR INDEX : la suite est rendue TRIÉE, si bien
    // qu'un seul événement déplacé décale tous les suivants. Comparer index par index mesurerait ce
    // décalage et non ce qui a bougé, et donnait ici la moitié d'écart pour deux événements.
    const paires = (part: number) => new Set(
      deplacerSurCantor(SUITE, 16, { ...TIERS, part, ou: "hasard", graine: 7 })
        .evenements.map((e) => `${e.note}@${e.debut.toFixed(6)}`));
    const a = paires(0.5);
    const b = paires(0.52);
    const communs = [...a].filter((x) => b.has(x)).length;
    expect(communs / a.size, "la plupart des événements doivent rester en place").toBeGreaterThan(0.8);
  });

  it("une suite vide ne fait pas échouer l'opération", () => {
    const r = deplacerSurCantor([], 10, { ...TIERS, part: 1, ou: "hasard", graine: 7 });
    expect(r.evenements).toEqual([]);
    expect(r.rapport.total).toBe(0);
    expect(r.rapport.ecartMoyen).toBe(0);
  });

  it("le rapport dit ce que la poussière couvre, et cela décroît avec la profondeur", () => {
    const part = (profondeur: number) =>
      deplacerSurCantor(SUITE, 16, { ...TIERS, profondeur, part: 1, ou: "proche", graine: 7 })
        .rapport.partDeLaDuree;
    expect(part(1)).toBeCloseTo(2 / 3, 6);
    expect(part(3)).toBeCloseTo((2 / 3) ** 3, 6);
    expect(part(3)).toBeLessThan(part(1));
  });
});
