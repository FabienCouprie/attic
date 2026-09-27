// audio/contraintes-ecrites.test.ts — Des règles écrites, et ce qu'elles doivent refuser.
//
// CE QUI SE VÉRIFIE ICI TIENT EN DEUX POINTS. Que la règle écrite fasse ce qu'elle dit, ce qui se
// contrôle en la donnant au solveur et en repassant sa solution à la règle. Et surtout qu'une faute
// ne se déguise pas en impossibilité : une règle illisible doit être écartée et dite, non refuser
// tout, faute de quoi le solveur prouverait très sérieusement qu'il n'y a pas de solution là où il
// y avait une erreur de frappe.
import { describe, expect, it } from "vitest";

import { domaineHauteurs, resoudre } from "./contraintes";
import { compilerRegles, VARIABLES_REGLE } from "./contraintes-ecrites";

const gamme = domaineHauteurs(60, 72, [0, 2, 4, 5, 7, 9, 11]);
const domaines = (n: number) => new Array(n).fill(gamme);

/** Compile puis cherche, et rend la première solution. */
function chercher(regles: Record<string, string>, n = 6, o = {}) {
  const { contraintes, erreurs } = compilerRegles(
    Object.entries(regles).map(([nom, texte]) => ({ nom, texte })),
  );
  return { ...resoudre(domaines(n), contraintes, { graine: 3, ordonne: true, ...o }), erreurs };
}

describe("ce qu'une règle écrite sait dire", () => {
  it("UN ÉCART MAXIMAL", () => {
    const r = chercher({ ecart: "abs(x - precedent) <= 2" });
    expect(r.solutions).toHaveLength(1);
    const s = r.solutions[0];
    for (let i = 1; i < s.length; i++) expect(Math.abs(s[i] - s[i - 1])).toBeLessThanOrEqual(2);
  });

  it("PAS DEUX FOIS LA MÊME NOTE DE SUITE", () => {
    const s = chercher({ repetition: "i == 0 or x != precedent" }).solutions[0];
    for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
  });

  it("UNE PLACE IMPOSÉE, par le rang", () => {
    const s = chercher({ debut: "i != 0 or x == 60" }).solutions[0];
    expect(s[0]).toBe(60);
  });

  it("UNE RÈGLE DE FIN NE MORD QU'À LA FIN, grâce à « complet »", () => {
    // Sans le garde « complet == 0 or », la somme serait exigée dès la première place et rien ne
    // passerait.
    const r = chercher({ fin: "complet == 0 or x == 72" }, 4);
    expect(r.solutions).toHaveLength(1);
    expect(r.solutions[0][3]).toBe(72);
  });

  it("UNE SOMME À ATTEINDRE, qui ne se juge qu'une fois tout posé", () => {
    const r = chercher({ somme: "complet == 0 or somme == 366" }, 6);
    expect(r.solutions).toHaveLength(1);
    expect(r.solutions[0].reduce((a, b) => a + b, 0)).toBe(366);
  });

  it("UNE ÉTENDUE BORNÉE, par le plus petit et le plus grand", () => {
    const s = chercher({ ambitus: "plusGrand - plusPetit <= 4" }).solutions[0];
    expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(4);
  });

  it("PLUSIEURS RÈGLES À LA FOIS", () => {
    const s = chercher({
      ecart: "abs(x - precedent) <= 4",
      repetition: "i == 0 or x != precedent",
      montee: "i == 0 or x >= premier",
    }).solutions[0];
    for (let i = 1; i < s.length; i++) {
      expect(Math.abs(s[i] - s[i - 1])).toBeLessThanOrEqual(4);
      expect(s[i]).not.toBe(s[i - 1]);
      expect(s[i]).toBeGreaterThanOrEqual(s[0]);
    }
  });

  it("LES DEUX JEUX DE NOMS DONNENT LE MÊME RÉSULTAT", () => {
    const fr = chercher({ r: "abs(x - precedent) <= 2 and x != premier * 0" });
    const en = chercher({ r: "abs(x - previous) <= 2 and x != first * 0" });
    expect(en.solutions[0]).toEqual(fr.solutions[0]);
  });

  it("CHAQUE VARIABLE ANNONCÉE SE LIT, dans les deux langues", () => {
    for (const langue of ["fr", "en"] as const) {
      for (const v of VARIABLES_REGLE[langue]) {
        const { contraintes, erreurs } = compilerRegles([{ nom: "t", texte: `${v} == ${v}` }]);
        expect(erreurs, `${langue} ${v}`).toEqual([]);
        expect(contraintes[0].admet([60, 62], 1, true), `${langue} ${v}`).toBe(true);
      }
    }
  });
});

