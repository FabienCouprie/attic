// audio/ondelettes.test.ts — Les trois propriétés qui font un banc de filtres, et ce qu'on gagne à
// s'en servir.
//
// LE TEST QUI COMMANDE TOUS LES AUTRES : LA RECONSTRUCTION PARFAITE. Un banc orthogonal rend le
// signal d'entrée à l'erreur d'arrondi près. S'il ne le rend pas, il n'est pas orthogonal, le
// seuillage ne veut plus rien dire, et tout ce que le nœud annonce est faux. On l'exige au
// millionième, sur du bruit — le signal le plus difficile qui soit, puisqu'il n'a aucune structure
// que les filtres puissent aider.
//
// LES COEFFICIENTS SONT RECOPIÉS D'UNE PUBLICATION, DONC ILS SONT SUSPECTS. Une faute sur la
// septième décimale d'un filtre de Daubechies ne se voit pas à l'oreille : le son sort encore, la
// reconstruction est presque bonne, et rien ne le signale. Les tests exigent donc les trois
// propriétés de définition — norme, orthogonalité aux décalages pairs, moments nuls — qui ne
// tiennent que si chaque décimale est juste.
import { describe, expect, it } from "vitest";
import {
  ONDELETTES, bandesDetages, decomposer, ecartTypeBruit, energie, etagesPossibles,
  filtreDe, filtreHaut, rapportSignalBruitDb, recomposer, traiterAvecDecalages, traiterCoefficients,
} from "./ondelettes";

const SR = 44100;

/** Un générateur à graine, pour que le bruit des tests soit le même à chaque exécution. */
function alea(graine: number): () => number {
  let e = graine >>> 0;
  return () => {
    e = (e * 1664525 + 1013904223) >>> 0;
    return e / 4294967296;
  };
}

function bruit(n: number, amplitude = 1, graine = 7): Float32Array {
  const r = alea(graine);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amplitude * (r() * 2 - 1);
  return x;
}

function tenue(n: number, hz: number, amplitude = 0.5): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SR);
  return x;
}

const somme = (x: Float32Array, y: Float32Array): Float32Array => {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] + (y[i] ?? 0);
  return out;
};

/**
 * Des clics brefs, à large bande.
 *
 * C'est le signal qu'il faut pour juger la méthode honnêtement. Sur une note tenue, un seuillage
 * gagnerait des décibels sans rien devoir aux ondelettes : il suffirait de couper l'aigu, où il n'y
 * a que du bruit, et la mesure applaudirait un vulgaire passe-bas. Des clics occupent tout le
 * spectre : aucune coupure de bande ne peut les nettoyer, et ce que le seuillage gagne, il le doit
 * à la seule parcimonie.
 */
function clics(n: number, combien = 16, amplitude = 0.9): Float32Array {
  const x = new Float32Array(n);
  const r = alea(21);
  for (let c = 0; c < combien; c++) {
    const debut = Math.floor((c + 0.3 + 0.4 * r()) * (n / combien));
    for (let i = 0; i < 48 && debut + i < n; i++) x[debut + i] = amplitude * Math.exp(-i / 12) * (r() * 2 - 1);
  }
  return x;
}

/** Le témoin : annuler entièrement les bandes de détail, c'est-à-dire un passe-bas parfait. */
function passeBas(x: Float32Array, h: number[], etages: number): Float32Array {
  const d = decomposer(x, h, etages);
  return recomposer({ ...d, details: d.details.map((b) => b.map(() => 0)) }, h);
}

describe("les filtres", () => {
  for (const o of ONDELETTES) {
    it(`${o.fr} — norme, orthogonalité aux décalages pairs, moments nuls`, () => {
      const h = [...o.h];

      // 1. La somme des carrés vaut un : le banc ne change pas l'énergie.
      expect(h.reduce((s, v) => s + v * v, 0)).toBeCloseTo(1, 9);

      // 2. La somme vaut racine de deux : le filtre laisse passer le continu sans le déformer.
      expect(h.reduce((s, v) => s + v, 0)).toBeCloseTo(Math.SQRT2, 9);

      // 3. Orthogonal à lui-même décalé de deux : c'est ce qui rend la décimation sans perte.
      for (let k = 2; k < h.length; k += 2) {
        let produit = 0;
        for (let n = 0; n + k < h.length; n++) produit += h[n] * h[n + k];
        expect(produit, `décalage ${k}`).toBeCloseTo(0, 9);
      }

      // 4. Les moments nuls du passe-haut : un filtre à p moments nuls ignore tout polynôme de
      //    degré inférieur à p. C'est exactement ce qui rend les coefficients de détail PETITS sur
      //    une partie lisse du son, et donc le seuillage efficace.
      const g = filtreHaut(h);
      const moments = h.length / 2;
      for (let k = 0; k < moments; k++) {
        let m = 0;
        for (let n = 0; n < g.length; n++) m += g[n] * n ** k;
        expect(m, `${o.fr}, moment ${k}`).toBeCloseTo(0, 6);
      }
    });
  }

  it("un nom inconnu retombe sur Daubechies (4)", () => {
    expect(filtreDe("n'importe quoi")).toEqual([...ONDELETTES[1].h]);
  });
});

