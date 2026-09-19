// audio/pghi.test.ts — Retrouver une phase se mesure, et se compare à la méthode qu'on remplace.
//
// La mesure est celle de l'article : la CONVERGENCE SPECTRALE. On resynthétise à partir des seuls
// modules, on réanalyse, et on compare les modules obtenus aux modules voulus. Comparer les signaux
// échantillon par échantillon n'aurait aucun sens — le problème n'a pas de solution unique, un
// décalage de phase global donnant un son identique à l'oreille.
//
// Et le témoin est Griffin-Lim SUR LA MÊME FENÊTRE ET LE MÊME SAUT : sans cela, la comparaison
// mélangerait deux différences, l'algorithme et la fenêtre.
import { describe, expect, it } from "vitest";
import {
  analyser, convergenceSpectrale, fenetreGauss, griffinLim, pghi, synthetiser,
} from "./pghi";

const SR = 16000;
const TAILLE = 512;
const SAUT = 128; // recouvrement de trois quarts

function harmonique(dureeSec: number, f0 = 220, harmoniques = 5): Float32Array {
  const n = Math.round(dureeSec * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 1; h <= harmoniques; h++) v += Math.sin((2 * Math.PI * f0 * h * i) / SR + h * 0.4) / h;
    x[i] = 0.5 * v;
  }
  return x;
}

/** Un son qui bouge : deux notes séparées par un silence, et un glissando. */
function passage(dureeSec: number): Float32Array {
  const n = Math.round(dureeSec * SR);
  const x = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let a = 0, f = 300;
    if (t < 0.25) { a = 0.5; f = 300; }
    else if (t < 0.35) { a = 0; }
    else { a = 0.5; f = 300 * Math.pow(2, (t - 0.35) * 2); }
    phase += (2 * Math.PI * f) / SR;
    x[i] = a * (Math.sin(phase) + Math.sin(2 * phase) / 2);
  }
  return x;
}

/** Convergence spectrale d'un signal reconstruit, par rapport aux modules voulus. */
const convergence = (modules: Float32Array[], signal: Float32Array): number =>
  convergenceSpectrale(modules, analyser(signal, TAILLE, SAUT).modules);

describe("la fenêtre gaussienne", () => {
  it("décroît à deux millièmes au bord, ce qui la rend assez peu tronquée pour la relation", () => {
    const { fenetre } = fenetreGauss(512);
    expect(fenetre[256]).toBeCloseTo(1, 3);
    expect(fenetre[0]).toBeLessThan(0.01);
    expect(fenetre[0]).toBeGreaterThan(1e-5);
    // Symétrique AUTOUR DE SON CENTRE ENTIER, et non autour du milieu du tableau : c'est la
    // convention « périodique », et c'est elle qu'exige la rotation de la trame — un centre à la
    // demi-case laisserait un terme de phase linéaire en fréquence que PGHI intégrerait à tort.
    for (let d = 1; d < 256; d++) expect(fenetre[256 - d]).toBeCloseTo(fenetre[256 + d], 12);
  });
});

describe("analyse et synthèse", () => {
  it("rendent le signal de départ quand on garde les vraies phases", () => {
    const x = harmonique(0.3);
    const s = analyser(x, TAILLE, SAUT);
    const y = synthetiser(s);
    let ecart = 0;
    for (let i = 0; i < x.length; i++) ecart = Math.max(ecart, Math.abs(x[i] - y[i]));
    expect(ecart, `écart maximal ${ecart.toExponential(1)}`).toBeLessThan(1e-4);
  });

  it("gardent la longueur exacte du signal", () => {
    const x = harmonique(0.17);
    expect(synthetiser(analyser(x, TAILLE, SAUT)).length).toBe(x.length);
  });
});