describe("ce qu'une faute ne doit pas devenir", () => {
  it("UNE RÈGLE ILLISIBLE EST ÉCARTÉE ET DITE, non subie", () => {
    const r = chercher({ faute: "x >" });
    expect(r.erreurs).toHaveLength(1);
    expect(r.erreurs[0]).toContain("faute");
    // Et la recherche aboutit, la règle fautive ayant été retirée plutôt que d'interdire tout.
    expect(r.solutions).toHaveLength(1);
  });

  it("UNE VARIABLE INCONNUE EST PRISE À LA COMPILATION, non à chaque essai", () => {
    const r = chercher({ inconnue: "x > inconnue" });
    expect(r.erreurs).toHaveLength(1);
    expect(r.solutions).toHaveLength(1);
  });

  it("UNE RÈGLE VIDE N'EST PAS UNE RÈGLE", () => {
    const { contraintes, erreurs } = compilerRegles([
      { nom: "a", texte: "" }, { nom: "b", texte: "   " },
    ]);
    expect(contraintes).toHaveLength(0);
    expect(erreurs).toHaveLength(0);
  });

  it("UNE RÈGLE QUI NE REND PAS UN BOOLÉEN EST LUE COMME UN NOMBRE : zéro refuse", () => {
    const { contraintes } = compilerRegles([{ nom: "n", texte: "x - 60" }]);
    expect(contraintes[0].admet([60], 0, false)).toBe(false);
    expect(contraintes[0].admet([62], 0, false)).toBe(true);
  });

  it("aucune règle laisse le solveur libre", () => {
    const { contraintes } = compilerRegles([]);
    expect(contraintes).toHaveLength(0);
    expect(resoudre(domaines(3), contraintes, { ordonne: true }).solutions).toHaveLength(1);
  });
});

describe("ce que le solveur garde", () => {
  it("UNE RÈGLE IMPOSSIBLE REND UNE ABSENCE DE SOLUTION, non un abandon", () => {
    const r = chercher({ jamais: "x > 200" }, 4, { budget: 100000 });
    expect(r.solutions).toHaveLength(0);
    expect(r.abandonne).toBe(false);
    expect(r.regleBloquante).toBe("jamais");
  });

  it("QUAND RIEN N'EST REFUSÉ, AUCUNE RÈGLE N'EST NOMMÉE", () => {
    // Le domaine est parcouru dans l'ordre et sa première valeur convient : la recherche aboutit
    // sans qu'une seule règle ait eu à refuser, et il n'y a donc personne à nommer. Le nom vide est
    // la bonne réponse, et non un défaut du compte.
    const r = chercher({ ecart: "abs(x - precedent) <= 0", debut: "i != 0 or x == 60" }, 5);
    expect(r.solutions[0]).toEqual([60, 60, 60, 60, 60]);
    expect(r.regleBloquante).toBe("");
  });

  it("LA RÈGLE QUI BLOQUE EST NOMMÉE PAR SON NOM ÉCRIT, dès qu'il y a des refus", () => {
    // La première place est imposée au sommet du domaine : tout ce qui vient avant est refusé.
    const r = chercher({ debut: "i != 0 or x == 72" }, 3);
    expect(r.solutions[0][0]).toBe(72);
    expect(r.regleBloquante).toBe("debut");
  });
});
