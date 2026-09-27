// audio/contrepoint-solveur.test.ts — Ce qui est écrit passe-t-il chez le correcteur ?
//
// LE CONTRÔLE EST SANS APPEL, ET IL N'EST PAS CIRCULAIRE. Le solveur emploie le vérificateur sur
// les PRÉFIXES, en écartant les règles de fin qu'un préfixe ne peut pas satisfaire ; le test repasse
// la ligne ENTIÈRE au vérificateur, règles de fin comprises. Il éprouve donc ce que la recherche
// n'a jamais éprouvé de la sorte : qu'une ligne juste à chaque pas l'est encore une fois finie.
//
// ET LE CANTUS DE FUX SERT DE PIERRE DE TOUCHE. Celui du « Gradus ad Parnassum » de 1725, en ré :
// s'il fallait un cas dont on sache qu'il admet un contrepoint, c'est celui-là.
import { describe, expect, it } from "vitest";

import { verifier } from "./contrepoint";
import { cantusFirmus, chercherContrepoint } from "./contrepoint-solveur";

/** Le cantus firmus du « Gradus ad Parnassum », en ré. */
const FUX = [62, 64, 65, 67, 65, 69, 67, 66, 62, 64, 62];

const classes = (suite: readonly number[]) =>
  [...new Set(suite.map((h) => ((h % 12) + 12) % 12))].sort((a, b) => a - b);

/** Les erreurs que le correcteur trouve sur la pièce entière. */
function erreursDe(cantus: readonly number[], ligne: readonly number[], auDessus = true) {
  const basse = auDessus ? [...cantus] : [...ligne];
  const haute = auDessus ? [...ligne] : [...cantus];
  return verifier(basse, haute).filter((x) => x.gravite === "erreur");
}

describe("ce que le solveur écrit passe chez le correcteur", () => {
  it("SUR LE CANTUS DE FUX, VOIX AU-DESSUS : aucune erreur", () => {
    const res = chercherContrepoint(FUX, { graine: 3 });
    expect(res.lignes).toHaveLength(1);
    expect(erreursDe(FUX, res.lignes[0])).toEqual([]);
  });

  it("VOIX AU-DESSOUS AUSSI", () => {
    const res = chercherContrepoint(FUX, { auDessus: false, graine: 3 });
    expect(res.lignes).toHaveLength(1);
    expect(erreursDe(FUX, res.lignes[0], false)).toEqual([]);
  });

  it("SUR DIX GRAINES, AUCUNE LIGNE FAUTIVE : ce n'est pas un coup de chance", () => {
    for (let graine = 1; graine <= 10; graine++) {
      const res = chercherContrepoint(FUX, { graine });
      expect(res.lignes.length, `graine ${graine}`).toBe(1);
      expect(erreursDe(FUX, res.lignes[0]), `graine ${graine}`).toEqual([]);
    }
  });

  it("SUR DES CANTUS ENGENDRÉS DE LONGUEURS DIFFÉRENTES", () => {
    for (const combien of [6, 8, 10, 12]) {
      const cantus = cantusFirmus(60, combien, combien);
      const res = chercherContrepoint(cantus, { graine: 5 });
      expect(res.lignes.length, `${combien} notes`).toBe(1);
      expect(erreursDe(cantus, res.lignes[0]), `${combien} notes`).toEqual([]);
    }
  });

  it("LA LIGNE A EXACTEMENT LA LONGUEUR DU CANTUS", () => {
    const res = chercherContrepoint(FUX, { graine: 1 });
    expect(res.lignes[0]).toHaveLength(FUX.length);
  });
});

