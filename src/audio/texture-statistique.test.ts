// audio/texture-statistique.test.ts — Synthèse de texture par statistiques.
//
// Le test central n'est pas qu'un son sorte, mais que LA THÈSE DE L'ARTICLE se vérifie ici :
// les distributions de bandes prises seules ne suffisent pas, et ce sont les corrélations entre
// bandes qui rapprochent la synthèse du modèle. On le mesure, au lieu de le citer.
import { describe, expect, it } from "vitest";
import {
  bandesEtEnveloppes, centresErb, correlation, depuisErb, distanceStatistiques,
  imposerDistribution, statistiques, synthetiserTexture, versErb,
} from "./texture-statistique";

const SR = 22050;

/** Un bruit reproductible. */
function bruit(n: number, graine = 7): Float32Array {
  let g = graine;
  return Float32Array.from({ length: n }, () => {
    g = (g * 1103515245 + 12345) & 0x7fffffff;
    return g / 0x3fffffff - 1;
  });
}

/** Une « pluie » : des impulsions éparses filtrées, texture homogène s'il en est. */
function pluie(n: number, graine = 3): Float32Array {
  let g = graine;
  const suivant = () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (suivant() < 0.004) {
      const amp = 0.3 + suivant();
      const duree = 60 + Math.floor(suivant() * 200);
      const f = 1500 + suivant() * 4000;
      for (let k = 0; k < duree && i + k < n; k++) {
        x[i + k] += amp * Math.exp(-4 * k / duree) * Math.sin(2 * Math.PI * f * k / SR);
      }
    }
  }
  return x;
}

describe("l'échelle des bandes", () => {
  it("l'aller-retour ERB rend la fréquence de départ", () => {
    for (const hz of [50, 440, 1000, 8000]) expect(depuisErb(versErb(hz))).toBeCloseTo(hz, 6);
  });

  it("espace les bandes serré dans le grave et large dans l'aigu, comme la cochlée", () => {
    const c = centresErb(20, 50, 16000);
    const premierEcart = c[1] - c[0];
    const dernierEcart = c[19] - c[18];
    expect(dernierEcart).toBeGreaterThan(20 * premierEcart);
  });
});

describe("la décomposition", () => {
  it("range une sinusoïde dans la bande qui la contient, et pas ailleurs", () => {
    const n = 8192;
    const x = Float32Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / SR));
    const { enveloppes, centres } = bandesEtEnveloppes(x, SR, 16);
    const energies = enveloppes.map((e) => {
      let s = 0;
      for (let i = 1000; i < n - 1000; i++) s += e[i] * e[i];
      return s;
    });
    const gagnante = energies.indexOf(Math.max(...energies));
    // La bande gagnante doit entourer 1000 Hz.
    expect(centres[gagnante]).toBeGreaterThan(500);
    expect(centres[gagnante]).toBeLessThan(2000);
  });

  it("rend une enveloppe plate pour une sinusoïde, qui ne module pas", () => {
    const n = 8192;
    const x = Float32Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / SR));
    const { enveloppes } = bandesEtEnveloppes(x, SR, 16);
    const e = enveloppes.reduce((a, b) => {
      const sa = a.reduce((s, v) => s + v, 0), sb = b.reduce((s, v) => s + v, 0);
      return sb > sa ? b : a;
    });
    const milieu = [...e.slice(2000, 6000)];
    const moyenne = milieu.reduce((s, v) => s + v, 0) / milieu.length;
    const variation = Math.sqrt(milieu.reduce((s, v) => s + (v - moyenne) ** 2, 0) / milieu.length) / moyenne;
    expect(variation).toBeLessThan(0.1);
  });

  it("les enveloppes sont positives", () => {
    const { enveloppes } = bandesEtEnveloppes(bruit(4096), SR, 12);
    expect(enveloppes.every((e) => [...e].every((v) => v >= 0))).toBe(true);
  });
});

