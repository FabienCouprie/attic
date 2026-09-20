// audio/csound-aleatoire.test.ts — Un tirage se vérifie par ses STATISTIQUES, pas par son résultat.
//
// On ne peut pas comparer une partition tirée au sort à une partition attendue : il n'y en a pas. Ce
// qui se vérifie, ce sont les LOIS — et elles se vérifient sur beaucoup de tirages, par leurs
// moments. Un processus de Poisson a un écart-type d'intervalles ÉGAL à leur moyenne ; une grille l'a
// nul. Une loi gaussienne bornée a une moyenne au centre de ses bornes et un écart-type prévisible ;
// une loi uniforme a un écart-type de (haut − bas)/√12.
//
// Les tirages sont ensemencés : chaque test est reproductible, et un tirage qui se mettrait à dériver
// le dirait au lieu d'échouer une fois sur dix.
import { describe, expect, it } from "vitest";
import { creerAleatoire } from "../core";
import {
  composerAleatoire, gaussienne, instantsAleatoires, statsLisibles, tirerEntre, tirerHauteur,
  type OptionsAleatoire,
} from "./csound-aleatoire";
import { constante } from "./courbe";

const MAJEUR = [0, 2, 4, 5, 7, 9, 11];

const options = (o: Partial<OptionsAleatoire> = {}): OptionsAleatoire => ({
  duree: 20, densite: 5, repartition: "poisson", instruments: 1,
  noteBasse: 48, noteHaute: 84, degres: MAJEUR, loiHauteur: "uniforme",
  dureeMin: 0.2, dureeMax: 1, velociteMin: 60, velociteMax: 110,
  hasard: creerAleatoire(7), ...o,
});

describe("la loi normale", () => {
  it("est bien centrée et réduite sur dix mille tirages", () => {
    const h = creerAleatoire(1);
    const x = Array.from({ length: 10000 }, () => gaussienne(h));
    const moyenne = x.reduce((s, v) => s + v, 0) / x.length;
    const ecart = Math.sqrt(x.reduce((s, v) => s + (v - moyenne) ** 2, 0) / x.length);
    expect(Math.abs(moyenne)).toBeLessThan(0.05);
    expect(ecart).toBeGreaterThan(0.95);
    expect(ecart).toBeLessThan(1.05);
  });

  it("ne renvoie jamais l'infini, même si le générateur rend zéro", () => {
    // `Math.log(0)` vaut −∞ : le tirage prend `1 − u` pour que ce cas n'arrive pas.
    let premier = true;
    const h = () => { if (premier) { premier = false; return 0; } return 0.5; };
    expect(Number.isFinite(gaussienne(h))).toBe(true);
  });
});

describe("les instants d'attaque", () => {
  it("POISSON : l'écart-type des intervalles ÉGALE leur moyenne", () => {
    // C'est la signature de la loi exponentielle, et donc du processus de Poisson. Sur deux mille
    // événements, le rapport doit tomber à quelques pour cent de 1.
    const instants = instantsAleatoires(400, 5, "poisson", creerAleatoire(3));
    const intervalles = instants.slice(1).map((t, i) => t - instants[i]);
    const moyenne = intervalles.reduce((s, v) => s + v, 0) / intervalles.length;
    const ecart = Math.sqrt(intervalles.reduce((s, v) => s + (v - moyenne) ** 2, 0) / intervalles.length);
    expect(instants.length).toBeGreaterThan(1500);
    expect(moyenne).toBeCloseTo(0.2, 1);       // 1/densité
    expect(ecart / moyenne).toBeGreaterThan(0.9);
    expect(ecart / moyenne).toBeLessThan(1.1);
  });

  it("GRILLE : les intervalles sont tous égaux, écart-type nul", () => {
    const instants = instantsAleatoires(10, 4, "grille", creerAleatoire(3));
    const intervalles = instants.slice(1).map((t, i) => t - instants[i]);
    for (const dt of intervalles) expect(dt).toBeCloseTo(0.25, 10);
    expect(instants.length).toBe(40);
  });

  it("tient la durée demandée, et la densité en moyenne", () => {
    const instants = instantsAleatoires(100, 3, "poisson", creerAleatoire(11));
    expect(Math.max(...instants)).toBeLessThan(100);
    expect(instants.length / 100).toBeGreaterThan(2.5);
    expect(instants.length / 100).toBeLessThan(3.5);
  });

  it("la courbe module la densité SANS déformer la loi — par amincissement", () => {
    // Une courbe plate à 0,25 doit diviser la densité par quatre, et laisser les intervalles
    // exponentiels : leur écart-type reste égal à leur moyenne.
    const pleine = instantsAleatoires(200, 8, "poisson", creerAleatoire(5));
    const amincie = instantsAleatoires(200, 8, "poisson", creerAleatoire(5), constante(0.25, 200, 10));
    expect(amincie.length / pleine.length).toBeGreaterThan(0.2);
    expect(amincie.length / pleine.length).toBeLessThan(0.3);
    const intervalles = amincie.slice(1).map((t, i) => t - amincie[i]);
    const moyenne = intervalles.reduce((s, v) => s + v, 0) / intervalles.length;
    const ecart = Math.sqrt(intervalles.reduce((s, v) => s + (v - moyenne) ** 2, 0) / intervalles.length);
    expect(ecart / moyenne).toBeGreaterThan(0.85);
    expect(ecart / moyenne).toBeLessThan(1.15);
  });

  it("reste borné même à densité déraisonnable", () => {
    const instants = instantsAleatoires(10, 5000, "poisson", creerAleatoire(2));
    expect(instants.length).toBeLessThan(10 * 5000 * 4 + 200);
  });
});

