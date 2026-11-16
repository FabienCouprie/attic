// audio/filtre-tb303.test.ts — L'échelle à diodes : sa réponse mesurée, sa stabilité, ses bornes.
//
// LA RÉFÉRENCE EST CALCULÉE PAR UNE AUTRE VOIE QUE LE MODULE. Le module intègre dans le temps, quatre
// équations résolues ensemble à chaque échantillon ; la référence résout les mêmes équations
// linéarisées dans le domaine des fréquences, une fréquence à la fois, sous la transformation
// bilinéaire que l'intégration trapézoïdale réalise. Une faute dans l'une ne se retrouve pas dans
// l'autre. La réponse du module se mesure sur une impulsion de 1e-5, où chaque tangente vaut sa
// pente à l'origine à un dix-milliardième près.
import { describe, expect, it } from "vitest";
import {
  GAIN_MAX, GAIN_OSCILLATION, ITERATIONS, OMEGA_RESONANCE, PASSE_HAUT_BOUCLE, RAPPORTS_ETAGES, coupureUtile, echelleDiodes, filtrerVoieTb303,
} from "./filtre-tb303";
import { NOYAU, monter, redescendre } from "./surechantillonnage-double";

const FE = 48000;
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-15));

type C = [number, number];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];

/**
 * La boucle ouverte y4 / x du prototype, à la pulsation normalisée Ω (en unités de pulsation d'étage).
 *
 * Les équations : ẏ1 = w1(x − y1 + y2), ẏk = wk(yk−1 − 2yk + yk+1), ẏ4 = w4(y3 − 2y4). Le système
 * tridiagonal (jΩ − J) y = B x est résolu par élimination de Thomas, en complexes.
 */
function boucleOuverte(omega: number): C {
  const w = RAPPORTS_ETAGES;
  const diag: C[] = [[w[0], omega], [2 * w[1], omega], [2 * w[2], omega], [2 * w[3], omega]];
  const bas: C[] = [[0, 0], [-w[1], 0], [-w[2], 0], [-w[3], 0]];
  const haut: C[] = [[-w[0], 0], [-w[1], 0], [-w[2], 0], [0, 0]];
  const second: C[] = [[w[0], 0], [0, 0], [0, 0], [0, 0]];
  const d = [...diag], s = [...second];
  for (let i = 1; i < 4; i++) {
    const f = div(bas[i], d[i - 1]);
    d[i] = sub(d[i], mul(f, haut[i - 1]));
    s[i] = sub(s[i], mul(f, s[i - 1]));
  }
  return div(s[3], d[3]);
}

/** La même boucle ouverte, pour des rapports de condensateurs quelconques. */
function boucleOuverteDe(omega: number, w: readonly number[]): C {
  const d: C[] = [[w[0], omega], [2 * w[1], omega], [2 * w[2], omega], [2 * w[3], omega]];
  const bas: C[] = [[0, 0], [-w[1], 0], [-w[2], 0], [-w[3], 0]];
  const haut: C[] = [[-w[0], 0], [-w[1], 0], [-w[2], 0], [0, 0]];
  const s: C[] = [[w[0], 0], [0, 0], [0, 0], [0, 0]];
  for (let i = 1; i < 4; i++) {
    const f = div(bas[i], d[i - 1]);
    d[i] = sub(d[i], mul(f, haut[i - 1]));
    s[i] = sub(s[i], mul(f, s[i - 1]));
  }
  return div(s[3], d[3]);
}

/** La première pulsation où la partie imaginaire de `h` change de signe avec une partie réelle négative. */
function croisement(h: (w: number) => C, debut: number, fin: number): number {
  let wPrec = debut;
  for (let w = debut; w < fin; w *= 1.0005) {
    if (Math.sign(h(w)[1]) !== Math.sign(h(wPrec)[1]) && h(w)[0] < 0) {
      let a = wPrec, b = w;
      for (let i = 0; i < 80; i++) { const m = Math.sqrt(a * b); if (Math.sign(h(m)[1]) === Math.sign(h(a)[1])) a = m; else b = m; }
      return a;
    }
    wPrec = w;
  }
  return Number.NaN;
}

/** Le gain de boucle au croisement de phase, cœur analogique et passe-haut de la boucle, à la coupure fc. */
function gainDeBoucle(fc: number, k: number): number {
  const L = (f: number) => mul(div([0, f], [PASSE_HAUT_BOUCLE, f]), boucleOuverteDe((f / fc) * OMEGA_RESONANCE, RAPPORTS_ETAGES));
  return k * Math.hypot(...L(croisement(L, fc * 0.3, fc * 5)));
}

