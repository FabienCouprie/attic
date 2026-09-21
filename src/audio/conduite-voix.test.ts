// audio/conduite-voix.test.ts — Ce qu'une conduite de voix coûte, en demi-tons.
//
// LES VALEURS DE RÉFÉRENCE VIENNENT DE LA THÉORIE, pas du code. Les transformations
// néo-riemanniennes P, L et R sont définies comme celles qui ne déplacent qu'UNE voix, d'un ou
// deux demi-tons : si la mesure ne le retrouve pas, c'est elle qui se trompe.
import { describe, expect, it } from "vitest";
import { analyserConduite, conduiteMinimale, ecartCirculaire } from "./conduite-voix";

const DO_MAJEUR = [0, 4, 7];      // do mi sol
const DO_MINEUR = [0, 3, 7];      // do mi♭ sol — P : le mi descend d'un demi-ton
const MI_MINEUR = [4, 7, 11];     // mi sol si  — L : le do monte au si… d'un demi-ton
const LA_MINEUR = [9, 0, 4];      // la do mi   — R : le sol monte au la, deux demi-tons
const SOL_MAJEUR = [7, 11, 2];
const FA_DIESE_MAJEUR = [6, 10, 1];

describe("l'écart circulaire", () => {
  it("prend le plus court chemin : de si à do, un demi-ton et non onze", () => {
    expect(ecartCirculaire(11, 0)).toBe(1);
    expect(ecartCirculaire(0, 11)).toBe(1);
  });

  it("le triton vaut six dans les deux sens", () => {
    expect(ecartCirculaire(0, 6)).toBe(6);
    expect(ecartCirculaire(6, 0)).toBe(6);
  });

  it("une note vers elle-même ne coûte rien, octaves comprises", () => {
    expect(ecartCirculaire(4, 4)).toBe(0);
    expect(ecartCirculaire(4, 16)).toBe(0);
  });
});

describe("les transformations néo-riemanniennes ne bougent qu'une voix", () => {
  const uneSeule = (a: number[], b: number[]) => {
    const c = conduiteMinimale(a, b)!;
    return { distance: c.distance, bougees: c.deplacements.filter((d) => d > 0).length };
  };

  it("P — majeur vers mineur : une voix, un demi-ton", () => {
    expect(uneSeule(DO_MAJEUR, DO_MINEUR)).toEqual({ distance: 1, bougees: 1 });
  });

  it("L — do majeur vers mi mineur : une voix, un demi-ton", () => {
    expect(uneSeule(DO_MAJEUR, MI_MINEUR)).toEqual({ distance: 1, bougees: 1 });
  });

  it("R — do majeur vers la mineur : une voix, deux demi-tons", () => {
    expect(uneSeule(DO_MAJEUR, LA_MINEUR)).toEqual({ distance: 2, bougees: 1 });
  });

  it("do majeur vers fa dièse majeur, les plus éloignés : trois voix bougent", () => {
    const c = conduiteMinimale(DO_MAJEUR, FA_DIESE_MAJEUR)!;
    expect(c.deplacements.filter((d) => d > 0).length).toBe(3);
    expect(c.distance).toBeGreaterThan(2);
  });
});

