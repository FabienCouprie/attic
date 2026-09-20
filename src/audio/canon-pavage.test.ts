// audio/canon-pavage.test.ts — L'invariant est parfait : une frappe par pulsation, jamais deux.
//
// Ce module a la chance rare d'avoir un critère de vérité exact et vérifiable en comptant.
// Tous les tests en découlent : ce que le solveur rend doit paver, ce qu'il déclare
// impossible doit l'être vraiment, et les notes écrites doivent reproduire exactement la
// grille trouvée.
import { describe, expect, it } from "vitest";
import {
  canonEnNotes, canonEnTexte, chercherEntrees, chercherMotifs, construire, couverture,
  estPeriodique, pave,
} from "./canon-pavage";

describe("couverture", () => {
  it("compte les frappes de chaque pulsation", () => {
    expect(couverture([0, 1], [0, 2], 4)).toEqual([1, 1, 1, 1]);
    expect(couverture([0, 1], [0, 1], 4)).toEqual([1, 2, 1, 0]);
  });

  it("referme le cycle : une frappe au-delà du tour revient au début", () => {
    expect(couverture([0, 1], [3], 4)).toEqual([1, 0, 0, 1]);
  });
});

describe("pavage", () => {
  it("reconnaît les pavages les plus simples", () => {
    expect(pave([0, 1], [0, 2], 4)).toBe(true);
    expect(pave([0, 1, 2], [0, 3], 6)).toBe(true);
    expect(pave([0, 2, 4], [0, 1], 6)).toBe(true);
  });

  it("refuse un recouvrement et un trou", () => {
    expect(pave([0, 1], [0, 1], 4)).toBe(false);
    expect(pave([0, 1], [0], 4)).toBe(false);
  });

  it("exige que le compte y soit : autant de frappes que de pulsations", () => {
    // Trois frappes par voix et trois voix ne peuvent pas paver un cycle de huit.
    expect(pave([0, 1, 2], [0, 3, 6], 8)).toBe(false);
  });

  it("refuse un motif ou des entrées vides", () => {
    expect(pave([], [0], 4)).toBe(false);
    expect(pave([0, 1], [], 4)).toBe(false);
  });
});

describe("recherche des entrées", () => {
  it("trouve les entrées des cas connus", () => {
    expect(chercherEntrees([0, 1], 4)).toEqual([0, 2]);
    expect(chercherEntrees([0, 1, 2], 6)).toEqual([0, 3]);
    expect(chercherEntrees([0, 2, 4], 6)).toEqual([0, 1]);
  });

  it("rend toujours un pavage vérifié", () => {
    for (const n of [4, 6, 8, 12, 16]) {
      for (let taille = 1; taille <= n; taille++) {
        if (n % taille !== 0) continue;
        const motif = Array.from({ length: taille }, (_, i) => i);
        const entrees = chercherEntrees(motif, n);
        if (entrees) expect(pave(motif, entrees, n), `n=${n} taille=${taille}`).toBe(true);
      }
    }
  });

  it("déclare impossible ce qui l'est vraiment", () => {
    // { 0, 1, 3 } ne pave pas un cycle de six : on peut le vérifier à la main, aucune des
    // cinq entrées possibles ne complète le motif sans collision.
    expect(chercherEntrees([0, 1, 3], 6)).toBeNull();
    for (let s = 1; s < 6; s++) expect(pave([0, 1, 3], [0, s], 6)).toBe(false);
  });

  it("refuse un motif dont la taille ne divise pas le cycle", () => {
    expect(chercherEntrees([0, 1, 2], 8)).toBeNull();
  });

  it("dédoublonne et ramène le motif dans le cycle", () => {
    expect(chercherEntrees([0, 1, 1, 5], 4)).toEqual(chercherEntrees([0, 1], 4));
  });
});

