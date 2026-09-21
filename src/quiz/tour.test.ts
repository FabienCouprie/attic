// quiz/tour.test.ts — Ce qui fait qu'un quiz ne lasse pas, éprouvé plutôt qu'affirmé.
//
// LA DEMANDE DE DÉPART ÉTAIT « ASSEZ VASTE POUR NE PAS LASSER PAR DES RÉPÉTITIONS ». Cela se teste,
// et c'est l'objet de ce fichier : la série est une PERMUTATION (donc aucune répétition avant
// épuisement), les thèmes ALTERNENT (donc pas six sigles de suite), et la bonne réponse SE PROMÈNE
// (donc pas toujours la même lettre). Sans ces trois propriétés, la banque pourrait être immense et
// le quiz quand même lassant.
import { describe, expect, it } from "vitest";
import { serie, tourComplet, corriger, corrige, feuille, lettre, lireReponses, ecrireReponses, melanger, positionJuste, propositions } from "./tour";
import { BANQUE } from "./banque";
import { THEMES, type Question, type ThemeQuiz } from "./types";
import { creerAleatoire } from "../core/hasard";

/** Un vivier d'essai parfaitement régulier : six thèmes, dix questions chacun. */
function vivierEssai(parTheme = 10): Question[] {
  const out: Question[] = [];
  for (const theme of THEMES) {
    for (let i = 0; i < parTheme; i++) {
      out.push({
        id: `${theme}-${i}`, theme, niveau: 1,
        enonce: `énoncé ${theme} ${i}`, enonceEn: `statement ${theme} ${i}`,
        choix: ["juste", "faux 1", "faux 2", "faux 3"],
        pourquoi: "parce que.", pourquoiEn: "because.",
      });
    }
  }
  return out;
}

