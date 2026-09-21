// audio/spectral-wishart.test.ts — Les quatre mises en forme du spectre, éprouvées.
//
// LE TEST QUI TIENT TOUS LES AUTRES est le premier : analyser puis recoller sans rien changer doit
// rendre le son d'origine. Si le recollement se trompe, les quatre effets se trompent avec lui, et
// l'on passerait des heures à chercher la faute dans le mauvais fichier.
import { describe, expect, it } from "vitest";
import {
  SAUT, TAILLE_TRAME, analyser, enveloppeFormants, flouter, geler, glissandoInterieur,
  imposerModules, modules, recoller, spectreRisset, tracer,
} from "./spectral-wishart";

const SR = 44100;

function sinus(freqs: number[], dureeS: number, amplitudes?: number[]): Float32Array {
  const n = Math.floor(SR * dureeS);
  const x = new Float32Array(n);
  freqs.forEach((f, k) => {
    const a = amplitudes?.[k] ?? 1 / freqs.length;
    for (let i = 0; i < n; i++) x[i] += a * Math.sin((2 * Math.PI * f * i) / SR);
  });
  return x;
}

/** Énergie efficace, en ignorant les bords que le recollement ne couvre pas entièrement. */
function rms(x: Float32Array, marge = TAILLE_TRAME): number {
  let s = 0, n = 0;
  for (let i = marge; i < x.length - marge; i++) { s += x[i] * x[i]; n++; }
  return n > 0 ? Math.sqrt(s / n) : 0;
}

