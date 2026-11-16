// audio/dither-mise-en-forme.test.ts — Le bruit d'erreur, mesuré plutôt que cité.
//
// TOUT SE JUGE SUR L'ERREUR, sortie moins entrée, en LSB : c'est elle que le dither rend indépendante
// du signal, et elle que la mise en forme déplace. Les cas en capitales mesurent les quatre
// propriétés annoncées : un spectre plat sans mise en forme, qui suit |N|² avec, au niveau que la
// théorie donne ; aucune harmonique sur un sinus d'un LSB ; et le signal intact au-delà de la
// quantification. Chacun porte aussi le cas qui prouve que l'instrument voit : sans dither, les
// harmoniques sont là, et la mesure les trouve.
import { describe, expect, it } from "vitest";
import { creerQuantificateur16 } from "./dither";
import {
  BITS_MAX, FILTRES, ditherer, gainDePuissance, horsConception, moduleAuCarre, transfertDuBruit,
  type FormeDither, type MiseEnForme, type OptionsDither,
} from "./dither-mise-en-forme";
import { fft } from "./fft";

const FE = 44100;
const N = 4096;
const SEGMENTS = 64;
const MISES_EN_FORME: MiseEnForme[] = ["premier-ordre", "second-ordre", "e-5", "f-9"];

const sinus = (longueur: number, periodeOuHz: number, amplitude: number, parPeriode = false) =>
  Float32Array.from({ length: longueur }, (_, i) =>
    amplitude * Math.sin((2 * Math.PI * i) / (parPeriode ? periodeOuHz : FE / periodeOuHz)));

const opts = (o: Partial<OptionsDither> = {}): OptionsDither =>
  ({ bits: 16, forme: "triangulaire", miseEnForme: "aucune", graine: 7, ...o });

/** L'erreur rendue, en LSB de la profondeur choisie. */
function erreur(entree: Float32Array, o: OptionsDither): Float64Array {
  const r = ditherer([entree], o);
  const haut = 2 ** (r.bits - 1) - 1;
  return Float64Array.from(r.canaux[0], (y, i) => (y - entree[i]) * haut);
}

/**
 * La densité spectrale d'une erreur, case par case, par segments fenêtrés de Hann.
 *
 * NORMALISÉE PAR Σ w², de sorte qu'un bruit blanc de variance σ² rende σ² dans chaque case : la
 * théorie se compare alors case pour case, sans facteur caché.
 */
function densite(e: Float64Array): Float64Array {
  const w = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const sw2 = w.reduce((s, v) => s + v * v, 0);
  const p = new Float64Array(N / 2 + 1);
  const segments = Math.floor(e.length / N);
  for (let s = 0; s < segments; s++) {
    const re = Float64Array.from({ length: N }, (_, i) => e[s * N + i] * w[i]), im = new Float64Array(N);
    fft(re, im, false);
    for (let k = 0; k <= N / 2; k++) p[k] += (re[k] * re[k] + im[k] * im[k]) / sw2 / segments;
  }
  return p;
}

const moyenneDe = (x: ArrayLike<number>, de = 0, a = x.length) => {
  let s = 0;
  for (let i = de; i < a; i++) s += x[i];
  return s / (a - de);
};
const db = (x: number) => 10 * Math.log10(x);
const variance = (x: Float64Array) => { const m = moyenneDe(x); return moyenneDe(x.map((v) => (v - m) ** 2)); };

