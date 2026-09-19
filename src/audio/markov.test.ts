// audio/markov.test.ts — Une chaîne qui imite sans copier, et qu'on peut lire.
//
// L'intérêt d'une chaîne de Markov, face au générateur neuronal déjà présent, est qu'elle
// s'explique : la table est une liste de comptes. Ces tests vérifient donc les deux
// choses qui comptent — la table dit VRAIMENT ce qu'on a vu dans le morceau, et l'ordre
// fait bien ce qu'on lui prête, jusqu'au point où la chaîne n'a plus le choix et recopie.
import { describe, expect, it } from "vitest";
import { apprendre, cle, engendrer, statistiques, tableEnTexte } from "./markov";

const suite = (hauteurs: number[]) =>
  hauteurs.map((note, i) => ({ note, velocite: 90, debut: i * 0.5, fin: i * 0.5 + 0.4 }));

/** Générateur déterministe : un test qui tire au sort doit être rejouable. */
function hasardFixe(graine: number) {
  let x = graine >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

describe("apprentissage", () => {
  it("compte ce qu'il a vu, et rien d'autre", () => {
    const t = apprendre(suite([60, 62, 64, 62, 60]), 1);
    expect(t.get(cle([60]))).toEqual(new Map([[62, 1]]));
    expect(t.get(cle([62]))).toEqual(new Map([[64, 1], [60, 1]]));
    expect(t.get(cle([64]))).toEqual(new Map([[62, 1]]));
    // La dernière note n'a pas de suite : elle n'ouvre aucun contexte.
    expect(t.has(cle([60, 62]))).toBe(false);
  });

  it("additionne les répétitions : c'est ce qui fera pencher le tirage", () => {
    const t = apprendre(suite([60, 62, 60, 62, 60, 64]), 1);
    expect(t.get(cle([60]))).toEqual(new Map([[62, 2], [64, 1]]));
  });

  it("regarde k notes en arrière quand on le lui demande", () => {
    const t = apprendre(suite([60, 62, 64, 60, 62, 65]), 2);
    // Après do-ré, on a vu mi une fois et fa une fois.
    expect(t.get(cle([60, 62]))).toEqual(new Map([[64, 1], [65, 1]]));
  });

  it("lit un accord du grave vers l'aigu — simplification assumée", () => {
    const accord = [
      { note: 67, velocite: 90, debut: 0, fin: 1 },
      { note: 60, velocite: 90, debut: 0, fin: 1 },
      { note: 64, velocite: 90, debut: 0, fin: 1 },
      { note: 72, velocite: 90, debut: 1, fin: 2 },
    ];
    const t = apprendre(accord, 1);
    expect(t.get(cle([60]))).toEqual(new Map([[64, 1]]));
    expect(t.get(cle([64]))).toEqual(new Map([[67, 1]]));
  });

  it("ne rend rien d'un morceau trop court pour l'ordre demandé", () => {
    expect(apprendre(suite([60, 62]), 3).size).toBe(0);
    expect(apprendre([], 1).size).toBe(0);
  });

  it("borne l'ordre plutôt que de fabriquer des contextes absurdes", () => {
    expect(apprendre(suite([60, 62, 64, 65, 67, 69]), 99).size).toBeGreaterThan(0);
    expect(apprendre(suite([60, 62, 64, 65]), 0).size).toBeGreaterThan(0);
  });
});

describe("génération", () => {
  it("ne produit que des enchaînements observés", () => {
    const source = [60, 62, 64, 65, 67, 65, 64, 62, 60];
    const t = apprendre(suite(source), 1);
    const sortie = engendrer(t, 1, 60, hasardFixe(7));
    expect(sortie.length).toBe(60);
    for (let i = 0; i + 1 < sortie.length; i++) {
      const suites = t.get(cle([sortie[i]]));
      // Soit l'enchaînement a été observé, soit la chaîne est repartie d'ailleurs —
      // auquel cas la note suivante ouvre un contexte connu.
      const observe = suites?.has(sortie[i + 1]) ?? false;
      const redemarrage = t.has(cle([sortie[i + 1]]));
      expect(observe || redemarrage, `${sortie[i]} → ${sortie[i + 1]}`).toBe(true);
    }
  });

  it("boucle exactement sur un motif qui ne laisse aucun choix", () => {
    // do-ré-mi répété : à l'ordre 1, chaque note n'a qu'une suite possible.
    const t = apprendre(suite([60, 62, 64, 60, 62, 64, 60, 62, 64]), 1);
    const sortie = engendrer(t, 1, 9, hasardFixe(1), [60]);
    expect(sortie).toEqual([60, 62, 64, 60, 62, 64, 60, 62, 64]);
  });

  it("rejoue la même chose à graine égale, et autre chose à graine différente", () => {
    const t = apprendre(suite([60, 62, 64, 62, 67, 64, 60, 65, 62]), 1);
    const a = engendrer(t, 1, 40, hasardFixe(3));
    const b = engendrer(t, 1, 40, hasardFixe(3));
    const c = engendrer(t, 1, 40, hasardFixe(99));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("repart d'un contexte connu au lieu de s'arrêter en cul-de-sac", () => {
    // 67 n'a aucune suite : la chaîne doit continuer malgré tout.
    const t = apprendre(suite([60, 62, 60, 62, 67]), 1);
    const sortie = engendrer(t, 1, 30, hasardFixe(5), [67]);
    expect(sortie.length).toBe(30);
  });

  it("part du contexte donné quand on en fournit un", () => {
    const t = apprendre(suite([60, 62, 64, 65, 67]), 2);
    expect(engendrer(t, 2, 5, hasardFixe(2), [62, 64]).slice(0, 2)).toEqual([62, 64]);
  });

  it("ne rend rien d'une table vide", () => {
    expect(engendrer(new Map(), 1, 20, hasardFixe(1))).toEqual([]);
  });
});

describe("ce que la table dit d'elle-même", () => {
  it("compte les contextes sans choix — la mesure du sur-apprentissage", () => {
    const source = [60, 62, 64, 65, 67, 69, 71, 72];
    const ordre1 = statistiques(apprendre(suite(source), 1));
    const ordre3 = statistiques(apprendre(suite(source), 3));
    // Sur une gamme jouée une fois, tout contexte n'a qu'une suite : la chaîne recopie.
    expect(ordre1.partSansChoix).toBe(1);
    expect(ordre3.partSansChoix).toBe(1);
    // Avec des répétitions, l'ordre 1 laisse du choix, l'ordre 3 beaucoup moins.
    const varie = [60, 62, 60, 64, 60, 65, 62, 64, 60, 62, 67, 60];
    const v1 = statistiques(apprendre(suite(varie), 1));
    const v3 = statistiques(apprendre(suite(varie), 3));
    expect(v1.partSansChoix).toBeLessThan(v3.partSansChoix);
  });

  it("annonce des chiffres cohérents", () => {
    const t = apprendre(suite([60, 62, 60, 62, 64]), 1);
    const s = statistiques(t);
    expect(s.contextes).toBe(t.size);
    expect(s.transitions).toBeGreaterThanOrEqual(s.contextes);
    expect(s.sansChoix).toBeLessThanOrEqual(s.contextes);
  });

  it("écrit la table en noms de notes et en pourcentages", () => {
    const texte = tableEnTexte(apprendre(suite([60, 62, 60, 62, 60, 64]), 1));
    expect(texte).toContain("C4");
    expect(texte).toContain("⇒");
    expect(texte).toMatch(/\d+%/);
  });

  it("ne déroule pas cent lignes : les contextes les plus fréquents d'abord", () => {
    const longue = Array.from({ length: 300 }, (_, i) => 48 + (i % 40));
    const texte = tableEnTexte(apprendre(suite(longue), 1), 5);
    expect(texte.split("\n").length).toBe(5);
  });
});