describe("la reconstruction", () => {
  for (const o of ONDELETTES) {
    it(`${o.fr} rend le son au millionième, sur du bruit`, () => {
      const x = bruit(4096, 0.8);
      const d = decomposer(x, [...o.h], 5);
      const y = recomposer(d, [...o.h]);
      expect(y.length).toBe(x.length);
      let pire = 0;
      for (let i = 0; i < x.length; i++) pire = Math.max(pire, Math.abs(x[i] - y[i]));
      expect(pire, `${o.fr} : écart maximal`).toBeLessThan(1e-6);
    });
  }

  it("LA LONGUEUR D'ORIGINE EST RENDUE, même quand elle n'est pas une puissance de deux", () => {
    for (const n of [1, 17, 1000, 4097, 44100]) {
      const x = bruit(n, 0.5, n);
      const d = decomposer(x, filtreDe("d4"), 4);
      const y = recomposer(d, filtreDe("d4"));
      expect(y.length, `longueur ${n}`).toBe(n);
      expect(rapportSignalBruitDb(x, y), `longueur ${n}`).toBeGreaterThan(100);
    }
  });

  it("l'énergie se conserve entre le signal et ses coefficients — le banc est orthogonal", () => {
    const x = bruit(2048, 0.7);
    const d = decomposer(x, filtreDe("d8"), 4);
    const coefficients = [...d.moyenne, ...d.details.flat()].reduce((s, v) => s + v * v, 0);
    expect(coefficients).toBeCloseTo(energie(x), 4);
  });

  it("le nombre d'étages possibles dépend de la longueur et de la taille du filtre", () => {
    expect(etagesPossibles(1024, 2)).toBeGreaterThan(etagesPossibles(64, 2));
    expect(etagesPossibles(1024, 8)).toBeLessThan(etagesPossibles(1024, 2));
    expect(etagesPossibles(1, 2)).toBe(0);
  });

  it("UNE LONGUEUR IMPAIRE NE BRIDE PAS LA DÉCOMPOSITION, puisque le signal est complété", () => {
    // Une seconde à 44 100 Hz n'est divisible par deux que deux fois. Compter les divisions sans
    // reste plafonnerait donc à deux étages un son qui en permet douze, et le nœud n'aurait
    // nettoyé que son aigu — le défaut exact qu'une vérification dans l'application a montré.
    expect(etagesPossibles(44100, 8)).toBeGreaterThanOrEqual(12);
    const x = bruit(44100, 0.5);
    const h = filtreDe("d8");
    const d = decomposer(x, h, 12);
    expect(d.details).toHaveLength(12);
    expect(rapportSignalBruitDb(x, recomposer(d, h))).toBeGreaterThan(100);
  });
});

describe("la parcimonie", () => {
  it("UN SON TENU TIENT DANS UNE POIGNÉE DE COEFFICIENTS, LE BRUIT NON", () => {
    // C'est toute la raison d'être du seuillage : sur un son structuré, l'énergie se concentre dans
    // quelques coefficients ; sur du bruit, elle reste étalée sur tous.
    const partGardee = (x: Float32Array) => {
      const d = decomposer(x, filtreDe("d8"), 6);
      const t = traiterCoefficients(d, { operation: "garder", forceSeuil: 1, doux: false, gardePc: 5 });
      const rendu = recomposer(t.decomposition, filtreDe("d8"));
      return energie(rendu) / energie(x);
    };
    const son = partGardee(tenue(8192, 440));
    const souffle = partGardee(bruit(8192, 0.5));
    expect(son).toBeGreaterThan(0.9);
    expect(souffle).toBeLessThan(0.5);
    expect(son).toBeGreaterThan(souffle * 1.8);
  });

  it("garder cent pour cent ne change rien, garder zéro ne laisse que le grave", () => {
    const x = tenue(4096, 220);
    const h = filtreDe("d4");
    const d = decomposer(x, h, 4);

    const tout = traiterCoefficients(d, { operation: "garder", forceSeuil: 1, doux: false, gardePc: 100 });
    expect(tout.annules).toBe(0);
    expect(rapportSignalBruitDb(x, recomposer(tout.decomposition, h))).toBeGreaterThan(100);

    const rien = traiterCoefficients(d, { operation: "garder", forceSeuil: 1, doux: false, gardePc: 0 });
    expect(rien.annules).toBe(rien.total);
    expect(energie(recomposer(rien.decomposition, h))).toBeLessThan(energie(x));
  });
});