describe("ce que les réglages bornent", () => {
  it("LES DEGRÉS TIENNENT LA LIGNE DANS LE MODE", () => {
    const mode = classes(FUX);
    const res = chercherContrepoint(FUX, { degres: mode, graine: 3 });
    expect(res.lignes).toHaveLength(1);
    for (const h of res.lignes[0]) expect(mode).toContain(((h % 12) + 12) % 12);
  });

  it("L'ÉTENDUE EST TENUE", () => {
    const res = chercherContrepoint(FUX, { grave: 69, aigu: 86, degres: classes(FUX), graine: 3 });
    expect(res.lignes).toHaveLength(1);
    for (const h of res.lignes[0]) {
      expect(h).toBeGreaterThanOrEqual(69);
      expect(h).toBeLessThanOrEqual(86);
    }
  });

  it("L'ÉCART MAXIMAL EST TENU", () => {
    const res = chercherContrepoint(FUX, { ecartMax: 7, degres: classes(FUX), graine: 3 });
    expect(res.lignes).toHaveLength(1);
    const l = res.lignes[0];
    for (let i = 1; i < l.length; i++) expect(Math.abs(l[i] - l[i - 1])).toBeLessThanOrEqual(7);
  });

  it("DEUX GRAINES DONNENT DEUX CONTREPOINTS, tous deux justes", () => {
    const a = chercherContrepoint(FUX, { graine: 1 }).lignes[0];
    const b = chercherContrepoint(FUX, { graine: 2 }).lignes[0];
    expect(a).not.toEqual(b);
    expect(erreursDe(FUX, a)).toEqual([]);
    expect(erreursDe(FUX, b)).toEqual([]);
  });

  it("plusieurs contrepoints se demandent d'un coup", () => {
    const res = chercherContrepoint(FUX, { combien: 3, graine: 4 });
    expect(res.lignes).toHaveLength(3);
    for (const l of res.lignes) expect(erreursDe(FUX, l)).toEqual([]);
  });
});

describe("quand il n'y a rien à trouver", () => {
  it("UNE ÉTENDUE DE DEUX DEMI-TONS NE DONNE RIEN, et ce n'est pas un abandon", () => {
    const res = chercherContrepoint(FUX, { grave: 62, aigu: 64, budget: 50000 });
    expect(res.lignes).toHaveLength(0);
    expect(res.abandonne).toBe(false);
    expect(res.regleBloquante.length).toBeGreaterThan(0);
  });

  it("UN ÉCART TROP SERRÉ NON PLUS, et la cadence en est la cause", () => {
    // Relevé : sous un saut de cinq demi-tons il n'existe aucun contrepoint au cantus de Fux dans
    // son mode. La recherche l'établit exhaustivement, bute sur la règle d'écart, et atteint la
    // dixième note sur onze : c'est la cadence, qui demande un mouvement contraire vers l'octave,
    // qu'un pas trop court ne peut pas faire. Le nombre importe moins que ceci : le solveur rend
    // une PREUVE d'absence, et non un aveu d'impatience.
    const mode = classes(FUX);
    for (const ecartMax of [3, 4, 5]) {
      const res = chercherContrepoint(FUX, { ecartMax, degres: mode, graine: 3, budget: 2000000 });
      expect(res.lignes, `ecart ${ecartMax}`).toHaveLength(0);
      expect(res.abandonne, `ecart ${ecartMax}`).toBe(false);
      expect(res.regleBloquante, `ecart ${ecartMax}`).toBe("ecart");
      expect(res.meilleurPartiel.length, `ecart ${ecartMax}`).toBe(FUX.length - 1);
    }
  });

  it("un cantus vide ne casse rien", () => {
    const res = chercherContrepoint([]);
    expect(res.lignes).toHaveLength(0);
    expect(res.noeuds).toBe(0);
  });
});

describe("le cantus firmus engendré", () => {
  it("COMMENCE ET FINIT SUR LA TONIQUE", () => {
    for (const graine of [1, 2, 3, 4, 5]) {
      const c = cantusFirmus(60, 9, graine);
      expect(c[0], `graine ${graine}`).toBe(60);
      expect(c[c.length - 1], `graine ${graine}`).toBe(60);
    }
  });

  it("SE MEUT PAR DEGRÉS DE LA GAMME, sans chromatisme", () => {
    const majeure = [0, 2, 4, 5, 7, 9, 11];
    for (const graine of [1, 2, 3]) {
      for (const h of cantusFirmus(60, 10, graine)) {
        expect(majeure, `graine ${graine}`).toContain(((h % 12) + 12) % 12);
      }
    }
  });

  it("NE SAUTE JAMAIS PLUS QU'UNE TIERCE d'une note à l'autre", () => {
    for (const graine of [1, 2, 3, 4]) {
      const c = cantusFirmus(60, 12, graine);
      for (let i = 1; i < c.length; i++) {
        expect(Math.abs(c[i] - c[i - 1]), `graine ${graine} note ${i}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it("la même graine rend le même cantus", () => {
    expect(cantusFirmus(60, 9, 42)).toEqual(cantusFirmus(60, 9, 42));
  });
});