describe("périodicité", () => {
  it("reconnaît un ensemble qui se répète", () => {
    expect(estPeriodique([0, 2, 4], 6)).toBe(true);
    expect(estPeriodique([0, 3], 6)).toBe(true);
    expect(estPeriodique([0, 1, 2, 3], 4)).toBe(true);
  });

  it("reconnaît un ensemble qui ne se répète pas", () => {
    expect(estPeriodique([0, 1, 3], 6)).toBe(false);
    expect(estPeriodique([0, 1], 4)).toBe(false);
  });
});

describe("construction", () => {
  it("rend un canon complet, vérifié", () => {
    const canon = construire([0, 1, 2], 6)!;
    expect(canon.n).toBe(6);
    expect(canon.rythme).toEqual([0, 1, 2]);
    expect(pave(canon.rythme, canon.entrees, canon.n)).toBe(true);
  });

  it("ne déclare aucun canon de Vuza sous soixante-douze pulsations", () => {
    // C'est le résultat de Vuza : en deçà, tout pavage a une régularité cachée. On le
    // vérifie ici sur tous les motifs que la recherche trouve pour les petits cycles.
    for (const n of [4, 6, 8, 12, 16, 18, 20, 24]) {
      for (let taille = 2; taille < n; taille++) {
        if (n % taille !== 0) continue;
        for (const motif of chercherMotifs(n, taille, 3)) {
          const canon = construire(motif, n)!;
          expect(canon.vuza, `n=${n} motif=${motif.join(",")}`).toBe(false);
        }
      }
    }
  });

  it("rend null quand le motif ne pave pas", () => {
    expect(construire([0, 1, 3], 6)).toBeNull();
  });
});

describe("recherche de motifs", () => {
  it("ne rend que des motifs qui pavent, commençant tous par zéro", () => {
    for (const motif of chercherMotifs(12, 3, 5)) {
      expect(motif[0]).toBe(0);
      expect(chercherEntrees(motif, 12)).not.toBeNull();
    }
  });

  it("s'arrête au nombre demandé", () => {
    expect(chercherMotifs(12, 3, 2).length).toBeLessThanOrEqual(2);
  });

  it("ne rend rien d'une taille qui ne divise pas le cycle", () => {
    expect(chercherMotifs(10, 3, 5)).toEqual([]);
  });
});

describe("écriture", () => {
  it("dessine une ligne par voix, et une seule croix par colonne", () => {
    const canon = construire([0, 1, 2], 6)!;
    const lignes = canonEnTexte(canon).split("\n");
    expect(lignes.length).toBe(canon.entrees.length);
    for (let colonne = 0; colonne < canon.n; colonne++) {
      const croix = lignes.filter((l) => l[colonne] === "x").length;
      expect(croix, `colonne ${colonne}`).toBe(1);
    }
  });

  it("écrit exactement une note par pulsation et par tour", () => {
    const canon = construire([0, 1, 2], 6)!;
    const notes = canonEnNotes(canon, 0.25, [60, 67], 3);
    expect(notes.length).toBe(canon.n * 3);
    // Et jamais deux notes au même instant : c'est le pavage, rendu en musique.
    const instants = notes.map((n) => Math.round(n.debut * 1000));
    expect(new Set(instants).size).toBe(instants.length);
  });

  it("donne une hauteur par voix, en tournant si les voix sont plus nombreuses", () => {
    const canon = construire([0, 1], 4)!;
    const notes = canonEnNotes(canon, 0.25, [60], 1);
    expect(new Set(notes.map((n) => n.note))).toEqual(new Set([60]));
    const deux = canonEnNotes(canon, 0.25, [60, 72], 1);
    expect(new Set(deux.map((n) => n.note))).toEqual(new Set([60, 72]));
  });

  it("enchaîne les tours sans trou entre eux", () => {
    const canon = construire([0, 1], 4)!;
    const notes = canonEnNotes(canon, 0.5, [60, 72], 2);
    const debuts = notes.map((n) => +n.debut.toFixed(3)).sort((a, b) => a - b);
    expect(debuts).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });
});
