// audio/sms.test.ts — Modèle sinusoïdes + bruit.
//
// Les cas sont choisis pour que la réponse soit connue d'avance : une sinusoïde pure est
// entièrement déterministe, un bruit blanc entièrement stochastique, et un son à trois partiels
// doit donner trois pistes aux trois bonnes fréquences. Si l'analyse ne retrouve pas cela, elle
// ne modélise rien.
import { describe, expect, it } from "vitest";
import { analyserSms, picsDeTrame, recalerEnergie, suivrePistes, synthetiserPistes, type Pic } from "./sms";
import { fenetreHann } from "./stft";
import { fft } from "./fft";

const SR = 44100;

const somme = (freqs: number[], n = 32768, amps?: number[]) =>
  Float32Array.from({ length: n }, (_, i) =>
    freqs.reduce((s, f, k) => s + (amps?.[k] ?? 1 / freqs.length) * Math.sin(2 * Math.PI * f * i / SR), 0));

function bruit(n: number, graine = 11): Float32Array {
  let g = graine;
  return Float32Array.from({ length: n }, () => {
    g = (g * 1103515245 + 12345) & 0x7fffffff;
    return 0.5 * (g / 0x3fffffff - 1);
  });
}

const energie = (x: Float32Array) => {
  let e = 0;
  for (let i = 0; i < x.length; i++) e += x[i] * x[i];
  return e;
};

/** Le spectre d'une trame isolée, fenêtrée, comme l'analyse le voit. */
function trame(x: Float32Array, debut: number, taille = 2048): [Float64Array, Float64Array] {
  const w = fenetreHann(taille);
  const re = new Float64Array(taille), im = new Float64Array(taille);
  for (let i = 0; i < taille; i++) re[i] = (x[debut + i] ?? 0) * w[i];
  fft(re, im, false);
  return [re, im];
}

describe("la détection de pics", () => {
  it("trouve une sinusoïde à moins d'un hertz, malgré des bins de vingt et un", () => {
    // Sans interpolation parabolique, la résolution serait celle des bins — 44100/2048 = 21,5 Hz
    // — et un la 440 se lirait à 431 ou 452. C'est ce qui rend la transposition juste.
    const [re, im] = trame(somme([440]), 8192);
    const pics = picsDeTrame(re, im, SR);
    expect(pics.length).toBeGreaterThan(0);
    expect(pics[0].frequence).toBeCloseTo(440, 0);
  });

  it("trouve les trois partiels d'un son à trois partiels", () => {
    const [re, im] = trame(somme([300, 600, 900]), 8192);
    const pics = picsDeTrame(re, im, SR, { seuilDb: 40 });
    const freqs = pics.map((p) => p.frequence);
    for (const f of [300, 600, 900]) {
      expect(freqs.some((x) => Math.abs(x - f) < 3), `${f} Hz parmi ${freqs.map((v) => v.toFixed(0))}`).toBe(true);
    }
  });

  it("ne trouve rien dans le silence", () => {
    const [re, im] = trame(new Float32Array(4096), 0);
    expect(picsDeTrame(re, im, SR)).toEqual([]);
  });

  it("respecte le nombre maximal demandé, en gardant les plus forts", () => {
    const [re, im] = trame(somme([200, 400, 600, 800, 1000, 1200]), 8192);
    expect(picsDeTrame(re, im, SR, { maxPics: 3 }).length).toBeLessThanOrEqual(3);
  });
});

