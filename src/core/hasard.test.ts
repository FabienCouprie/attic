// core/hasard.test.ts — Le générateur commun, et la convention de graine par
// nœud qu'il sert. Le point qui compte pour l'existant : ce générateur remplace
// cinq copies éparpillées dans le projet, et doit donc rendre exactement les
// mêmes suites qu'elles — sans quoi tout projet portant déjà une graine
// changerait de son en silence.
import { describe, it, expect } from "vitest";
import { GRAINE_MAX, creerAleatoire, graineDuTour, hasardDuNoeud, resoudreGraine } from "./hasard";

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

describe("ce qu'une valeur de graine veut dire, en un seul endroit", () => {
  // RELEVÉ PAR FABIEN : « il y a un excès de décentralisation, le fonctionnement sur les graines
  // doit être homogène ». La convention n'existait que pour les treize composants sur soixante-cinq
  // qui appelaient `hasardDuNoeud` ; ailleurs, une graine à zéro était une graine FIXE valant zéro.
  it("une graine posée est gardée telle quelle", () => {
    for (const v of [1, 42, 999999]) expect(resoudreGraine(v)).toBe(v);
  });

  it("zéro et les négatifs font tirer, dans les bornes lisibles", () => {
    for (const v of [0, -1, -999]) {
      const g = resoudreGraine(v);
      expect(g, `depuis ${v}`).toBeGreaterThanOrEqual(1);
      expect(g, `depuis ${v}`).toBeLessThanOrEqual(GRAINE_MAX);
    }
  });

  it("ELLE EST IDEMPOTENTE, et c'est ce qui permet de la poser au centre", () => {
    // Un composant qui appelle encore la convention sur une valeur déjà résolue doit obtenir la
    // même : sans cela, le moteur et le composant tireraient chacun la leur.
    for (const v of [0, -1, 7]) {
      const une = resoudreGraine(v);
      expect(resoudreGraine(une)).toBe(une);
      expect(hasardDuNoeud(une).graine).toBe(une);
    }
  });
});

describe("la graine d'un tour de boucle", () => {
  it("EST UNE FONCTION, NON UN TIRAGE : même graine et même tour, même résultat", () => {
    expect(graineDuTour(42, 3)).toBe(graineDuTour(42, 3));
    expect(graineDuTour(1, 0)).toBe(graineDuTour(1, 0));
  });

  it("DEUX NŒUDS AUX GRAINES VOISINES NE SE RENCONTRENT PAS D'UN TOUR À L'AUTRE", () => {
    // LA VRAIE RAISON DU MÉLANGE, et non celle qu'on croit. En additionnant, le tour 1 d'un nœud de
    // graine 42 et le tour 0 d'un nœud de graine 43 tomberaient tous deux sur 43 : deux composants
    // différents tireraient la même suite au même moment. Les graines posées à la main étant
    // voisines — 1, 2, 3, 42, 43 —, la rencontre serait fréquente et s'entendrait.
    expect(42 + 1).toBe(43 + 0);                       // ce que l'addition ferait
    expect(graineDuTour(42, 1)).not.toBe(graineDuTour(43, 0));
    // Et sur tout un voisinage de graines et de tours, aucune rencontre.
    const vues = new Map<number, string>();
    let rencontres = 0;
    for (const g of [1, 2, 3, 42, 43, 44]) {
      for (let k = 0; k < 16; k++) {
        const v = graineDuTour(g, k);
        if (vues.has(v)) rencontres++;
        else vues.set(v, `${g}/${k}`);
      }
    }
    expect(rencontres).toBe(0);
  });

  it("ET LES PREMIERS TIRAGES DIFFÈRENT VRAIMENT, ce qui est la seule chose qui s'entend", () => {
    // La distance entre deux graines ne prouve rien par elle-même : ce qui compte est que les suites
    // qu'elles engendrent divergent dès le premier nombre.
    const premiers = Array.from({ length: 32 }, (_, k) => creerAleatoire(graineDuTour(42, k))());
    expect(new Set(premiers.map((v) => v.toFixed(6))).size).toBe(32);
  });

  it("trente-deux tours donnent trente-deux graines distinctes, et toutes dans les bornes", () => {
    const graines = Array.from({ length: 32 }, (_, k) => graineDuTour(7, k));
    expect(new Set(graines).size).toBe(32);
    for (const g of graines) {
      expect(g).toBeGreaterThanOrEqual(1);
      expect(g).toBeLessThanOrEqual(GRAINE_MAX);
    }
  });

  it("et deux graines de départ différentes ne se rejoignent pas au même tour", () => {
    for (let k = 0; k < 8; k++) expect(graineDuTour(42, k)).not.toBe(graineDuTour(43, k));
  });
});
