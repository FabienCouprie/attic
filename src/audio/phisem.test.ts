// audio/phisem.test.ts — Ce qu'un modèle stochastique doit garantir malgré le hasard.
//
// Un son tiré au sort se teste par ses statistiques, pas par ses échantillons. Trois
// choses doivent tenir : le nombre de particules commande la densité de grains, l'énergie
// retombe quand on cesse de secouer, et les résonateurs se retrouvent dans le spectre —
// c'est là qu'on vérifie qu'une maraca à 3 kHz sonne bien à 3 kHz. À graine fixée, enfin,
// le son doit être rejouable à l'identique, ce qui n'est pas vrai d'un vrai tambourin mais
// est indispensable dans un graphe qu'on relance.
import { describe, expect, it } from "vitest";
import {
  SECOUEURS, coefficientDecroissance, secoueur, secoussesRegulieres, synthetiserSecoueur,
} from "./phisem";
import { fft } from "./fft";

const FS = 44100;

function hasardFixe(graine: number) {
  let x = graine >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

const rendre = (id: string, graine = 1, duree = 1, particules?: number) =>
  synthetiserSecoueur({
    secoueur: secoueur(id),
    duree,
    secousses: secoussesRegulieres(duree, 4, 0.5),
    frequenceEch: FS,
    particules,
  }, hasardFixe(graine));

const rms = (s: Float32Array, debut = 0, fin = s.length) => {
  let somme = 0;
  for (let i = debut; i < fin; i++) somme += s[i] * s[i];
  return Math.sqrt(somme / Math.max(1, fin - debut));
};

/** La fréquence du pic spectral, pour vérifier les résonateurs. */
function picSpectral(signal: Float32Array, fs: number): number {
  const n = 16384;
  const re = new Float64Array(n), im = new Float64Array(n);
  const debut = Math.floor(signal.length / 4);
  for (let i = 0; i < n && debut + i < signal.length; i++) {
    // Fenêtre de Hann : sans elle, les bords inventent des raies.
    re[i] = signal[debut + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  fft(re, im, false);
  let max = -1, pic = 0;
  for (let k = 1; k < n / 2; k++) {
    const m = re[k] * re[k] + im[k] * im[k];
    if (m > max) { max = m; pic = k; }
  }
  return (pic * fs) / n;
}

/** Le centre de gravité du spectre : la mesure qui vaut quand la résonance est large. */
function centroide(signal: Float32Array, fs: number): number {
  const n = 16384;
  const re = new Float64Array(n), im = new Float64Array(n);
  const debut = Math.floor(signal.length / 4);
  for (let i = 0; i < n && debut + i < signal.length; i++) {
    re[i] = signal[debut + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  fft(re, im, false);
  let somme = 0, poids = 0;
  for (let k = 1; k < n / 2; k++) {
    const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    somme += m * ((k * fs) / n);
    poids += m;
  }
  return poids > 0 ? somme / poids : 0;
}

describe("décroissances", () => {
  it("retombe de 60 dB dans le temps demandé, quelle que soit la fréquence d'échantillonnage", () => {
    for (const fs of [22050, 44100, 48000]) {
      const c = coefficientDecroissance(0.3, fs);
      expect(c ** (0.3 * fs), `${fs} Hz`).toBeCloseTo(0.001, 6);
    }
  });

  it("décroît d'autant plus lentement que la durée est longue", () => {
    expect(coefficientDecroissance(0.5, FS)).toBeGreaterThan(coefficientDecroissance(0.05, FS));
  });
});

describe("secousses", () => {
  it("place une secousse par intervalle demandé", () => {
    expect(secoussesRegulieres(2, 4, 0.5).length).toBe(8);
    expect(secoussesRegulieres(2, 4, 0.5)[1].instant).toBeCloseTo(0.25, 6);
  });

  it("n'en place aucune sur une durée nulle", () => {
    expect(secoussesRegulieres(0, 4, 0.5)).toEqual([]);
  });
});

describe("densité de grains", () => {
  it("engendre d'autant plus de collisions qu'il y a de particules", () => {
    const peu = rendre("maracas", 1, 1, 10).collisions;
    const moyen = rendre("maracas", 1, 1, 100).collisions;
    const beaucoup = rendre("maracas", 1, 1, 500).collisions;
    expect(peu).toBeLessThan(moyen);
    expect(moyen).toBeLessThan(beaucoup);
  });

  it("ne produit rien sans particule, et rien sans secousse", () => {
    expect(rendre("maracas", 1, 1, 0).collisions).toBe(0);
    const muet = synthetiserSecoueur(
      { secoueur: secoueur("maracas"), duree: 1, secousses: [], frequenceEch: FS },
      hasardFixe(1),
    );
    expect(muet.collisions).toBe(0);
    expect(rms(muet.signal)).toBe(0);
  });

  it("distingue la cabasa de la maraca par la densité — c'est ce qui les distingue", () => {
    // Des centaines de billes contre quelques graines : le crépitement devient chuintement.
    expect(rendre("cabasa").collisions).toBeGreaterThan(rendre("maracas").collisions * 5);
  });
});

describe("énergie", () => {
  it("retombe quand on cesse de secouer", () => {
    const duree = 2;
    const { signal } = synthetiserSecoueur({
      secoueur: secoueur("maracas"),
      duree,
      // Une seule secousse, au début.
      secousses: [{ instant: 0, energie: 1 }],
      frequenceEch: FS,
    }, hasardFixe(3));
    const debut = rms(signal, 0, FS * 0.2);
    const fin = rms(signal, FS * 1.5, FS * 2);
    expect(debut).toBeGreaterThan(0);
    expect(fin).toBeLessThan(debut / 100);
  });

  it("relance le son à chaque secousse", () => {
    const { signal } = synthetiserSecoueur({
      secoueur: secoueur("maracas"),
      duree: 2,
      secousses: [{ instant: 0, energie: 1 }, { instant: 1, energie: 1 }],
      frequenceEch: FS,
    }, hasardFixe(3));
    const creux = rms(signal, FS * 0.85, FS * 0.95);
    const relance = rms(signal, FS * 1.0, FS * 1.1);
    expect(relance).toBeGreaterThan(creux * 5);
  });
});

describe("résonateurs", () => {
  it("place le pic du spectre sur la résonance de l'instrument", () => {
    // Maracas : une seule résonance, annoncée à 3200 Hz.
    const pic = picSpectral(rendre("maracas", 7, 2).signal, FS);
    expect(pic).toBeGreaterThan(3200 * 0.9);
    expect(pic).toBeLessThan(3200 * 1.1);
  });

  it("monte le centre de gravité du spectre quand l'instrument résonne plus haut", () => {
    // Le chékéré est annoncé à 5500 Hz contre 3200 pour la maraca, mais son rayon de
    // pôle est bas : la résonance est si large qu'elle n'a presque pas de PIC, et c'est
    // voulu — c'est un son sec. Le centre de gravité est alors la bonne mesure.
    // Mesuré : 3815 Hz pour la maraca, 7563 Hz pour le chékéré.
    const maracas = centroide(rendre("maracas", 7, 2).signal, FS);
    const sekere = centroide(rendre("sekere", 7, 2).signal, FS);
    expect(sekere).toBeGreaterThan(maracas * 1.5);
  });

  it("place les gouttes d'eau dans le grave, là où elles sont annoncées", () => {
    const pic = picSpectral(rendre("gouttes", 5, 2).signal, FS);
    expect(pic).toBeGreaterThan(400);
    expect(pic).toBeLessThan(800);
  });
});

describe("reproductibilité et bornes", () => {
  it("rejoue exactement le même son à graine égale", () => {
    const a = rendre("tambourin", 11), b = rendre("tambourin", 11), c = rendre("tambourin", 12);
    expect(a.signal).toEqual(b.signal);
    expect(a.collisions).toBe(b.collisions);
    expect(c.signal).not.toEqual(a.signal);
  });

  it("ne sature jamais : la sortie est normalisée sous l'unité", () => {
    for (const s of SECOUEURS) {
      const { signal } = rendre(s.id, 4, 1);
      let crete = 0;
      for (const x of signal) crete = Math.max(crete, Math.abs(x));
      expect(crete, s.id).toBeLessThanOrEqual(0.9001);
      expect(crete, s.id).toBeGreaterThan(0.5);
    }
  });

  it("rend un signal de la longueur demandée", () => {
    expect(rendre("maracas", 1, 0.5).signal.length).toBe(Math.ceil(0.5 * FS));
  });

  it("retombe sur le premier instrument quand on en demande un inconnu", () => {
    expect(secoueur("n'existe pas").id).toBe("maracas");
  });
});