/** Écart maximal entre deux signaux, sur la partie que le recollement couvre. */
function ecartMax(a: Float32Array, b: Float32Array, marge = TAILLE_TRAME): number {
  let m = 0;
  for (let i = marge; i < Math.min(a.length, b.length) - marge; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

/** Le module de la case la plus forte, et son rang. */
function caseDominante(m: Float64Array): { rang: number; module: number } {
  let rang = 0;
  for (let i = 1; i < m.length / 2; i++) if (m[i] > m[rang]) rang = i;
  return { rang, module: m[rang] };
}

describe("analyser puis recoller", () => {
  it("sans rien changer, rend le son d'origine", () => {
    const x = sinus([440], 0.5);
    const y = recoller(analyser(x), x.length);
    expect(ecartMax(x, y)).toBeLessThan(1e-6);
  });

  it("reste exact sur un son composé, qui a plus de chances de révéler une faute", () => {
    const x = sinus([220, 437, 1310, 2600], 0.4);
    const y = recoller(analyser(x), x.length);
    expect(ecartMax(x, y)).toBeLessThan(1e-6);
  });

  it("reste exact à un saut inhabituel — c'est tout l'intérêt de diviser par les poids", () => {
    const saut = 373; // ni un diviseur de la trame, ni une puissance de deux
    const x = sinus([440, 660], 0.3);
    const y = recoller(analyser(x, TAILLE_TRAME, saut), x.length, TAILLE_TRAME, saut);
    expect(ecartMax(x, y)).toBeLessThan(1e-6);
  });

  it("rend un signal réel : aucune valeur n'est NaN ni infinie", () => {
    const y = recoller(analyser(sinus([440], 0.3)), Math.floor(SR * 0.3));
    expect([...y].every(Number.isFinite)).toBe(true);
  });
});

describe("le traçage spectral", () => {
  const x = sinus([440, 1500, 3700], 0.4, [1, 0.5, 0.25]);

  it("à une seule case gardée, il ne reste que le partiel dominant", () => {
    const y = recoller(tracer(analyser(x), 1), x.length);
    const m = modules(analyser(y)[10]);
    const dom = caseDominante(m);
    // 440 Hz sur une trame de 2048 à 44 100 Hz : case 20 ou 21.
    expect(dom.rang).toBeGreaterThanOrEqual(19);
    expect(dom.rang).toBeLessThanOrEqual(22);
    // Les deux autres partiels ont disparu : la case de 1500 Hz (≈ 70) est retombée très bas.
    expect(m[70]).toBeLessThan(dom.module * 0.05);
  });

  it("en gardant assez de cases, les trois partiels sont encore là", () => {
    const y = recoller(tracer(analyser(x), 40), x.length);
    const m = modules(analyser(y)[10]);
    const dom = caseDominante(m).module;
    expect(m[70]).toBeGreaterThan(dom * 0.1);  // 1500 Hz
    expect(m[172]).toBeGreaterThan(dom * 0.02); // 3700 Hz
  });

  it("garder plus de cases qu'il n'y en a ne casse rien", () => {
    const y = recoller(tracer(analyser(x), 99999), x.length);
    expect(ecartMax(x, y)).toBeLessThan(1e-6);
  });

  it("le son reste réel : un partiel gardé sans son reflet aurait fait du bruit", () => {
    const y = recoller(tracer(analyser(x), 3), x.length);
    expect([...y].every(Number.isFinite)).toBe(true);
    expect(rms(y)).toBeGreaterThan(0.01);
  });
});

describe("le flou spectral", () => {
  /** Un son qui change à mi-parcours : 440 Hz, puis 880 Hz. */
  const marche = () => {
    const a = sinus([440], 0.25), b = sinus([880], 0.25);
    const x = new Float32Array(a.length + b.length);
    x.set(a, 0); x.set(b, a.length);
    return x;
  };

  it("à largeur 1, il ne fait rien — les trames se suffisent", () => {
    const x = marche();
    expect(ecartMax(recoller(flouter(analyser(x), 1), x.length), x)).toBeLessThan(1e-6);
  });

  it("étale la bascule : la seconde hauteur s'entend AVANT qu'elle arrive", () => {
    const x = marche();
    const trames = analyser(x);
    const kBascule = Math.floor(x.length / 2 / SAUT);
    const avantNet = modules(trames[kBascule - 6]);
    const avantFlou = modules(flouter(trames, 24)[kBascule - 6]);
    // Case de 880 Hz sur 2048 points : ≈ 41.
    const net = Math.max(avantNet[40], avantNet[41], avantNet[42]);
    const flou = Math.max(avantFlou[40], avantFlou[41], avantFlou[42]);
    expect(flou).toBeGreaterThan(net * 2);
  });

  it("ne change pas la durée — c'est ce qui le distingue d'un étirement", () => {
    const x = marche();
    expect(recoller(flouter(analyser(x), 24), x.length).length).toBe(x.length);
  });

  it("garde l'énergie du même ordre : un flou n'est pas une atténuation", () => {
    const x = marche();
    const net = rms(x);
    const flou = rms(recoller(flouter(analyser(x), 16), x.length));
    expect(flou).toBeGreaterThan(net * 0.3);
    expect(flou).toBeLessThan(net * 2);
  });
});

describe("le gel spectral", () => {
  /** 440 Hz puis 880 Hz : après le gel, la seconde hauteur ne doit plus arriver. */
  const marche = () => {
    const a = sinus([440], 0.3), b = sinus([880], 0.3);
    const x = new Float32Array(a.length + b.length);
    x.set(a, 0); x.set(b, a.length);
    return x;
  };

  it("ce qui suit l'instant gelé garde la hauteur de cet instant", () => {
    const x = marche();
    const kGel = Math.floor(x.length * 0.35 / SAUT);
    const y = recoller(geler(analyser(x), kGel), x.length);
    const fin = modules(analyser(y)[analyser(y).length - 4]);
    const dom = caseDominante(fin);
    expect(dom.rang).toBeGreaterThanOrEqual(19); // 440 Hz, pas 880
    expect(dom.rang).toBeLessThanOrEqual(22);
  });

  it("ce qui précède l'instant gelé n'est pas touché", () => {
    const x = marche();
    const kGel = Math.floor(x.length * 0.6 / SAUT);
    const y = recoller(geler(analyser(x), kGel), x.length);
    const marge = TAILLE_TRAME;
    let m = 0;
    for (let i = marge; i < Math.floor(x.length * 0.5); i++) m = Math.max(m, Math.abs(x[i] - y[i]));
    expect(m).toBeLessThan(1e-6);
  });

  it("le son gelé ne s'éteint pas : il tient jusqu'au bout", () => {
    const x = marche();
    const y = recoller(geler(analyser(x), 4), x.length);
    const q = Math.floor(y.length / 4);
    let debut = 0, fin = 0;
    for (let i = q; i < 2 * q; i++) debut += y[i] * y[i];
    for (let i = y.length - 2 * q; i < y.length - q; i++) fin += y[i] * y[i];
    expect(Math.sqrt(fin / q)).toBeGreaterThan(Math.sqrt(debut / q) * 0.5);
  });

  it("un index hors bornes se ramène au plus proche, sans lever", () => {
    const x = sinus([440], 0.2);
    expect(() => recoller(geler(analyser(x), -50), x.length)).not.toThrow();
    expect(() => recoller(geler(analyser(x), 99999), x.length)).not.toThrow();
  });

  it("sur une suite vide, il ne se passe rien", () => {
    expect(geler([], 0)).toEqual([]);
  });
});

describe("l'enveloppe de formants", () => {
  it("efface les raies fines et garde les bosses larges", () => {
    const n = 512;
    const m = new Float64Array(n);
    // Une bosse large autour de la case 100, et une raie isolée en 200.
    for (let i = 0; i < n / 2; i++) m[i] = Math.exp(-0.5 * ((i - 100) / 30) ** 2);
    m[200] = 5;
    const env = enveloppeFormants(m, 12);
    expect(env[100]).toBeGreaterThan(env[200]); // la bosse survit, la raie est diluée
    expect(env[200]).toBeLessThan(m[200] * 0.3);
  });

  it("à largeur 0, elle ne lisse rien", () => {
    const m = Float64Array.from({ length: 64 }, (_, i) => (i === 10 ? 1 : 0));
    expect(enveloppeFormants(m, 0)[10]).toBeCloseTo(1, 10);
  });

  it("elle est symétrique, comme le spectre d'un signal réel", () => {
    const m = Float64Array.from({ length: 128 }, (_, i) => Math.abs(Math.sin(i)));
    const env = enveloppeFormants(m, 5);
    for (let i = 1; i < 64; i++) expect(env[128 - i]).toBeCloseTo(env[i], 12);
  });
});

describe("le ton de Risset et le glissando intérieur", () => {
  it("le spectre de Risset empile des partiels espacés d'une octave", () => {
    const s = spectreRisset(2048, SR, 0, 6);
    const rangs = [...s.slice(0, 1024)].map((v, i) => (v > 0.01 ? i : -1)).filter((i) => i > 0);
    expect(rangs.length).toBeGreaterThanOrEqual(3);
    // AU-DESSUS DE LA CASE 8 SEULEMENT, et c'est une propriété du procédé, pas une tolérance de
    // confort : une case vaut 21,5 Hz ici, si bien que les partiels graves tombent à côté de leur
    // fréquence — 1,67 au lieu de 2 entre la troisième et la quatrième octave. La cloche les garde
    // très faibles, mais le rapport n'y est pas.
    const nets = rangs.filter((i) => i >= 8);
    expect(nets.length).toBeGreaterThanOrEqual(2);
    for (let k = 1; k < nets.length; k++) expect(nets[k] / nets[k - 1]).toBeGreaterThan(1.8);
  });

  it("il est symétrique : sans cela, le recollement rendrait du bruit", () => {
    const s = spectreRisset(1024, SR, 0.3, 5);
    for (let i = 1; i < 512; i++) expect(s[1024 - i]).toBeCloseTo(s[i], 12);
  });

  it("au bout d'une octave de montée, le spectre est revenu sur lui-même", () => {
    const a = spectreRisset(2048, SR, 0, 6);
    const b = spectreRisset(2048, SR, 1, 6);
    for (let i = 0; i < 1024; i++) expect(b[i]).toBeCloseTo(a[i], 10);
  });

  it("le glissando garde l'enveloppe du son : une bosse de formant reste où elle est", () => {
    // Un son dont l'énergie est concentrée vers 1500 Hz.
    const x = sinus([1400, 1500, 1600], 0.4, [1, 1, 1]);
    const y = recoller(glissandoInterieur(analyser(x), {
      vitesse: 1, octaves: 6, lissage: 20, frequence: SR,
    }), x.length);
    const m = modules(analyser(y)[12]);
    const dom = caseDominante(m).rang;
    // La case dominante reste dans la région du formant (1400–1600 Hz ≈ cases 65–75),
    // là où un ton de Risset nu aurait son maximum au centre de sa cloche.
    expect(dom).toBeGreaterThan(40);
    expect(dom).toBeLessThan(110);
  });

  it("le son rendu est réel et audible", () => {
    const x = sinus([300, 900, 1500], 0.3);
    const y = recoller(glissandoInterieur(analyser(x), {
      vitesse: -1, octaves: 5, lissage: 16, frequence: SR,
    }), x.length);
    expect([...y].every(Number.isFinite)).toBe(true);
    expect(rms(y)).toBeGreaterThan(1e-4);
  });
});

describe("imposer des modules", () => {
  it("garde les phases et remplace les modules", () => {
    const trame = analyser(sinus([440], 0.1))[2];
    const cibles = Float64Array.from(modules(trame), () => 1);
    const impose = imposerModules(trame, cibles);
    for (let i = 0; i < 20; i++) {
      expect(Math.hypot(impose.re[i], impose.im[i])).toBeCloseTo(1, 8);
      expect(Math.atan2(impose.im[i], impose.re[i])).toBeCloseTo(Math.atan2(trame.im[i], trame.re[i]), 6);
    }
  });

  it("une case muette ne divise pas par zéro", () => {
    const trame = { re: new Float64Array(8), im: new Float64Array(8) };
    const impose = imposerModules(trame, Float64Array.from({ length: 8 }, () => 2));
    expect([...impose.re].every(Number.isFinite)).toBe(true);
  });
});
