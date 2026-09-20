// audio/schillinger.test.ts — Les résultantes, vérifiées sur les figures que Schillinger publie.
//
// LA VALEUR DE RÉFÉRENCE N'EST PAS INVENTÉE : la résultante de 3 et 2 donne 2-1-1-2, la figure la
// plus citée du système. Si le code ne la retrouve pas, c'est lui qui se trompe.
import { describe, expect, it } from "vitest";
import {
  analyserResultante, cycleResultante, ecarts, pgcd, resultante,
} from "./schillinger";

describe("la résultante de deux pulsations", () => {
  it("3 CONTRE 2 DONNE 2-1-1-2, la figure de base du système", () => {
    const r = resultante(3, 2);
    expect(r).toEqual([0, 2, 3, 4]);
    expect(ecarts(r, 6)).toEqual([2, 1, 1, 2]);
  });

  it("4 contre 3 donne 3-1-2-2-1-3", () => {
    const r = resultante(4, 3);
    expect(r).toEqual([0, 3, 4, 6, 8, 9]);
    expect(ecarts(r, 12)).toEqual([3, 1, 2, 2, 1, 3]);
  });

  it("5 contre 3 donne 3-2-1-3-1-2-3", () => {
    expect(ecarts(resultante(5, 3), 15)).toEqual([3, 2, 1, 3, 1, 2, 3]);
  });

  it("le cycle dure le produit des deux périodes", () => {
    expect(cycleResultante(3, 2)).toBe(6);
    expect(cycleResultante(5, 4)).toBe(20);
    expect(ecarts(resultante(5, 4), 20).reduce((a, b) => a + b, 0)).toBe(20);
  });

  it("l'ordre des deux pulsations ne change rien", () => {
    expect(resultante(3, 2)).toEqual(resultante(2, 3));
  });

  it("l'instant zéro y est toujours : c'est là que les deux coïncident", () => {
    for (const [a, b] of [[3, 2], [5, 4], [7, 3], [8, 6]]) expect(resultante(a, b)[0]).toBe(0);
  });

  it("deux pulsations égales ne produisent qu'une pulsation", () => {
    expect(ecarts(resultante(3, 3), 9)).toEqual([3, 3, 3]);
  });

  it("une pulsation de un frappe partout", () => {
    expect(resultante(4, 1)).toEqual([0, 1, 2, 3]);
  });

  it("des valeurs absurdes sont ramenées à un, sans lever", () => {
    expect(() => resultante(0, -5)).not.toThrow();
    expect(resultante(0, 0)).toEqual([0]);
  });
});

describe("ce que le plus grand commun diviseur décide", () => {
  it("il vaut un quand les deux pulsations sont premières entre elles", () => {
    expect(pgcd(3, 2)).toBe(1);
    expect(pgcd(5, 3)).toBe(1);
  });

  it("4 CONTRE 2 N'EST PAS PLUS RICHE QUE 2 CONTRE 1 : c'est la même, deux fois plus lente", () => {
    const petit = ecarts(resultante(2, 1), 2);
    const grand = ecarts(resultante(4, 2), 8);
    // Le grand motif est le petit, chaque écart doublé, et répété deux fois.
    expect(grand).toEqual([...petit.map((x) => x * 2), ...petit.map((x) => x * 2)]);
  });

  it("l'analyse le dit plutôt que de laisser croire à un réglage sans effet", () => {
    expect(analyserResultante(4, 2).repetitions).toBe(2);
    expect(analyserResultante(4, 2).premieresEntreElles).toBe(false);
    expect(analyserResultante(6, 4).repetitions).toBe(2);
    expect(analyserResultante(3, 2).repetitions).toBe(1);
  });
});

describe("le palindrome", () => {
  it("LA RÉSULTANTE DE DEUX NOMBRES PREMIERS ENTRE EUX SE LIT PAREIL DANS LES DEUX SENS", () => {
    // Propriété de symétrie du cycle autour de son milieu, et non coïncidence : on l'éprouve sur
    // toutes les paires premières entre elles jusqu'à neuf.
    for (let a = 2; a <= 9; a++) {
      for (let b = 2; b < a; b++) {
        if (pgcd(a, b) !== 1) continue;
        const e = analyserResultante(a, b);
        expect(e.palindrome, `${a} contre ${b} : ${e.ecarts.join("-")}`).toBe(true);
      }
    }
  });

  it("2-1-1-2 en est un, et le test le voit", () => {
    expect(analyserResultante(3, 2).palindrome).toBe(true);
    expect(analyserResultante(3, 2).ecarts).toEqual([2, 1, 1, 2]);
  });
});

describe("l'analyse complète", () => {
  it("elle rend tout d'un coup, et les morceaux se tiennent", () => {
    const a = analyserResultante(5, 3);
    expect(a.cycle).toBe(15);
    expect(a.instants.length).toBe(a.ecarts.length);
    expect(a.ecarts.reduce((x, y) => x + y, 0)).toBe(a.cycle);
    expect(a.premieresEntreElles).toBe(true);
    expect(a.repetitions).toBe(1);
  });
});