describe("la grille et le signal", () => {
  it("chaque échantillon rendu est un code de la profondeur choisie, dans [−1 ; 1]", () => {
    for (const bits of [2, 4, 8, 12, 16]) {
      const haut = 2 ** (bits - 1) - 1;
      const r = ditherer([sinus(8000, 440, 0.9)], opts({ bits, miseEnForme: "f-9" }));
      for (const y of r.canaux[0]) {
        expect(Math.abs(y * haut - Math.round(y * haut))).toBeLessThan(1e-3);
        expect(Math.abs(y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("SANS DITHER NI MISE EN FORME, le code est celui de l'écriture d'un WAV seize bits", () => {
    const x = sinus(5000, 331, 0.7);
    const wav = creerQuantificateur16({ dither: false });
    const r = ditherer([x], opts({ forme: "aucun" }));
    r.canaux[0].forEach((y, i) => expect(Math.round(y * 32767)).toBe(wav(x[i])));
  });

  it("l'erreur reste bornée : 1,5 LSB sans mise en forme, 1,5 · Σ|nₖ| avec", () => {
    const x = sinus(20000, 997, 0.5);
    for (const m of ["aucune", ...MISES_EN_FORME] as MiseEnForme[]) {
      const borne = 1.5 * transfertDuBruit(FILTRES[m]).reduce((s, v) => s + Math.abs(v), 0);
      const e = erreur(x, opts({ miseEnForme: m }));
      expect(Math.max(...e.map(Math.abs))).toBeLessThanOrEqual(borne + 1e-3);
    }
  });

  it("LE SIGNAL PASSE INCHANGÉ AU-DELÀ DE LA QUANTIFICATION : gain un, erreur sans moyenne ni corrélation", () => {
    const x = sinus(1 << 16, 997, 0.1);
    for (const m of ["aucune", "e-5", "f-9"] as MiseEnForme[]) {
      const y = ditherer([x], opts({ miseEnForme: m })).canaux[0];
      let xy = 0, xx = 0;
      for (let i = 0; i < x.length; i++) { xy += x[i] * y[i]; xx += x[i] * x[i]; }
      expect(Math.abs(xy / xx - 1)).toBeLessThan(1e-4);
      expect(Math.abs(moyenneDe(erreur(x, opts({ miseEnForme: m }))))).toBeLessThan(0.05);
    }
  });

  it("à vingt-quatre bits, la sortie égale l'entrée à 1,5 LSB près, plus le quart de LSB du flottant", () => {
    const x = sinus(20000, 1234, 0.8);
    const e = erreur(x, opts({ bits: 24 }));
    expect(Math.max(...e.map(Math.abs))).toBeLessThanOrEqual(1.75);
  });

  it("la profondeur est ramenée dans ses bornes, et une valeur qui n'est pas un nombre vaut zéro", () => {
    expect(ditherer([new Float32Array(4)], opts({ bits: 1 })).bits).toBe(2);
    expect(ditherer([new Float32Array(4)], opts({ bits: 30 })).bits).toBe(BITS_MAX);
    const r = ditherer([Float32Array.from([NaN, Infinity, -Infinity])], opts({ forme: "aucun" }));
    expect([...r.canaux[0]]).toEqual([0, 0, 0]);
  });
});

describe("le bruit d'erreur, mesuré", () => {
  const LONGUEUR = N * SEGMENTS;
  const musique = sinus(LONGUEUR, 997, 0.5);

  it("SANS MISE EN FORME, LE SPECTRE EST PLAT, AU QUART DE LSB² QUE DONNE LE DITHER TRIANGULAIRE", () => {
    const e = erreur(musique, opts());
    expect(variance(e)).toBeGreaterThan(0.25 * 0.98);
    expect(variance(e)).toBeLessThan(0.25 * 1.02);
    const p = densite(e);
    for (let b = 0; b < 8; b++) {
      const bande = moyenneDe(p, 1 + b * 256, 1 + (b + 1) * 256);
      expect(Math.abs(db(bande / 0.25))).toBeLessThan(0.5);
    }
  });

  it("AVEC MISE EN FORME, LE BRUIT SUIT |N|² BANDE PAR BANDE, AU NIVEAU QUE DONNE Σ nₖ²", () => {
    for (const m of MISES_EN_FORME) {
      const e = erreur(musique, opts({ miseEnForme: m }));
      expect(variance(e) / (0.25 * gainDePuissance(FILTRES[m]))).toBeGreaterThan(0.97);
      expect(variance(e) / (0.25 * gainDePuissance(FILTRES[m]))).toBeLessThan(1.03);
      const p = densite(e);
      const theorie = Float64Array.from(p, (_, k) => 0.25 * moduleAuCarre(FILTRES[m], (k * FE) / N, FE));
      let comparees = 0;
      for (let b = 0; b < 16; b++) {
        const de = 1 + b * 128, a = 1 + (b + 1) * 128;
        const attendu = moyenneDe(theorie, de, a);
        // Sous −36 dB du bruit plat, l'arrondi de la sortie en flottant simple affleure : hors mesure.
        if (attendu < 0.25 * 10 ** -3.6) continue;
        expect(Math.abs(db(moyenneDe(p, de, a) / attendu)), `${m}, bande ${b}`).toBeLessThan(0.5);
        comparees++;
      }
      expect(comparees).toBeGreaterThanOrEqual(13);
    }
  });

  it("LE BRUIT EST DÉPLACÉ VERS L'AIGU : le quart haut de la bande dépasse le quart bas de 10 dB et plus", () => {
    for (const m of MISES_EN_FORME) {
      const p = densite(erreur(musique, opts({ miseEnForme: m })));
      expect(db(moyenneDe(p, 1537, 2049) / moyenneDe(p, 1, 513)), m).toBeGreaterThan(10);
    }
    const plat = densite(erreur(musique, opts()));
    expect(Math.abs(db(moyenneDe(plat, 1537, 2049) / moyenneDe(plat, 1, 513)))).toBeLessThan(0.3);
  });

  it("GERZON ET CRAVEN : la mise en forme déplace le bruit en décibels, elle n'en retire pas", () => {
    // Sur les coefficients : une fonction de transfert à phase minimale de premier coefficient 1 a
    // une moyenne de log nulle sur la bande.
    for (const m of ["e-5", "f-9"] as MiseEnForme[]) {
      let somme = 0;
      for (let k = 0; k < 8192; k++) somme += db(moduleAuCarre(FILTRES[m], ((k + 0.5) * FE) / 16384, FE));
      expect(Math.abs(somme / 8192), m).toBeLessThan(0.01);
    }
    // Et sur le bruit rendu, par bandes de 32 cases : la moyenne des décibels égale celle du bruit plat.
    const parBandes = (p: Float64Array) => {
      let s = 0;
      for (let b = 0; b < 64; b++) s += db(moyenneDe(p, 1 + b * 32, 1 + (b + 1) * 32));
      return s / 64;
    };
    const plat = parBandes(densite(erreur(musique, opts())));
    for (const m of ["e-5", "f-9"] as MiseEnForme[]) {
      expect(Math.abs(parBandes(densite(erreur(musique, opts({ miseEnForme: m })))) - plat), m).toBeLessThan(0.3);
    }
  });

  it("le coût en bruit total des deux courbes publiées : 12,19 et 18,40 dB, celui-ci recoupé par Dunn et Sandler", () => {
    // DEUX ÉCHELLES DE PREUVE, et elles ne disent pas la même chose. Les 18 dB que Dunn et Sandler
    // donnent au filtre F de Wannamaker recoupent la courbe ; ils ne voient pas une coquille, puisque
    // 2,421 pour 2,412 rend 18,4021. Les quatre décimales épinglent donc la TRANSCRIPTION des tables
    // `lip44` et `fwe44` de SoX : un chiffre retouché après coup fait tomber ce cas.
    expect(db(gainDePuissance(FILTRES["e-5"]))).toBeCloseTo(12.1917, 4);
    expect(db(gainDePuissance(FILTRES["f-9"]))).toBeCloseTo(18.3994, 4);
    expect(Math.round(db(gainDePuissance(FILTRES["f-9"])))).toBe(18);
  });
});

describe("PAS DE DISTORSION HARMONIQUE SUR UN SINUS D'UN LSB", () => {
  // Un LSB d'amplitude, −90 dBFS à seize bits : sans dither, il ne reste qu'un escalier de trois
  // marches. Soixante-quatre échantillons par période, donc chaque harmonique sur une case.
  const PERIODE = 64;
  const faible = sinus(N * SEGMENTS, PERIODE, 1 / 32767, true);

  /** La puissance des harmoniques 2 à 12 rapportée au bruit que la théorie attend à leur place. */
  function rapportHarmonique(forme: FormeDither, m: MiseEnForme): number {
    const p = densite(erreur(faible, opts({ forme, miseEnForme: m, graine: 11 })));
    let s = 0;
    for (let h = 2; h <= 12; h++) {
      const k = (N / PERIODE) * h;
      s += p[k] / (0.25 * moduleAuCarre(FILTRES[m], (k * FE) / N, FE));
    }
    return s / 11;
  }

  it("AVEC DITHER TRIANGULAIRE, chaque harmonique se fond dans le bruit attendu, mise en forme ou non", () => {
    for (const m of ["aucune", "e-5", "f-9"] as MiseEnForme[]) {
      const r = rapportHarmonique("triangulaire", m);
      expect(r, m).toBeGreaterThan(0.6);
      expect(r, m).toBeLessThan(1.5);
    }
  });

  it("SANS DITHER, la même mesure trouve les harmoniques, et c'est ce qui prouve qu'elle voit", () => {
    expect(rapportHarmonique("aucun", "aucune")).toBeGreaterThan(10);
    // LA BOUCLE SEULE DÉCORRÈLE EN PARTIE, et le rapport tombe à 8,2 sous « E 5 coef. » : la
    // rétroaction d'un filtre d'ordre cinq brouille déjà l'escalier. Elle ne suffit pas pour autant,
    // et c'est ce que Dunn et Sandler (1997) rappellent : même mise en forme, le dither reste requis.
    expect(rapportHarmonique("aucun", "e-5")).toBeGreaterThan(5);
  });
});

describe("les formes du dither", () => {
  /**
   * Un niveau continu entre deux codes : le pire cas, l'erreur y étant constante sans dither.
   *
   * TROIS CENT VINGT MILLE ÉCHANTILLONS, et la longueur est mesurée : un bruit mis en forme est
   * coloré, donc sa variance s'estime moins bien qu'un bruit blanc. Sur vingt mille, l'étendue des
   * onze variances sous « E 5 coef. » valait 7,6 % ; sur quatre-vingt mille 3,1 %, sur trois cent
   * vingt mille 0,5 %. Elle décroît avec la longueur : c'est l'estimateur, non le signal.
   */
  const palier = (niveauLsb: number) => new Float32Array(320000).fill(niveauLsb / 32767);
  const parNiveau = (forme: FormeDither, m: MiseEnForme, mesure: (e: Float64Array) => number) =>
    Array.from({ length: 11 }, (_, k) => mesure(erreur(palier(100 + k / 10), opts({ forme, miseEnForme: m, graine: 31 + k }))));
  const etendue = (v: number[]) => (Math.max(...v) - Math.min(...v)) / Math.max(...v);

  it("RECTANGULAIRE libère la moyenne de l'erreur, mais sa variance suit encore le niveau", () => {
    for (const moy of parNiveau("rectangulaire", "aucune", moyenneDe)) expect(Math.abs(moy)).toBeLessThan(0.02);
    expect(etendue(parNiveau("rectangulaire", "aucune", variance))).toBeGreaterThan(0.5);
  });

  it("TRIANGULAIRE libère les deux, et la mise en forme le garde : à chaque niveau, la variance de la théorie", () => {
    for (const m of ["aucune", "e-5"] as MiseEnForme[]) {
      for (const moy of parNiveau("triangulaire", m, moyenneDe)) expect(Math.abs(moy)).toBeLessThan(0.05);
      const theorie = 0.25 * gainDePuissance(FILTRES[m]);
      for (const v of parNiveau("triangulaire", m, variance)) expect(Math.abs(v / theorie - 1), m).toBeLessThan(0.03);
    }
  });

  it("PASSE-HAUT garde le quart de LSB², et penche son spectre vers l'aigu", () => {
    const e = erreur(sinus(N * SEGMENTS, 997, 0.5), opts({ forme: "triangulaire-passe-haut" }));
    expect(variance(e)).toBeGreaterThan(0.25 * 0.98);
    expect(variance(e)).toBeLessThan(0.25 * 1.02);
    const p = densite(e);
    // L'arrondi, blanc, plus le dither de spectre (1/12)·|1 − z⁻¹|².
    for (let b = 0; b < 8; b++) {
      const de = 1 + b * 256, a = 1 + (b + 1) * 256;
      let attendu = 0;
      for (let k = de; k < a; k++) attendu += 1 / 12 + (1 - Math.cos((2 * Math.PI * k) / N)) / 6;
      expect(Math.abs(db(moyenneDe(p, de, a) / (attendu / (a - de)))), `bande ${b}`).toBeLessThan(0.5);
    }
    expect(etendue(parNiveau("triangulaire-passe-haut", "aucune", variance))).toBeLessThan(0.05);
  });
});

describe("l'écrêtage, la graine et la fréquence de conception", () => {
  it("L'ÉCRÊTAGE NE DÉSTABILISE PAS LA BOUCLE : le bruit hors des échantillons bornés reste celui de la théorie", () => {
    const r = ditherer([sinus(1 << 16, 997, 1.2)], opts({ miseEnForme: "f-9" }));
    expect(r.bornes).toBeGreaterThan(1000);
    for (const y of r.canaux[0]) expect(Math.abs(y)).toBeLessThanOrEqual(1);
    const attendu = Math.sqrt(0.25 * gainDePuissance(FILTRES["f-9"])) / 32767;
    expect(r.erreurEfficace / attendu).toBeGreaterThan(0.9);
    expect(r.erreurEfficace / attendu).toBeLessThan(1.1);
  });

  it("même graine, mêmes échantillons ; deux graines, deux bruits", () => {
    const x = sinus(3000, 500, 0.3);
    const a = ditherer([x], opts({ graine: 42, miseEnForme: "e-5" })).canaux[0];
    const b = ditherer([x], opts({ graine: 42, miseEnForme: "e-5" })).canaux[0];
    const c = ditherer([x], opts({ graine: 43, miseEnForme: "e-5" })).canaux[0];
    expect([...a]).toEqual([...b]);
    expect(a.filter((v, i) => v !== c[i]).length).toBeGreaterThan(1000);
  });

  it("deux canaux identiques reçoivent deux bruits indépendants", () => {
    const x = sinus(1 << 16, 997, 0.5);
    const r = ditherer([x, x], opts({ miseEnForme: "e-5" }));
    const g = Float64Array.from(r.canaux[0], (y, i) => y - x[i]);
    const d = Float64Array.from(r.canaux[1], (y, i) => y - x[i]);
    let gd = 0, gg = 0, dd = 0;
    for (let i = 0; i < g.length; i++) { gd += g[i] * d[i]; gg += g[i] * g[i]; dd += d[i] * d[i]; }
    expect(Math.abs(gd / Math.sqrt(gg * dd))).toBeLessThan(0.02);
  });

  it("les courbes calculées pour 44,1 kHz se disent hors de leur conception au-delà de 5 %", () => {
    expect(horsConception(FILTRES["e-5"], 44100)).toBe(false);
    expect(horsConception(FILTRES["e-5"], 46000)).toBe(false);
    expect(horsConception(FILTRES["e-5"], 48000)).toBe(true);
    expect(horsConception(FILTRES["f-9"], 96000)).toBe(true);
    expect(horsConception(FILTRES["second-ordre"], 96000)).toBe(false);
  });
});