describe("le mélange", () => {
  it("garde tous les éléments", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const m = melanger(xs, creerAleatoire(3));
    expect([...m].sort((a, b) => a - b)).toEqual(xs);
  });

  it("ne modifie pas la liste qu'on lui donne", () => {
    const xs = [1, 2, 3, 4, 5];
    melanger(xs, creerAleatoire(3));
    expect(xs).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("un tour complet", () => {
  const vivier = vivierEssai();

  it("EST UNE PERMUTATION DU VIVIER — rien n'est perdu, rien n'est ajouté", () => {
    const t = tourComplet(vivier, 42);
    expect(t.length).toBe(vivier.length);
    expect(t.map((q) => q.id).sort()).toEqual(vivier.map((q) => q.id).sort());
  });

  it("deux graines donnent deux ordres différents", () => {
    expect(tourComplet(vivier, 1).map((q) => q.id)).not.toEqual(tourComplet(vivier, 2).map((q) => q.id));
  });

  it("la même graine redonne le même ordre", () => {
    expect(tourComplet(vivier, 7).map((q) => q.id)).toEqual(tourComplet(vivier, 7).map((q) => q.id));
  });

  it("LES THÈMES ALTERNENT : sur six thèmes à effectifs égaux, chaque tour de six en donne six", () => {
    const t = tourComplet(vivier, 11);
    for (let debut = 0; debut + 6 <= t.length; debut += 6) {
      const tranche = t.slice(debut, debut + 6).map((q) => q.theme);
      expect(new Set(tranche).size, `tranche à ${debut}`).toBe(6);
    }
  });

  it("l'ordre des thèmes n'est pas toujours le même d'un tour sur l'autre", () => {
    const t = tourComplet(vivier, 5).map((q) => q.theme);
    const premier = t.slice(0, 6).join(",");
    const second = t.slice(6, 12).join(",");
    expect(premier).not.toEqual(second);
  });
});

describe("une série", () => {
  const vivier = vivierEssai();

  it("AUCUNE RÉPÉTITION AVANT ÉPUISEMENT DU VIVIER", () => {
    const s = serie(vivier, 3, vivier.length);
    const ids = s.map((p) => p.question.id);
    expect(new Set(ids).size).toBe(vivier.length);
  });

  it("au second tour, chaque question revient une fois et l'ordre a changé", () => {
    const n = vivier.length;
    const s = serie(vivier, 3, 2 * n).map((p) => p.question.id);
    const premier = s.slice(0, n), second = s.slice(n);
    expect(new Set(premier).size).toBe(n);
    expect(new Set(second).size).toBe(n);
    expect(premier).not.toEqual(second);
  });

  it("une série plus courte que le vivier reste équilibrée entre les thèmes", () => {
    const s = serie(vivier, 9, 18);
    const comptes = new Map<ThemeQuiz, number>();
    for (const p of s) comptes.set(p.question.theme, (comptes.get(p.question.theme) ?? 0) + 1);
    for (const theme of THEMES) expect(comptes.get(theme), theme).toBe(3);
  });

  it("un vivier d'un seul thème ne pose pas de problème", () => {
    const un = vivier.filter((q) => q.theme === "sigles");
    expect(serie(un, 4, 5).length).toBe(5);
  });

  it("un vivier vide ne fait pas boucler", () => {
    expect(serie([], 1, 10)).toEqual([]);
    expect(serie(vivier, 1, 0)).toEqual([]);
  });

  it("LA BONNE RÉPONSE SE PROMÈNE : elle n'est pas toujours en A", () => {
    const s = serie(BANQUE, 12345, BANQUE.length);
    const comptes = [0, 0, 0, 0];
    for (const p of s) comptes[positionJuste(p)]++;
    // Chaque position reçoit une part raisonnable : le déséquilibre d'un tirage, pas un biais.
    for (let i = 0; i < 4; i++) {
      expect(comptes[i], `position ${lettre(i)}`).toBeGreaterThan(BANQUE.length / 8);
    }
    expect(comptes.reduce((a, b) => a + b, 0)).toBe(BANQUE.length);
  });

  it("les propositions montrées sont bien celles de la question, réordonnées", () => {
    const s = serie(BANQUE, 77, 30);
    for (const p of s) {
      expect(propositions(p, false).slice().sort()).toEqual(p.question.choix.slice().sort());
      expect(propositions(p, false)[positionJuste(p)]).toBe(p.question.choix[0]);
    }
  });

  it("deux questions voisines ne partagent pas leur permutation de propositions", () => {
    const s = serie(BANQUE, 4, 40);
    const ordres = new Set(s.map((p) => p.ordre.join("")));
    expect(ordres.size).toBeGreaterThan(4);
  });
});

describe("la lecture des réponses", () => {
  it("accepte les minuscules, les espaces et les séparateurs", () => {
    expect(lireReponses("A b, C\nd")).toEqual([0, 1, 2, 3]);
  });

  it("un point vaut une question sautée, sans décaler les suivantes", () => {
    expect(lireReponses("A.C")).toEqual([0, -1, 2]);
  });

  it("ignore ce qui n'est pas une proposition", () => {
    expect(lireReponses("A E Z 9 B")).toEqual([0, 1]);
  });

  it("se relit elle-même", () => {
    expect(ecrireReponses(lireReponses("ABCD.A"))).toBe("ABCD.A");
  });
});

describe("la correction", () => {
  const vivier = vivierEssai();
  const s = serie(vivier, 21, 12);
  const justes = s.map((p) => positionJuste(p));

  it("tout juste donne le score plein", () => {
    const bilan = corriger(s, justes);
    expect(bilan.justes).toBe(12);
    expect(bilan.repondues).toBe(12);
    expect(bilan.manquees).toEqual([]);
  });

  it("une faute est relevée avec ce qui a été répondu", () => {
    const reponses = [...justes];
    reponses[3] = (justes[3] + 1) % 4;
    const bilan = corriger(s, reponses);
    expect(bilan.justes).toBe(11);
    expect(bilan.manquees.length).toBe(1);
    expect(bilan.manquees[0].rang).toBe(3);
    expect(bilan.manquees[0].donnee).toBe(reponses[3]);
  });

  it("une question sautée ne compte ni juste ni fausse", () => {
    const reponses = [...justes];
    reponses[0] = -1;
    const bilan = corriger(s, reponses);
    expect(bilan.repondues).toBe(11);
    expect(bilan.justes).toBe(11);
    expect(bilan.manquees).toEqual([]);
  });

  it("le relevé par thème additionne bien au total", () => {
    const bilan = corriger(s, justes);
    const somme = bilan.parTheme.reduce((a, t) => a + t.repondues, 0);
    expect(somme).toBe(bilan.repondues);
  });

  it("des réponses plus courtes que la série corrigent ce qui existe", () => {
    const bilan = corriger(s, justes.slice(0, 4));
    expect(bilan.repondues).toBe(4);
    expect(bilan.total).toBe(12);
  });
});

describe("les deux textes", () => {
  const s = serie(BANQUE, 31, 5);

  it("LE QUESTIONNAIRE NE RÉVÈLE RIEN : ni la bonne réponse, ni l'explication", () => {
    const texte = feuille(s, false, 31);
    for (const p of s) {
      expect(texte).toContain(p.question.enonce);
      expect(texte).not.toContain(p.question.pourquoi);
    }
    // Aucune marque ne distingue la bonne proposition des trois autres.
    expect(texte).not.toMatch(/[+x] +\d+\./);
  });

  it("le questionnaire numérote et étiquette de A à D", () => {
    const texte = feuille(s, false);
    expect(texte).toContain("1. [");
    for (const l of ["A.", "B.", "C.", "D."]) expect(texte).toContain(l);
  });

  it("le corrigé donne la lettre juste, l'explication et le score", () => {
    const reponses = s.map((p) => positionJuste(p));
    const texte = corrige(s, reponses, false);
    expect(texte).toContain("Score : 5 / 5");
    for (const p of s) expect(texte).toContain(p.question.pourquoi);
  });

  it("le corrigé signale ce qui a été répondu quand c'est faux", () => {
    const reponses = s.map((p) => (positionJuste(p) + 1) % 4);
    const texte = corrige(s, reponses, false);
    expect(texte).toContain("répondu");
    expect(texte).toContain("Score : 0 / 5");
  });

  it("les deux textes existent en anglais, et ne sont pas les français", () => {
    expect(feuille(s, true)).not.toEqual(feuille(s, false));
    expect(corrige(s, [], true)).toContain("ANSWER KEY");
  });

  it("un corrigé sans aucune réponse ne prétend pas à un score", () => {
    const texte = corrige(s, [], false);
    expect(texte).not.toContain("Score");
  });
});