describe("les hauteurs", () => {
  const h = () => creerAleatoire(13);

  it("restent dans l'étendue et dans la gamme", () => {
    const hasard = h();
    for (let i = 0; i < 500; i++) {
      const note = tirerHauteur(48, 72, MAJEUR, "uniforme", hasard);
      expect(note).toBeGreaterThanOrEqual(48);
      expect(note).toBeLessThanOrEqual(72);
      expect(MAJEUR).toContain(((note % 12) + 12) % 12);
    }
  });

  it("la loi gaussienne se serre autour du centre, l'uniforme non", () => {
    const centre = (48 + 84) / 2;
    const uniformes: number[] = [], gaussiennes: number[] = [];
    const hu = creerAleatoire(21), hg = creerAleatoire(21);
    for (let i = 0; i < 2000; i++) {
      uniformes.push(tirerHauteur(48, 84, [], "uniforme", hu));
      gaussiennes.push(tirerHauteur(48, 84, [], "gaussienne", hg));
    }
    const sigma = (x: number[]) => {
      const m = x.reduce((s, v) => s + v, 0) / x.length;
      return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / x.length);
    };
    const moyenneG = gaussiennes.reduce((s, v) => s + v, 0) / gaussiennes.length;
    expect(Math.abs(moyenneG - centre)).toBeLessThan(2);
    // Une uniforme sur 36 demi-tons a un écart-type de 36/√12 ≈ 10,4 ; la gaussienne repliée, moins.
    expect(sigma(uniformes)).toBeGreaterThan(9);
    expect(sigma(gaussiennes)).toBeLessThan(sigma(uniformes));
  });

  it("REPLIE les valeurs hors bornes au lieu de les écrêter", () => {
    // Écrêter entasserait les notes sur les deux extrêmes : on vérifie qu'aucune borne n'est
    // sur-représentée.
    const hasard = creerAleatoire(31);
    const comptes = new Map<number, number>();
    for (let i = 0; i < 3000; i++) {
      const n = tirerHauteur(60, 72, [], "gaussienne", hasard);
      comptes.set(n, (comptes.get(n) ?? 0) + 1);
    }
    const auxBornes = (comptes.get(60) ?? 0) + (comptes.get(72) ?? 0);
    expect(auxBornes / 3000).toBeLessThan(0.15);
  });

  it("accepte une étendue réduite à une seule note", () => {
    expect(tirerHauteur(60, 60, MAJEUR, "gaussienne", creerAleatoire(5))).toBe(60);
  });
});