describe("la conduite minimale", () => {
  it("un accord vers lui-même ne coûte rien", () => {
    expect(conduiteMinimale(DO_MAJEUR, DO_MAJEUR)!.distance).toBe(0);
  });

  it("l'octave et le doublage ne changent rien : ce sont des classes de hauteurs", () => {
    expect(conduiteMinimale([0, 4, 7], [12, 16, 19])!.distance).toBe(0);
    expect(conduiteMinimale([0, 4, 7, 12, 16], DO_MAJEUR)!.distance).toBe(0);
  });

  it("elle trouve MIEUX que l'appariement dans l'ordre", () => {
    // Apparier les notes triées une à une donnerait |0−2| + |4−7| + |7−11| = 9 ;
    // la rotation qui envoie le do sur le si coûte 1 + 3 + 0 = 4.
    const naif = DO_MAJEUR.reduce((s, n, i) => s + ecartCirculaire(n, [2, 7, 11][i]), 0);
    const c = conduiteMinimale(DO_MAJEUR, SOL_MAJEUR)!;
    expect(c.distance).toBeLessThan(naif);
    expect(c.distance).toBe(3);
  });

  it("l'affectation dit où chaque voix aboutit, et elle est complète", () => {
    const c = conduiteMinimale(DO_MAJEUR, LA_MINEUR)!;
    expect(c.affectation.length).toBe(3);
    expect(c.affectation.map(([, b]) => b).sort((x, y) => x - y)).toEqual([0, 4, 9]);
    expect(c.deplacements.reduce((a, b) => a + b, 0)).toBe(c.distance);
  });

  it("des accords de tailles différentes ne se mesurent pas", () => {
    expect(conduiteMinimale(DO_MAJEUR, [0, 4, 7, 11])).toBe(null);
    expect(conduiteMinimale([], DO_MAJEUR)).toBe(null);
  });

  it("la mesure est symétrique : aller coûte autant que revenir", () => {
    for (const [a, b] of [[DO_MAJEUR, MI_MINEUR], [DO_MAJEUR, FA_DIESE_MAJEUR], [SOL_MAJEUR, LA_MINEUR]]) {
      expect(conduiteMinimale(a, b)!.distance).toBe(conduiteMinimale(b, a)!.distance);
    }
  });

  it("LE THÉORÈME TIENT : aucune permutation ne fait mieux que les rotations", () => {
    // Tymoczko démontre que la conduite minimale n'a pas besoin de croiser les voix. On le vérifie
    // en essayant TOUTES les permutations sur des accords tirés au sort : jamais l'une d'elles ne
    // doit battre la meilleure rotation.
    const permutations = (t: number[]): number[][] =>
      t.length <= 1 ? [t] : t.flatMap((x, i) => permutations([...t.slice(0, i), ...t.slice(i + 1)]).map((p) => [x, ...p]));
    let g = 12345;
    const tirer = (k: number) => {
      const s = new Set<number>();
      while (s.size < k) { g = (g * 1103515245 + 12345) & 0x7fffffff; s.add(Math.floor((g / 0x80000000) * 12)); }
      return [...s].sort((a, b) => a - b);
    };
    for (let essai = 0; essai < 200; essai++) {
      const k = 3 + (essai % 3); // trois, quatre ou cinq notes
      const a = tirer(k), b = tirer(k);
      if (a.length !== b.length) continue;
      const parRotation = conduiteMinimale(a, b)!.distance;
      let meilleurePermutation = Infinity;
      for (const p of permutations(b)) {
        let s = 0;
        for (let i = 0; i < a.length; i++) s += ecartCirculaire(a[i], p[i]);
        meilleurePermutation = Math.min(meilleurePermutation, s);
      }
      expect(parRotation).toBe(meilleurePermutation);
    }
  });
});

describe("une progression entière", () => {
  it("relève la transition la plus lisse et la plus tendue", () => {
    const a = analyserConduite([DO_MAJEUR, LA_MINEUR, FA_DIESE_MAJEUR, DO_MAJEUR]);
    expect(a.etapes.length).toBe(3);
    // Les trois distances, calculées à la main : do → la mineur vaut 2 (une voix, le sol au la) ;
    // la mineur → fa dièse vaut 4 ; fa dièse → do vaut 6, le maximum entre deux accords parfaits,
    // les deux étant diamétralement opposés. La plus tendue est donc la DERNIÈRE, et non celle du
    // milieu comme je l'avais supposé.
    expect(a.etapes.map((e) => e.conduite!.distance)).toEqual([2, 4, 6]);
    expect(a.plusLisse).toBe(0);
    expect(a.plusTendue).toBe(2);
  });

  it("repère les transitions qui ne bougent qu'une voix", () => {
    const a = analyserConduite([DO_MAJEUR, DO_MINEUR, MI_MINEUR, FA_DIESE_MAJEUR]);
    expect(a.uneSeuleVoix).toContain(0);
    expect(a.uneSeuleVoix).not.toContain(2);
  });

  it("le total et la moyenne se tiennent", () => {
    const a = analyserConduite([DO_MAJEUR, DO_MINEUR, DO_MAJEUR]);
    expect(a.total).toBe(2);
    expect(a.moyenne).toBe(1);
  });

  it("les transitions non mesurables sont comptées, pas inventées", () => {
    const a = analyserConduite([DO_MAJEUR, [0, 4, 7, 11], DO_MAJEUR]);
    expect(a.ignorees).toBe(2);
    expect(a.total).toBe(0);
    expect(a.moyenne).toBe(0);
  });

  it("un seul accord ne fait aucune transition", () => {
    const a = analyserConduite([DO_MAJEUR]);
    expect(a.etapes).toEqual([]);
    expect(a.plusLisse).toBe(-1);
  });
});