describe("PGHI", () => {
  it("BAT FRANCHEMENT Griffin-Lim, et l'écart se chiffre en décibels", () => {
    const x = harmonique(0.4);
    const { modules } = analyser(x, TAILLE, SAUT);
    const { phases } = pghi(modules, TAILLE, SAUT);
    const sortiePghi = synthetiser({ modules, phases, taille: TAILLE, saut: SAUT, longueur: x.length });

    const cPghi = convergence(modules, sortiePghi);
    const cGl10 = convergence(modules, griffinLim(modules, TAILLE, SAUT, x.length, 10));
    const cGl100 = convergence(modules, griffinLim(modules, TAILLE, SAUT, x.length, 100));

    expect(cPghi, `PGHI ${cPghi.toFixed(1)} dB · GL(10) ${cGl10.toFixed(1)} · GL(100) ${cGl100.toFixed(1)}`)
      .toBeLessThan(cGl10);
    // Et sans itérer une seule fois : c'est là tout l'intérêt.
    expect(cPghi).toBeLessThan(-10);
  });

  it("tient aussi sur un passage qui bouge — notes, silence, glissando", () => {
    const x = passage(0.6);
    const { modules } = analyser(x, TAILLE, SAUT);
    const { phases, ilots, partIntegree } = pghi(modules, TAILLE, SAUT);
    const c = convergence(modules, synthetiser({ modules, phases, taille: TAILLE, saut: SAUT, longueur: x.length }));
    const cGl10 = convergence(modules, griffinLim(modules, TAILLE, SAUT, x.length, 10));
    expect(c, `PGHI ${c.toFixed(1)} dB · GL(10) ${cGl10.toFixed(1)} · ${ilots} îlot(s) · ${(100 * partIntegree).toFixed(0)} % intégré`)
      .toBeLessThan(cGl10);
  });

  it("SERT DE POINT DE DÉPART à Griffin-Lim, et le rend meilleur qu'un départ de rien", () => {
    // C'est la recommandation de l'article : PGHI n'exclut pas d'itérer, il donne à l'itération un
    // point de départ qui a du sens.
    const x = harmonique(0.4);
    const { modules } = analyser(x, TAILLE, SAUT);
    const { phases } = pghi(modules, TAILLE, SAUT);
    const cAffine = convergence(modules, griffinLim(modules, TAILLE, SAUT, x.length, 10, phases));
    const cNu = convergence(modules, griffinLim(modules, TAILLE, SAUT, x.length, 10));
    expect(cAffine, `PGHI+GL(10) ${cAffine.toFixed(1)} dB · GL(10) ${cNu.toFixed(1)}`).toBeLessThan(cNu);
  });

  it("AFFINÉ DE DIX TOURS, il dépasse cent tours de Griffin-Lim — pour un cinquième du temps", () => {
    // C'est le résultat qui décide de l'intérêt pratique de la méthode, et il se mesure.
    const x = harmonique(0.4);
    const { modules } = analyser(x, TAILLE, SAUT);
    const { phases } = pghi(modules, TAILLE, SAUT);
    const cMixte = convergence(modules, griffinLim(modules, TAILLE, SAUT, x.length, 10, phases));
    const cGl100 = convergence(modules, griffinLim(modules, TAILLE, SAUT, x.length, 100));
    expect(cMixte, `PGHI+GL(10) ${cMixte.toFixed(1)} dB · GL(100) ${cGl100.toFixed(1)} dB`)
      .toBeLessThan(cGl100);
  });

  it("EST MOINS BON QUE GRIFFIN-LIM SUR DU BRUIT, et il faut le savoir", () => {
    // La relation phase-magnitude vaut pour un son STRUCTURÉ : sur du bruit blanc, il n'y a pas de
    // gradient qui ait un sens, et l'intégration n'a rien à quoi se raccrocher. Mesuré : −8 dB
    // pour PGHI contre −14 pour dix tours de Griffin-Lim. C'est la limite de la méthode, et elle
    // est écrite ici pour qu'elle ne se découvre pas à l'usage.
    const n = Math.round(0.4 * SR);
    const x = new Float32Array(n);
    let g = 5;
    for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; x[i] = 0.4 * (g / 0x3fffffff - 1); }
    const { modules } = analyser(x, TAILLE, SAUT);
    const { phases } = pghi(modules, TAILLE, SAUT);
    const cPghi = convergence(modules, synthetiser({ modules, phases, taille: TAILLE, saut: SAUT, longueur: n }));
    const cGl10 = convergence(modules, griffinLim(modules, TAILLE, SAUT, n, 10));
    expect(cPghi, `bruit : PGHI ${cPghi.toFixed(1)} dB · GL(10) ${cGl10.toFixed(1)} dB`).toBeGreaterThan(cGl10);
    // Et l'affinage rattrape : c'est pourquoi le nœud affine par défaut.
    const cMixte = convergence(modules, griffinLim(modules, TAILLE, SAUT, n, 10, phases));
    expect(cMixte).toBeLessThan(cGl10);
  });

  it("compte les îlots : deux régions séparées par du vide s'intègrent indépendamment", () => {
    // Deux bouffées séparées par un silence franc, et rien d'autre. Les intégrer ensemble à travers
    // le vide propagerait du bruit : l'article coupe, et le nœud le dit.
    const n = Math.round(0.5 * SR);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      if (t < 0.12 || (t > 0.3 && t < 0.42)) x[i] = 0.5 * Math.sin((2 * Math.PI * 400 * i) / SR);
    }
    const { modules } = analyser(x, TAILLE, SAUT);
    const { ilots } = pghi(modules, TAILLE, SAUT, 1e-4);
    expect(ilots, `${ilots} îlots`).toBeGreaterThanOrEqual(2);
  });

  it("n'intègre pas là où il n'y a pas d'énergie : c'est ce qui l'empêche de propager du bruit", () => {
    const x = harmonique(0.3);
    const { modules } = analyser(x, TAILLE, SAUT);
    const large = pghi(modules, TAILLE, SAUT, 1e-8);
    const serre = pghi(modules, TAILLE, SAUT, 1e-2);
    expect(serre.partIntegree).toBeLessThan(large.partIntegree);
    expect(serre.partIntegree).toBeGreaterThan(0);
  });

  it("est déterministe : deux appels rendent exactement la même phase", () => {
    // Griffin-Lim part d'un hasard et ne rend jamais deux fois le même son ; PGHI, si.
    const { modules } = analyser(harmonique(0.2), TAILLE, SAUT);
    const a = pghi(modules, TAILLE, SAUT).phases;
    const b = pghi(modules, TAILLE, SAUT).phases;
    for (let t = 0; t < a.length; t++) for (let k = 0; k < a[t].length; k++) expect(a[t][k]).toBe(b[t][k]);
  });

  it("ne rend ni NaN ni infini sur du silence", () => {
    const { modules } = analyser(new Float32Array(SR / 4), TAILLE, SAUT);
    const r = pghi(modules, TAILLE, SAUT);
    expect(r.ilots).toBe(0);
    for (const p of r.phases) expect([...p].every(Number.isFinite)).toBe(true);
  });
});
