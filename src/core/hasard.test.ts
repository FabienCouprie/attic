// core/hasard.test.ts — Le générateur commun, et la convention de graine par
// nœud qu'il sert. Le point qui compte pour l'existant : ce générateur remplace
// cinq copies éparpillées dans le projet, et doit donc rendre exactement les
// mêmes suites qu'elles — sans quoi tout projet portant déjà une graine
// changerait de son en silence.
import { describe, it, expect } from "vitest";
import { creerAleatoire, hasardDuNoeud } from "./hasard";

function suite(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => rng());
}

/** La copie qu'on trouvait dans random-slice, reservoir, textgen, etc. */
function mulberry32Historique(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("creerAleatoire", () => {
  it("rejoue exactement la même suite pour une même graine", () => {
    expect(suite(creerAleatoire(12345), 20)).toEqual(suite(creerAleatoire(12345), 20));
  });

  it("donne des suites différentes pour des graines différentes", () => {
    expect(suite(creerAleatoire(12345), 20)).not.toEqual(suite(creerAleatoire(12346), 20));
  });

  it("est bit à bit identique aux copies qu'il remplace", () => {
    // La condition pour dédupliquer sans rien casser : les projets déjà
    // enregistrés avec une graine doivent rendre le même son qu'avant.
    for (const graine of [1, 42, 999, 123456789, 4294967295]) {
      expect(suite(creerAleatoire(graine), 2000), `graine ${graine}`)
        .toEqual(suite(mulberry32Historique(graine), 2000));
    }
  });

  it("reste dans [0, 1[", () => {
    for (const v of suite(creerAleatoire(7), 10000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("se répartit uniformément sur dix intervalles", () => {
    // 100 000 tirages, 10 cases : 10 000 attendus par case. Un écart de plus de
    // 5 % signalerait un biais grossier ; l'écart-type théorique vaut 95.
    const cases: number[] = Array.from({ length: 10 }, () => 0);
    const rng = creerAleatoire(2024);
    for (let i = 0; i < 100000; i++) cases[Math.floor(rng() * 10)]++;
    for (const c of cases) expect(Math.abs(c - 10000)).toBeLessThan(500);
  });
});

describe("hasardDuNoeud", () => {
  it("respecte la graine choisie sur le nœud", () => {
    const a = hasardDuNoeud(777);
    expect(a.graine).toBe(777);
    expect(suite(a.aleatoire, 10)).toEqual(suite(creerAleatoire(777), 10));
  });

  it("rejoue la même suite pour une même graine de nœud", () => {
    expect(suite(hasardDuNoeud(777).aleatoire, 10)).toEqual(suite(hasardDuNoeud(777).aleatoire, 10));
  });

  it("tire une graine quand le paramètre vaut 0, et la rend", () => {
    // Elle est RENDUE et non gardée : c'est ce qui permet au nœud de l'afficher
    // dans son message, donc à l'utilisateur de recopier dans le champ la
    // graine d'un rendu qu'il veut garder. Sans cela, un paramètre à 0 produit
    // un résultat qu'on ne peut plus retrouver.
    const r = hasardDuNoeud(0);
    expect(Number.isInteger(r.graine)).toBe(true);
    expect(r.graine).toBeGreaterThan(0);
    expect(r.graine).toBeLessThanOrEqual(999999);
    expect(suite(r.aleatoire, 10)).toEqual(suite(creerAleatoire(r.graine), 10));
  });

  it("un paramètre à 0 donne bien des tirages différents d'une fois sur l'autre", () => {
    const graines = new Set(Array.from({ length: 50 }, () => hasardDuNoeud(0).graine));
    expect(graines.size).toBeGreaterThan(40);   // collisions rares sur 999 999
  });

  it("traite un paramètre négatif comme 0", () => {
    expect(hasardDuNoeud(-5).graine).toBeGreaterThan(0);
  });

  it("tronque un paramètre décimal", () => {
    expect(hasardDuNoeud(12.7).graine).toBe(12);
  });
});