describe("le suivi de partiels", () => {
  const pic = (frequence: number, amplitude = 1): Pic => ({ frequence, amplitude, bin: Math.round(frequence * 2048 / SR) });

  it("relie une fréquence stable en une seule piste", () => {
    const trames = Array.from({ length: 10 }, () => [pic(440)]);
    const pistes = suivrePistes(trames);
    expect(pistes.length).toBe(1);
    expect(pistes[0].points.length).toBe(10);
  });

  it("suit une fréquence qui glisse", () => {
    const trames = Array.from({ length: 10 }, (_, t) => [pic(440 * 2 ** (t * 0.02 / 12))]);
    expect(suivrePistes(trames).length).toBe(1);
  });

  it("coupe quand le saut dépasse la tolérance, et ouvre une autre piste", () => {
    const trames = [[pic(440)], [pic(440)], [pic(440)], [pic(880)], [pic(880)], [pic(880)]];
    const pistes = suivrePistes(trames, { tolerance: 1, minTrames: 2 });
    expect(pistes.length).toBe(2);
  });

  it("jette les pistes trop courtes, qui sont du bruit ayant eu de la chance", () => {
    const trames = [[pic(440)], [pic(440)], [], [], [pic(1000)]];
    expect(suivrePistes(trames, { minTrames: 3 })).toEqual([]);
  });

  it("garde deux partiels distincts sans les confondre", () => {
    const trames = Array.from({ length: 8 }, () => [pic(300, 1), pic(600, 0.5)]);
    const pistes = suivrePistes(trames);
    expect(pistes.length).toBe(2);
    const moyennes = pistes.map((p) => p.points.reduce((s, x) => s + x.frequence, 0) / p.points.length);
    expect(moyennes.sort((a, b) => a - b)[0]).toBeCloseTo(300, 0);
    expect(moyennes[1]).toBeCloseTo(600, 0);
  });

  it("une partielle forte ne se fait pas voler sa piste par une faible", () => {
    // L'appariement va du plus fort au plus faible : c'est ce qui rend le suivi stable.
    const trames = [[pic(440, 1)], [pic(445, 0.1), pic(441, 1)]];
    const pistes = suivrePistes(trames, { minTrames: 2 });
    expect(pistes.length).toBe(1);
    expect(pistes[0].points[1].frequence).toBeCloseTo(441, 0);
  });
});

describe("la décomposition", () => {
  it("trouve une sinusoïde ENTIÈREMENT déterministe", () => {
    const x = somme([440], 32768, [0.8]);
    const { deterministe, residu } = analyserSms(x, SR);
    expect(energie(residu) / energie(deterministe)).toBeLessThan(0.05);
  });

  it("trouve un bruit blanc ENTIÈREMENT stochastique", () => {
    const { deterministe, residu } = analyserSms(bruit(32768), SR);
    expect(energie(deterministe) / energie(residu)).toBeLessThan(0.5);
  });

  it("LES DEUX PARTIES REDONNENT LE SON, échantillon pour échantillon", () => {
    // La propriété qui autorise à parler de décomposition : les masques sont complémentaires,
    // donc rien ne se perd ni ne s'invente entre le déterministe et le résidu.
    const x = somme([220, 440, 660], 16384);
    const { deterministe, residu } = analyserSms(x, SR);
    let ecart = 0;
    for (let i = 0; i < x.length; i++) {
      ecart = Math.max(ecart, Math.abs(x[i] - (deterministe[i] + residu[i])));
    }
    expect(ecart).toBeLessThan(1e-5);
  });

  it("retrouve les partiels d'un son harmonique dans ses pistes", () => {
    const { pistes } = analyserSms(somme([300, 600, 900], 32768), SR, { seuilDb: 40, minTrames: 5 });
    const moyenne = (p: typeof pistes[number]) => p.points.reduce((s, x) => s + x.frequence, 0) / p.points.length;
    const freqs = pistes.map(moyenne).sort((a, b) => a - b);
    for (const f of [300, 600, 900]) {
      expect(freqs.some((x) => Math.abs(x - f) < 5), `${f} Hz parmi ${freqs.map((v) => v.toFixed(0))}`).toBe(true);
    }
  });

  it("LE SOUFFLE AJOUTÉ VA AU RÉSIDU, ET LES PARTIELS N'EN SAVENT RIEN", () => {
    // La bonne façon de poser la question : on décompose le même son avec et sans souffle, et
    // l'on regarde où l'ajout est parti. Mesurer la seule part déterministe ne dirait rien —
    // trois sinusoïdes à pleine amplitude écrasent un bruit discret, et 98 % de déterministe
    // serait une réponse juste ; c'est l'erreur que ce test a d'abord commise.
    const x = somme([300, 600, 900], 32768);
    const b = bruit(32768, 5);
    const melange = Float32Array.from(x, (v, i) => v + b[i]);
    const propre = analyserSms(x, SR);
    const souffle = analyserSms(melange, SR);
    // Le résidu enfle de tout ce qu'on a ajouté.
    expect(energie(souffle.residu)).toBeGreaterThan(10 * energie(propre.residu));
    // Les partiels, eux, ne bougent presque pas : le bruit ne les a ni gonflés ni mangés.
    const rapport = energie(souffle.deterministe) / energie(propre.deterministe);
    expect(rapport).toBeGreaterThan(0.7);
    expect(rapport).toBeLessThan(1.5);
  });
});