describe("le débruitage", () => {
  it("L'ÉCART-TYPE DU BRUIT EST RETROUVÉ À PARTIR DE L'OCTAVE LA PLUS AIGUË", () => {
    // Un bruit blanc d'écart-type connu : la médiane des détails fins doit le retrouver de près.
    const r = alea(11);
    const x = new Float32Array(8192);
    // Somme de douze tirages uniformes, moins six : une loi voisine de la normale, d'écart-type 1.
    for (let i = 0; i < x.length; i++) {
      let s = 0;
      for (let k = 0; k < 12; k++) s += r();
      x[i] = (s - 6) * 0.1;
    }
    const sigma = ecartTypeBruit(decomposer(x, filtreDe("d8"), 4));
    expect(sigma).toBeGreaterThan(0.08);
    expect(sigma).toBeLessThan(0.12);
  });

  it("LE SEUILLAGE GAGNE DIX DÉCIBELS LÀ OÙ AUCUNE COUPURE DE BANDE NE GAGNE RIEN", () => {
    // LE TEST QUI JUSTIFIE LE NŒUD. Sur des clics à large bande noyés dans du souffle, un passe-bas
    // parfait — annuler entièrement les mêmes bandes que celles qu'on seuille — ne gagne rien du
    // tout : il détruit le signal autant que le bruit. Le seuillage, lui, gagne une dizaine de
    // décibels sur le même son et avec les mêmes bandes. La différence entre les deux chiffres est
    // exactement ce que la parcimonie apporte, et rien d'autre.
    const propre = clics(16384);
    const sale = somme(propre, bruit(16384, 0.06, 3));
    const h = filtreDe("d8");
    const avant = rapportSignalBruitDb(propre, sale);

    const temoin = rapportSignalBruitDb(propre, passeBas(sale, h, 6));
    expect(temoin - avant).toBeLessThan(1);

    const r = traiterAvecDecalages(sale, h, 6, { operation: "debruiter", forceSeuil: 0.6, doux: false, gardePc: 5 }, 6);
    const apres = rapportSignalBruitDb(propre, r.son);
    expect(apres).toBeGreaterThan(avant + 9);
    expect(apres).toBeGreaterThan(temoin + 9);
    // Et il a bien fallu annuler des coefficients pour cela.
    expect(r.annules).toBeGreaterThan(r.total * 0.5);
  });

  it("le seuillage sans décalage marche aussi, et le décalage n'y perd rien", () => {
    const propre = clics(16384);
    const sale = somme(propre, bruit(16384, 0.06, 3));
    const h = filtreDe("d8");
    const o = { operation: "debruiter" as const, forceSeuil: 0.6, doux: false, gardePc: 5 };

    // Un seul décalage doit rendre exactement le chemin direct : c'est le décalage nul.
    const direct = recomposer(traiterCoefficients(decomposer(sale, h, 6), o).decomposition, h);
    const un = traiterAvecDecalages(sale, h, 6, o, 1).son;
    expect(rapportSignalBruitDb(direct, un)).toBeGreaterThan(100);

    const plusieurs = traiterAvecDecalages(sale, h, 6, o, 6).son;
    expect(rapportSignalBruitDb(propre, plusieurs)).toBeGreaterThan(rapportSignalBruitDb(propre, un) - 0.5);
  });

  it("LE DÉCALAGE REND LE RÉSULTAT MOINS SENSIBLE À LA PLACE DU SON DANS LE FICHIER", () => {
    // Une transformée décimée n'est pas invariante par translation : le même son avancé d'un
    // échantillon ne se débruite pas de la même façon. C'est ce que la moyenne sur des décalages
    // corrige, et l'écart entre les deux versions le mesure.
    const propre = clics(8192);
    const sale = somme(propre, bruit(8192, 0.06, 3));
    const avance = new Float32Array(sale.length);
    for (let i = 0; i < sale.length; i++) avance[i] = sale[(i + 1) % sale.length];
    const h = filtreDe("d8");
    const o = { operation: "debruiter" as const, forceSeuil: 0.6, doux: false, gardePc: 5 };

    const ecart = (combien: number) => {
      const a = traiterAvecDecalages(sale, h, 5, o, combien).son;
      const b = traiterAvecDecalages(avance, h, 5, o, combien).son;
      // On remet b en place avant de comparer : seul le traitement doit différer, pas le décalage.
      const remis = new Float32Array(b.length);
      for (let i = 0; i < b.length; i++) remis[(i + 1) % b.length] = b[i];
      return rapportSignalBruitDb(a, remis);
    };
    // Plus l'écart est grand en décibels, plus les deux versions se ressemblent.
    expect(ecart(8)).toBeGreaterThan(ecart(1) + 3);
  });

  it("un seuil plus fort annule davantage", () => {
    const d = decomposer(somme(tenue(8192, 440, 0.5), bruit(8192, 0.1, 5)), filtreDe("d4"), 5);
    const doux = (force: number) =>
      traiterCoefficients(d, { operation: "debruiter", forceSeuil: force, doux: true, gardePc: 5 });
    expect(doux(0).annules).toBe(0);
    expect(doux(2).annules).toBeGreaterThan(doux(0.5).annules);
    expect(doux(2).seuil).toBeGreaterThan(doux(0.5).seuil);
  });

  it("le seuillage doux rogne les coefficients gardés, le dur les laisse intacts", () => {
    const x = somme(tenue(4096, 440, 0.5), bruit(4096, 0.1, 9));
    const h = filtreDe("d4");
    const d = decomposer(x, h, 4);
    const options = { operation: "debruiter" as const, forceSeuil: 1, gardePc: 5 };
    const dur = traiterCoefficients(d, { ...options, doux: false });
    const doux = traiterCoefficients(d, { ...options, doux: true });
    expect(dur.annules).toBe(doux.annules);
    // Le doux perd de l'énergie là où le dur n'en perd pas.
    const e = (r: typeof dur) => energie(recomposer(r.decomposition, h));
    expect(e(doux)).toBeLessThan(e(dur));
  });

  it("« Reconstruire » ne touche à rien", () => {
    const x = bruit(2048, 0.4);
    const h = filtreDe("d6");
    const t = traiterCoefficients(decomposer(x, h, 4), { operation: "reconstruire", forceSeuil: 1, doux: true, gardePc: 5 });
    expect(t.annules).toBe(0);
    expect(rapportSignalBruitDb(x, recomposer(t.decomposition, h))).toBeGreaterThan(100);
  });

  it("le silence ne divise pas par zéro", () => {
    const x = new Float32Array(1024);
    const h = filtreDe("d4");
    const t = traiterCoefficients(decomposer(x, h, 4), { operation: "debruiter", forceSeuil: 1, doux: true, gardePc: 5 });
    expect(t.seuil).toBe(0);
    expect(recomposer(t.decomposition, h).every((v) => v === 0)).toBe(true);
    expect(rapportSignalBruitDb(x, x)).toBe(120);
  });
});

describe("les bandes", () => {
  it("chaque étage couvre une octave, du plus aigu au plus grave", () => {
    const b = bandesDetages(44100, 3);
    expect(b).toHaveLength(3);
    expect(b[0].hautHz).toBeCloseTo(22050, 3);
    expect(b[0].basHz).toBeCloseTo(11025, 3);
    expect(b[1].hautHz).toBeCloseTo(11025, 3);
    expect(b[2].basHz).toBeCloseTo(2756.25, 2);
  });

  it("LA RÉSOLUTION EST À Q CONSTANT, ce qui distingue l'ondelette de la transformée à court terme", () => {
    // Chaque bande est deux fois plus étroite que la précédente en hertz, mais toutes couvrent une
    // octave : la durée d'analyse double à chaque descente. C'est le grainlet, rendu exact.
    const b = bandesDetages(44100, 5);
    for (const bande of b) expect(bande.hautHz / bande.basHz).toBeCloseTo(2, 6);
    for (let i = 1; i < b.length; i++) {
      const largeur = (x: typeof b[number]) => x.hautHz - x.basHz;
      expect(largeur(b[i - 1]) / largeur(b[i])).toBeCloseTo(2, 6);
    }
  });
});