describe("les valeurs entre bornes", () => {
  it("l'uniforme couvre toute la plage, la gaussienne s'y concentre", () => {
    const hu = creerAleatoire(41), hg = creerAleatoire(41);
    const u: number[] = [], g: number[] = [];
    for (let i = 0; i < 2000; i++) {
      u.push(tirerEntre(0, 10, "uniforme", hu));
      g.push(tirerEntre(0, 10, "gaussienne", hg));
    }
    const sigma = (x: number[]) => {
      const m = x.reduce((s, v) => s + v, 0) / x.length;
      return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / x.length);
    };
    // Une uniforme sur [0,10] a un écart-type de 10/√12 ≈ 2,89.
    expect(sigma(u)).toBeGreaterThan(2.6);
    expect(sigma(u)).toBeLessThan(3.1);
    expect(sigma(g)).toBeLessThan(sigma(u));
    for (const v of [...u, ...g]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(10); }
  });

  it("supporte des bornes écrites à l'envers", () => {
    const v = tirerEntre(10, 2, "uniforme", creerAleatoire(9));
    expect(v).toBeGreaterThanOrEqual(2);
    expect(v).toBeLessThanOrEqual(10);
  });
});

describe("la composition", () => {
  it("rend des événements cohérents : durées, vélocités et instruments dans leurs bornes", () => {
    const { evenements } = composerAleatoire(options({ instruments: 3, duree: 30 }));
    expect(evenements.length).toBeGreaterThan(50);
    for (const e of evenements) {
      expect(e.fin - e.debut).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(e.fin - e.debut).toBeLessThanOrEqual(1 + 1e-9);
      expect(e.velocite).toBeGreaterThanOrEqual(60);
      expect(e.velocite).toBeLessThanOrEqual(110);
      expect(e.canal).toBeGreaterThanOrEqual(0);
      expect(e.canal).toBeLessThan(3);
      expect(e.debut).toBeLessThan(30);
    }
  });

  it("répartit les événements entre les instruments demandés", () => {
    const { stats } = composerAleatoire(options({ instruments: 4, duree: 60 }));
    expect(stats.parInstrument).toHaveLength(4);
    for (const n of stats.parInstrument) expect(n).toBeGreaterThan(stats.evenements / 10);
  });

  it("MESURE ce qu'elle a produit, et non ce qu'on lui a demandé", () => {
    const { stats, evenements } = composerAleatoire(options({ duree: 40, densite: 6 }));
    expect(stats.evenements).toBe(evenements.length);
    expect(stats.densiteReelle).toBeCloseTo(evenements.length / 40, 6);
    // Le nombre réel n'est PAS le nombre demandé : c'est un tirage.
    expect(stats.evenements).not.toBe(240);
    expect(stats.densiteReelle).toBeGreaterThan(5);
    expect(stats.densiteReelle).toBeLessThan(7);
  });

  it("ajoute un champ libre seulement quand on en demande un", () => {
    const sans = composerAleatoire(options());
    expect(sans.evenements.every((e) => e.libre === undefined)).toBe(true);
    const avec = composerAleatoire(options({ libreMin: 100, libreMax: 200 }));
    for (const e of avec.evenements) {
      expect(e.libre).toBeGreaterThanOrEqual(100);
      expect(e.libre).toBeLessThanOrEqual(200);
    }
  });

  it("est REPRODUCTIBLE : même graine, même partition", () => {
    const a = composerAleatoire(options({ hasard: creerAleatoire(99) }));
    const b = composerAleatoire(options({ hasard: creerAleatoire(99) }));
    expect(a.evenements).toEqual(b.evenements);
    const c = composerAleatoire(options({ hasard: creerAleatoire(100) }));
    expect(c.evenements).not.toEqual(a.evenements);
  });
});

describe("les statistiques lisibles", () => {
  it("annoncent le rapport qui distingue un nuage d'une pulsation", () => {
    const poisson = composerAleatoire(options({ duree: 100, repartition: "poisson" }));
    const texte = statsLisibles(poisson.stats, "poisson");
    expect(texte).toContain("processus de Poisson");
    expect(texte).toMatch(/rapport (0,9|0\.9|1[.,]0|1[.,]1)/);
    const grille = composerAleatoire(options({ duree: 100, repartition: "grille" }));
    const texteGrille = statsLisibles(grille.stats, "grille");
    expect(texteGrille).toContain("grille régulière");
    expect(texteGrille).toContain("rapport 0.00");
  });

  it("disent le compte par instrument, et se traduisent", () => {
    const { stats } = composerAleatoire(options({ instruments: 2 }));
    expect(statsLisibles(stats, "poisson")).toContain("par instrument : i1=");
    expect(statsLisibles(stats, "poisson", true)).toContain("per instrument: i1=");
  });
});