describe("le cœur, recoupé avec la littérature", () => {
  it("UN CONDENSATEUR DU BAS DE MOITIÉ EXACTE oscille à k = 17, à √2 fois la pulsation d'étage (Zavalishin, Stinchcombe)", () => {
    const w = croisement((x) => boucleOuverteDe(x, [2, 1, 1, 1]), 0.01, 50);
    expect(w).toBeCloseTo(Math.SQRT2, 9);
    expect(-1 / boucleOuverteDe(w, [2, 1, 1, 1])[0]).toBeCloseTo(17, 9);
  });

  it("au rapport 18/33 du schéma, les constantes du module sont celles du croisement de phase", () => {
    const w = croisement((x) => boucleOuverte(x), 0.01, 50);
    expect(w).toBeCloseTo(OMEGA_RESONANCE, 9);
    expect(-1 / boucleOuverte(w)[0]).toBeCloseTo(GAIN_OSCILLATION, 9);
  });

  it("avec le gain 18,72 du modèle complet de Stinchcombe, le gain de boucle vaut ses 0,943 à 820 Hz", () => {
    expect(gainDeBoucle(820, 18.717)).toBeCloseTo(0.943, 3);
  });

  it("AU GAIN RETENU, LE GAIN DE BOUCLE RESTE SOUS 0,943 À TOUTE COUPURE : 0,81 à 820 Hz", () => {
    expect(gainDeBoucle(820, GAIN_MAX)).toBeCloseTo(0.809, 3);
    for (let fc = 20; fc <= 20000; fc *= 1.25) expect(gainDeBoucle(fc, GAIN_MAX), `${fc} Hz`).toBeLessThan(0.943);
  });
});

/** Le gain attendu à la fréquence f, filtre linéaire, noyau de suréchantillonnage compris. */
function gainAttendu(f: number, coupure: number, resonance: number): number {
  const fe2 = 2 * FE;
  const t = Math.tan((Math.PI * f) / fe2);
  const G = Math.tan((Math.PI * coupureUtile(coupure, FE)) / fe2) / OMEGA_RESONANCE;
  const ol = boucleOuverte(t / G);
  const th = Math.tan((Math.PI * PASSE_HAUT_BOUCLE) / fe2);
  const hp = div([0, t], [th, t]);
  const k = GAIN_MAX * resonance;
  const h = div(ol, add([1, 0], mul([k, 0], mul(hp, ol))));
  // Le noyau passe deux fois : à la montée et à la descente.
  const demi = (NOYAU.length - 1) / 2;
  let n = 0;
  for (let i = -demi; i <= demi; i++) n += NOYAU[i + demi] * Math.cos((Math.PI * f * i) / FE);
  return Math.hypot(...h) * n * n;
}