describe("les statistiques", () => {
  it("distinguent un bruit régulier d'une texture éparse", () => {
    // C'est l'éparsité qui sépare le souffle de la pluie : peu de fortes valeurs, beaucoup de
    // faibles. Elle se lit dans la variation et l'aplatissement.
    const sB = statistiques(bandesEtEnveloppes(bruit(16384), SR, 16).enveloppes);
    const sP = statistiques(bandesEtEnveloppes(pluie(16384), SR, 16).enveloppes);
    const moyenne = (a: Float64Array) => [...a].reduce((s, v) => s + v, 0) / a.length;
    expect(moyenne(sP.variations)).toBeGreaterThan(moyenne(sB.variations));
    expect(moyenne(sP.aplatissements)).toBeGreaterThan(moyenne(sB.aplatissements));
  });

  it("une corrélation vaut un avec soi-même et zéro entre deux bruits indépendants", () => {
    const a = bruit(4096, 1), b = bruit(4096, 999);
    expect(correlation(a, a)).toBeCloseTo(1, 6);
    expect(Math.abs(correlation(a, b))).toBeLessThan(0.1);
  });

  it("la distance d'un jeu de statistiques à lui-même est nulle", () => {
    const s = statistiques(bandesEtEnveloppes(pluie(8192), SR, 12).enveloppes);
    expect(distanceStatistiques(s, s)).toBe(0);
  });
});

describe("le transport de distribution", () => {
  it("donne EXACTEMENT la distribution du modèle, donc tous ses moments", () => {
    const v = bruit(1000, 5).map(Math.abs) as Float32Array;
    const modele = pluie(1000).map(Math.abs) as Float32Array;
    const r = imposerDistribution(v, modele);
    const triA = [...r].sort((a, b) => a - b);
    const triB = [...modele].sort((a, b) => a - b);
    for (let i = 0; i < triA.length; i++) expect(triA[i]).toBeCloseTo(triB[i], 5);
  });

  it("garde l'ordre temporel : le plus grand reste au même endroit", () => {
    const v = Float32Array.from([3, 1, 2]);
    const r = imposerDistribution(v, Float32Array.from([10, 20, 30]));
    expect(r[0]).toBe(30);
    expect(r[1]).toBe(10);
    expect(r[2]).toBe(20);
  });
});

describe("la synthèse", () => {
  const n = 16384;

  it("rend la longueur demandée, quelle que soit celle du modèle", () => {
    // C'est l'intérêt du procédé : cinq secondes de pluie en engendrent trente.
    const r = synthetiserTexture(pluie(8192), 20000, SR, { nombreBandes: 12, iterations: 2 });
    expect(r.son.length).toBe(20000);
  });

  it("ne recopie AUCUN échantillon du modèle", () => {
    // Ce qui la sépare du gel granulaire et de la mosaïque : rien n'est repris, tout est refait.
    const modele = pluie(n);
    const r = synthetiserTexture(modele, n, SR, { nombreBandes: 12, iterations: 2 });
    let identiques = 0;
    for (let i = 0; i < n; i++) if (Math.abs(r.son[i] - modele[i]) < 1e-7) identiques++;
    expect(identiques / n).toBeLessThan(0.01);
  });

  it("est reproductible à graine égale, et différente sinon", () => {
    const m = pluie(8192);
    const a = synthetiserTexture(m, 8192, SR, { nombreBandes: 10, iterations: 1, graine: 42 });
    const b = synthetiserTexture(m, 8192, SR, { nombreBandes: 10, iterations: 1, graine: 42 });
    const c = synthetiserTexture(m, 8192, SR, { nombreBandes: 10, iterations: 1, graine: 43 });
    expect([...a.son.slice(0, 200)]).toEqual([...b.son.slice(0, 200)]);
    expect([...a.son.slice(0, 200)]).not.toEqual([...c.son.slice(0, 200)]);
  });

  it("LES CORRÉLATIONS ENTRE BANDES RAPPROCHENT LA SYNTHÈSE DU MODÈLE", () => {
    // Le test central : la thèse de l'article, mesurée ici. McDermott et Simoncelli montrent que
    // les statistiques de bandes prises isolément ne produisent pas de texture convaincante, et
    // que ce sont les corrélations entre bandes qui font basculer le résultat. On compare donc
    // l'écart statistique final avec et sans.
    const modele = pluie(n);
    const sans = synthetiserTexture(modele, n, SR, { nombreBandes: 16, correlations: false, graine: 5 });
    const avec = synthetiserTexture(modele, n, SR, { nombreBandes: 16, correlations: true, iterations: 6, graine: 5 });
    expect(avec.ecart).toBeLessThan(sans.ecart);
  });

  it("ne bute pas sur le silence", () => {
    const r = synthetiserTexture(new Float32Array(4096), 4096, SR, { nombreBandes: 8, iterations: 1 });
    expect(r.son.length).toBe(4096);
    expect([...r.son].every((v) => Number.isFinite(v))).toBe(true);
  });
});
