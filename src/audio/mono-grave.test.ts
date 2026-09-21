// audio/mono-grave.test.ts — Le grave réuni, l'aigu intact, et la somme mono au bit près.
//
// QUATRE PROPRIÉTÉS, ET LA TROISIÈME EST CELLE QUI A FAIT RÉÉCRIRE LE MODULE :
//
//   1. sous la coupure, le côté disparaît — donc les deux canaux s'y rejoignent ;
//   2. au-dessus, l'image n'est pas touchée ;
//   3. LA SOMME MONO RESSORT AU BIT PRÈS, quel que soit le réglage. Elle ne le faisait pas dans un
//      premier jet qui séparait chaque canal en deux bandes : la bande « aiguë » obtenue par
//      soustraction gardait la moitié du grave, parce qu'un filtre déphase. Écrire le traitement
//      comme un passe-haut sur le CÔTÉ rend la chose exacte, et gratuite ;
//   4. à quantité nulle, l'entrée ressort telle quelle, sans même un déphasage.
import { describe, expect, it } from "vitest";
import { aigu, correlation, grave, monoGrave } from "./mono-grave";

const SR = 44100;
const N = SR;

const sinus = (hz: number, phase = 0, n = N) =>
  Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / SR + phase));

const somme = (...xs: Float32Array[]) =>
  Float32Array.from({ length: xs[0].length }, (_, i) => xs.reduce((a, x) => a + x[i], 0));

/** Le niveau efficace, en ne regardant que la fin : les filtres ont un régime transitoire. */
const rms = (x: Float32Array) => {
  const debut = Math.floor(x.length / 2);
  let s = 0;
  for (let i = debut; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / (x.length - debut));
};

describe("les filtres", () => {
  it("le passe-haut coupe le grave et laisse l'aigu", () => {
    expect(rms(aigu(sinus(30), 120, SR))).toBeLessThan(0.01);
    expect(rms(aigu(sinus(3000), 120, SR))).toBeGreaterThan(0.3);
  });

  it("à la coupure, il reste la moitié de l'amplitude", () => {
    const r = rms(aigu(sinus(120), 120, SR)) / rms(sinus(120));
    expect(r).toBeGreaterThan(0.4);
    expect(r).toBeLessThan(0.6);
  });
});

describe("le grave en mono", () => {
  it("SOUS LA COUPURE, LE CÔTÉ DISPARAÎT et les deux canaux s'y rejoignent", () => {
    const g = sinus(50), d = sinus(70);
    const r = monoGrave(g, d, 120, SR);
    expect(Math.abs(r.correlationAvant)).toBeLessThan(0.2);   // deux graves sans rapport
    // 0,99 serait trop exiger : un passe-haut à 24 dB par octave laisse environ −33 dB de côté à
    // 50 Hz sous une coupure à 120, et ce reste suffit à décorréler de quelques millièmes. Mesuré :
    // 0,9897. C'est `coteRetireDb` qui mesure vraiment le travail, et il dit −30 dB.
    expect(r.correlationApres).toBeGreaterThan(0.98);         // …devenus presque le même
    // LE CHIFFRE QUI MESURE VRAIMENT LE TRAVAIL. Il dépend de la distance à la coupure, comme tout
    // filtre : mesuré sous 120 Hz, −22,7 dB pour un côté à 50 et 70 Hz, −40,9 dB à 30 et 40 Hz.
    expect(r.coteRetireDb).toBeLessThan(-20);
  });

  it("LA SOMME MONO RESSORT AU BIT PRÈS, à n'importe quel réglage", () => {
    // Le milieu n'est jamais filtré : c'est ce que l'écriture sur le côté garantit.
    const g = somme(sinus(50), sinus(800));
    const d = somme(sinus(70, 1.2), sinus(900, 2));
    for (const q of [0, 0.5, 1]) {
      const r = monoGrave(g, d, 120, SR, q);
      for (let i = 0; i < N; i += 997) {
        expect(r.gauche[i] + r.droite[i]).toBeCloseTo(g[i] + d[i], 6);
      }
    }
  });

  it("un grave en opposition de phase, qui s'annulait en mono, cesse de s'annuler", () => {
    // Le cas qui coûte le plus cher : deux graves opposés ne laissent rien sur une enceinte unique.
    const g = somme(sinus(50), sinus(1000));
    const d = somme(sinus(50, Math.PI), sinus(1000, 0.3));
    const graveMono = (a: Float32Array, b: Float32Array) =>
      rms(grave(Float32Array.from({ length: N }, (_, i) => (a[i] + b[i]) / 2), 120, SR));
    expect(graveMono(g, d)).toBeLessThan(0.002);              // il ne restait rien
    const r = monoGrave(g, d, 120, SR);
    // Le traitement ne ressuscite pas ce qui s'annule — rien ne le peut —, mais il garantit que
    // plus RIEN ne peut s'annuler ensuite : le côté grave est parti, −30,6 dB mesurés.
    //
    // La corrélation, elle, reste à −1 dans ce cas précis, et ce n'est pas un échec : les deux
    // graves étant devenus quasi nuls, il ne reste que leur résidu, qui est toujours opposé. C'est
    // l'ÉNERGIE qui a disparu, et c'est elle qu'il faut regarder ici.
    expect(r.coteRetireDb).toBeLessThan(-30);
  });

  it("AU-DESSUS DE LA COUPURE, L'IMAGE N'EST PAS TOUCHÉE", () => {
    const g = somme(sinus(50), sinus(3000));
    const d = somme(sinus(50, Math.PI), sinus(3000, 1.1));
    const r = monoGrave(g, d, 120, SR);
    const coteAvant = rms(aigu(Float32Array.from({ length: N }, (_, i) => (g[i] - d[i]) / 2), 500, SR));
    const coteApres = rms(aigu(Float32Array.from({ length: N }, (_, i) => (r.gauche[i] - r.droite[i]) / 2), 500, SR));
    expect(coteApres).toBeCloseTo(coteAvant, 3);
  });

  it("À QUANTITÉ NULLE, LE SIGNAL RESSORT EXACTEMENT TEL QUEL — pas même un déphasage", () => {
    const g = somme(sinus(50), sinus(800), sinus(5000));
    const d = somme(sinus(60, 0.4), sinus(900, 2), sinus(4000, 1));
    const r = monoGrave(g, d, 120, SR, 0);
    for (let i = 0; i < N; i += 997) {
      expect(r.gauche[i]).toBeCloseTo(g[i], 6);
      expect(r.droite[i]).toBeCloseTo(d[i], 6);
    }
    expect(r.coteRetireDb).toBeCloseTo(0, 6);
  });

  it("à quantité partielle, le côté grave baisse sans disparaître", () => {
    const r = monoGrave(sinus(50), sinus(70), 120, SR, 0.5);
    expect(r.coteRetireDb).toBeLessThan(-3);
    expect(r.coteRetireDb).toBeGreaterThan(-15);
  });

  it("la coupure décide : plus elle est haute, plus le côté perd", () => {
    const g = sinus(200), d = sinus(260);
    expect(monoGrave(g, d, 300, SR).coteRetireDb).toBeLessThan(monoGrave(g, d, 80, SR).coteRetireDb);
  });

  it("un signal vide ou mono ne fait pas lever", () => {
    expect(() => monoGrave(new Float32Array(0), new Float32Array(0), 120, SR)).not.toThrow();
    const x = sinus(100, 0, 64);
    expect(monoGrave(x, x, 120, SR).gauche.length).toBe(64);
    expect(correlation(new Float32Array(0), new Float32Array(0))).toBe(1);
  });
});