describe("le recalage d'énergie", () => {
  it("porte un signal à l'énergie d'un autre", () => {
    const a = Float32Array.from([1, -1, 1, -1]);
    const b = Float32Array.from([2, -2, 2, -2]);
    expect(energie(recalerEnergie(a, b))).toBeCloseTo(energie(b), 5);
  });

  it("ne divise pas par zéro sur un signal muet", () => {
    const muet = new Float32Array(8);
    expect([...recalerEnergie(muet, Float32Array.from([1, 1]))]).toEqual([...muet]);
  });
});

describe("la resynthèse additive, celle qui transforme", () => {
  it("rejoue une sinusoïde à sa fréquence", () => {
    const pistes = [{ points: Array.from({ length: 20 }, (_, t) => ({ trame: t, frequence: 440, amplitude: 0.5, bin: 20 })) }];
    const y = synthetiserPistes(pistes, 512 * 20, SR, 512);
    // Mesure par corrélation, loin des bords.
    let c = 0, s = 0;
    for (let i = 1000; i < 8000; i++) {
      const a = 2 * Math.PI * 440 * i / SR;
      c += y[i] * Math.cos(a); s += y[i] * Math.sin(a);
    }
    expect(2 * Math.hypot(c, s) / 7000).toBeGreaterThan(0.3);
  });

  it("TRANSPOSE LES PARTIELS SANS TOUCHER AU RÉSIDU — tout l'intérêt du modèle", () => {
    // Une octave au-dessus : les partiels doublent, et le résidu, lui, n'est même pas consulté.
    const pistes = [{ points: Array.from({ length: 20 }, (_, t) => ({ trame: t, frequence: 300, amplitude: 0.5, bin: 14 })) }];
    const y = synthetiserPistes(pistes, 512 * 20, SR, 512, { transposition: 12 });
    const amplitudeA = (f: number) => {
      let c = 0, s = 0;
      for (let i = 1000; i < 8000; i++) {
        const a = 2 * Math.PI * f * i / SR;
        c += y[i] * Math.cos(a); s += y[i] * Math.sin(a);
      }
      return 2 * Math.hypot(c, s) / 7000;
    };
    expect(amplitudeA(600)).toBeGreaterThan(0.3);
    expect(amplitudeA(300)).toBeLessThan(0.05);
  });

  it("suit le gain demandé", () => {
    const pistes = [{ points: Array.from({ length: 10 }, (_, t) => ({ trame: t, frequence: 440, amplitude: 1, bin: 20 })) }];
    const fort = synthetiserPistes(pistes, 5120, SR, 512, { gain: 1 });
    const faible = synthetiserPistes(pistes, 5120, SR, 512, { gain: 0.25 });
    expect(energie(faible) / energie(fort)).toBeCloseTo(0.0625, 2);
  });

  it("ne claque pas aux jointures de trames : la phase est intégrée, pas reprise", () => {
    // Une phase reprise à chaque trame ferait un saut toutes les 512 lectures ; on vérifie qu'il
    // n'y a aucune discontinuité brutale.
    const pistes = [{ points: Array.from({ length: 20 }, (_, t) => ({ trame: t, frequence: 1000, amplitude: 0.5, bin: 46 })) }];
    const y = synthetiserPistes(pistes, 512 * 20, SR, 512);
    let sautMax = 0;
    for (let i = 600; i < 9000; i++) sautMax = Math.max(sautMax, Math.abs(y[i] - y[i - 1]));
    // Une sinusoïde de 1 kHz à 44,1 kHz monte au plus de 0,5 × 2π × 1000/44100 ≈ 0,071 par pas.
    expect(sautMax).toBeLessThan(0.1);
  });
});