/** Le module de la transformée de Fourier de h à la fréquence f. */
function moduleA(h: Float32Array, f: number): number {
  let re = 0, im = 0;
  const w = (2 * Math.PI * f) / FE;
  for (let i = 0; i < h.length; i++) { re += h[i] * Math.cos(w * i); im -= h[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}

/**
 * La réponse à une impulsion minuscule : le filtre y reste dans son régime linéaire.
 *
 * L'IMPULSION EST POSÉE AU RANG 64 ET LA RÉPONSE GARDÉE ENTIÈRE. Le noyau de suréchantillonnage est
 * centré, donc la réponse commence seize échantillons avant l'impulsion : la couper au rang de
 * l'impulsion retirait ce début, et le module relevé perdait 0,24 dB à 16 kHz. Le module ne dépend
 * pas du rang où l'on pose l'origine.
 */
function reponse(coupure: number, resonance: number, n = 1 << 15): Float32Array {
  const x = new Float32Array(n);
  const A = 1e-5;
  x[64] = A;
  return filtrerVoieTb303(x, { frequence: FE, coupure, resonance }).voie.map((v) => v / A);
}

/** Des fréquences au tiers d'octave, de 20 Hz à 0,4 fois la fréquence d'échantillonnage. */
const GRILLE: number[] = [];
for (let f = 20; f <= 0.4 * FE; f *= 2 ** (1 / 3)) GRILLE.push(f);

describe("la réponse linéaire", () => {
  it("suit le prototype à 0,01 dB près, de 20 Hz à 19,2 kHz, à trois résonances et trois coupures", () => {
    for (const coupure of [300, 1000, 5000]) {
      for (const resonance of [0, 0.5, 1]) {
        const h = reponse(coupure, resonance);
        for (const f of GRILLE) {
          const attendu = db(gainAttendu(f, coupure, resonance));
          // Sous −100 dB, l'arrondi du calcul en simple précision l'emporte : on n'y compare rien.
          if (attendu < -100) continue;
          expect(Math.abs(db(moduleA(h, f)) - attendu), `${coupure} Hz, ${resonance}, à ${f.toFixed(0)} Hz`).toBeLessThan(0.01);
        }
      }
    }
  });

  // LES CHIFFRES DE LA NOTICE SONT TENUS ICI : la notice les énonce comme des propriétés, et c'est ce
  // cas qui les relève.
  it("À RÉSONANCE NULLE, LE POINT À −3 dB EST 9,5 FOIS PLUS BAS QUE LA COUPURE : 84,3 Hz pour 800 Hz", () => {
    for (const coupure of [200, 800, 3000]) {
      const h = reponse(coupure, 0);
      // PAR DICHOTOMIE : à résonance nulle, le module décroît avec la fréquence. Chercher pas à pas,
      // une transformée entière par pas, prenait 21,9 s seul et 65,7 s sous la charge d'une passe
      // complète, au-delà du délai de 60 s.
      let bas = 1, haut = coupure;
      for (let k = 0; k < 40; k++) {
        const milieu = Math.sqrt(bas * haut);
        if (db(moduleA(h, milieu)) > -3) bas = milieu; else haut = milieu;
      }
      const f = Math.sqrt(bas * haut);
      expect(coupure / f, `${coupure} Hz`).toBeGreaterThan(9.4);
      expect(coupure / f, `${coupure} Hz`).toBeLessThan(9.6);
    }
  });

  it("la pente s'accentue au-dessus de la coupure : −13,7, −18,7 puis −22,5 dB par octave de 1 à 8 fois", () => {
    const h = reponse(800, 0);
    const pentes = [800, 1600, 3200].map((f) => db(moduleA(h, 2 * f)) - db(moduleA(h, f)));
    expect(pentes[0]).toBeCloseTo(-13.7, 1);
    expect(pentes[1]).toBeCloseTo(-18.7, 1);
    expect(pentes[2]).toBeCloseTo(-22.5, 1);
  });

  it("À 100 % ET 800 Hz, la bande passante est atténuée de 22 à 24 dB entre 100 et 200 Hz, et de 15 dB à 30 Hz", () => {
    const h = reponse(800, 1);
    for (const f of [100, 150, 200]) {
      expect(-db(moduleA(h, f)), `${f} Hz`).toBeGreaterThan(22);
      expect(-db(moduleA(h, f)), `${f} Hz`).toBeLessThan(24);
    }
    expect(-db(moduleA(h, 30))).toBeCloseTo(15.2, 1);
  });

  it("À 100 %, LE FILTRE N'OSCILLE DE LUI-MÊME À AUCUNE COUPURE : une impulsion s'éteint", () => {
    for (const coupure of [50, 300, 1000, 5000, 15000, 20000]) {
      const x = new Float32Array(FE);
      x[10] = 0.5;
      const y = filtrerVoieTb303(x, { frequence: FE, coupure, resonance: 1 }).voie;
      let fin = 0;
      for (let i = FE - FE / 10; i < FE; i++) fin = Math.max(fin, Math.abs(y[i]));
      expect(fin, `${coupure} Hz`).toBeLessThan(1e-6);
    }
  });
});

/** Un bruit blanc uniforme d'amplitude donnée, à graine fixe. */
function bruit(n: number, amplitude: number, graine = 12345): Float32Array {
  let e = graine;
  return new Float32Array(n).map(() => { e = (e * 1664525 + 1013904223) >>> 0; return amplitude * ((e / 4294967296) * 2 - 1); });
}

/** La plus grande valeur absolue, ou l'infini si un échantillon n'est pas fini. */
function crete(y: Float32Array): number {
  let c = 0;
  for (const v of y) { if (!Number.isFinite(v)) return Infinity; c = Math.max(c, Math.abs(v)); }
  return c;
}

describe("la non-linéarité", () => {
  /** Une dent de scie de 55 Hz, une seconde, d'amplitude donnée. */
  const scie = (amplitude: number) => new Float32Array(FE).map((_, i) => amplitude * ((((i * 55) / FE) % 1) * 2 - 1));
  const efficace = (y: ArrayLike<number>) => { let s = 0; for (let i = 0; i < y.length; i++) s += y[i] * y[i]; return Math.sqrt(s / y.length); };

  it("DEUX ITÉRATIONS SUFFISENT : l'écart à la solution convergée reste sous −70 dB du signal", () => {
    for (const amplitude of [0.25, 1, 4]) {
      for (const resonance of [0, 0.7, 1]) {
        const o = { frequence: FE, coupure: 1200, resonance };
        // Une demi-seconde, et vingt itérations pour référence : à huit, l'écart à quarante était
        // déjà nul. La version d'une seconde à quarante prenait 4,9 s seule.
        const montee = monter(scie(amplitude).subarray(0, FE / 2));
        const deux = redescendre(echelleDiodes(montee, o, ITERATIONS), FE / 2);
        const vingt = redescendre(echelleDiodes(montee, o, 20), FE / 2);
        const ecart = efficace(deux.map((v, i) => v - vingt[i]));
        expect(db(ecart / efficace(vingt)), `${amplitude}, ${resonance}`).toBeLessThan(-70);
      }
    }
  });

  it("LE FILTRE DÉFORME D'AUTANT PLUS LE SON QUE SON NIVEAU EST ÉLEVÉ", () => {
    // L'écart de forme : le son rendu, ramené à l'échelle de l'entrée, contre celui d'une entrée de
    // crête 0,001 où chaque tangente est droite. Relevé, coupure 1 kHz, aux résonances 0, 50 et 100 % :
    // de −45 à −29 dB à la crête 0,1, de −10 à −5 dB à la crête 1.
    for (const resonance of [0, 0.5, 1]) {
      const o = { frequence: FE, coupure: 1000, resonance };
      const lineaire = filtrerVoieTb303(scie(0.001), o).voie.map((v) => v / 0.001);
      const ecarts = [0.1, 0.25, 0.5, 1].map((a) => {
        const y = filtrerVoieTb303(scie(a), o).voie.map((v) => v / a);
        return db(efficace(y.map((v, i) => v - lineaire[i])) / efficace(lineaire));
      });
      for (let k = 1; k < ecarts.length; k++) expect(ecarts[k], `${resonance}`).toBeGreaterThan(ecarts[k - 1]);
      expect(ecarts[0]).toBeLessThan(-25);
      expect(ecarts[3]).toBeGreaterThan(-12);
    }
  });
});

describe("la stabilité", () => {
  it("À RÉSONANCE MAXIMALE, reste finie et bornée, du grave à l'aigu, sur un bruit dix fois trop fort", () => {
    for (const fe of [22050, 44100, 48000, 96000]) {
      for (const coupure of [10, 20, 100, 1000, 5000, 20000, 1e6]) {
        const y = filtrerVoieTb303(bruit(fe, 10), { frequence: fe, coupure, resonance: 1 }).voie;
        expect(crete(y), `${fe} Hz, coupure ${coupure}`).toBeLessThan(10);
      }
    }
  });

  it("reste finie quand la coupure et la résonance sautent d'un bout à l'autre à chaque échantillon", () => {
    const n = FE;
    const coupure = new Float32Array(n).map((_, i) => (i % 2 ? 20 : 20000));
    const resonance = new Float32Array(n).map((_, i) => (i % 3 ? 1 : 0));
    const y = filtrerVoieTb303(bruit(n, 1), { frequence: FE, coupure, resonance }).voie;
    expect(crete(y)).toBeLessThan(10);
  });

  it("ne rend aucun NaN : un échantillon non fini reçu compte pour un silence, et un réglage non fini pour son repli", () => {
    const x = bruit(FE / 4, 0.5);
    x[100] = Number.NaN; x[200] = Infinity; x[300] = -Infinity;
    const y = filtrerVoieTb303(x, { frequence: FE, coupure: Number.NaN, resonance: Number.NaN }).voie;
    expect(crete(y)).toBeLessThan(10);
    const coupure = new Float32Array(FE / 4).fill(Number.NaN);
    expect(crete(filtrerVoieTb303(x, { frequence: FE, coupure, resonance: 1 }).voie)).toBeLessThan(10);
  });

  it("un silence reçu rend un silence exact, à toute résonance", () => {
    const y = filtrerVoieTb303(new Float32Array(FE / 10), { frequence: FE, coupure: 800, resonance: 1 }).voie;
    expect(y.every((v) => v === 0)).toBe(true);
  });

  it("UNE COURBE CONSTANTE REND LE MÊME SON QUE LE NOMBRE, au bit près : un seul chemin de calcul", () => {
    const x = bruit(FE / 4, 0.5);
    const n = x.length;
    // 0,75 et 700 s'écrivent exactement en simple précision : 0,8 y deviendrait 0,800000012, et
    // l'écart viendrait du tableau, non du chemin.
    const parNombre = filtrerVoieTb303(x, { frequence: FE, coupure: 700, resonance: 0.75 }).voie;
    const parCourbe = filtrerVoieTb303(x, {
      frequence: FE, coupure: new Float32Array(n).fill(700), resonance: new Float32Array(n).fill(0.75),
    }).voie;
    expect(parCourbe).toEqual(parNombre);
  });
});
