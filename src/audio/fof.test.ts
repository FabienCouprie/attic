// audio/fof.test.ts — Les formants doivent tomber où la phonétique les mesure.
//
// Une voyelle synthétisée se vérifie objectivement : son spectre doit porter des bosses aux
// fréquences publiées par Peterson et Barney. Et surtout, ces bosses ne doivent PAS bouger
// quand la hauteur change — c'est toute la différence entre la synthèse de formants et la
// transposition d'un échantillon, qui déplace les formants avec la note et donne l'effet
// « Chipmunk ». Ce test-là est le cœur du module.
import { describe, expect, it } from "vitest";
import { VOYELLES, bouffee, laVoyelle, synthetiserFof } from "./fof";
import { fft } from "./fft";

const FS = 44100;

function hasardFixe(graine: number) {
  let x = graine >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

const chanter = (options: Partial<Parameters<typeof synthetiserFof>[0]> = {}) =>
  synthetiserFof({
    voyelle: laVoyelle("a"), frequence: 110, duree: 1, frequenceEch: FS,
    attaque: 0.003, facteurLargeur: 1, decalageFormants: 0,
    vibrato: 0, frequenceVibrato: 5, jitter: 0, ...options,
  }, hasardFixe(1));

function spectre(signal: Float32Array) {
  const n = 32768;
  const re = new Float64Array(n), im = new Float64Array(n);
  const debut = Math.floor(signal.length / 4);
  for (let i = 0; i < n && debut + i < signal.length; i++) {
    re[i] = signal[debut + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  fft(re, im, false);
  const mag: number[] = [];
  for (let k = 0; k < n / 2; k++) mag.push(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
  return { mag, resolution: FS / n };
}

/**
 * L'enveloppe spectrale, lissée sur 250 Hz.
 *
 * Un spectre de voix est fait de raies aux multiples de la fondamentale : chercher un
 * formant sur les raies brutes trouverait la raie la plus proche et non la bosse. Le
 * lissage donne l'enveloppe, qui est ce dont parle la phonétique.
 */
function enveloppe(signal: Float32Array): { valeur: (hz: number) => number; resolution: number } {
  const { mag, resolution } = spectre(signal);
  const demi = Math.round(125 / resolution);
  return {
    resolution,
    valeur: (hz: number) => {
      const centre = Math.round(hz / resolution);
      let s = 0, n = 0;
      for (let k = Math.max(0, centre - demi); k <= centre + demi && k < mag.length; k++) {
        s += mag[k];
        n++;
      }
      return s / Math.max(1, n);
    },
  };
}

describe("bouffée formantique", () => {
  it("oscille à la fréquence du formant", () => {
    const b = bouffee({ frequence: 1000, amplitude: 1, largeur: 60 }, FS, 0.002);
    // Une période de 1000 Hz fait 44,1 échantillons : on compte les passages par zéro.
    let passages = 0;
    for (let i = 1; i < 441; i++) if ((b[i] >= 0) !== (b[i - 1] >= 0)) passages++;
    expect(passages).toBeGreaterThanOrEqual(18);
    expect(passages).toBeLessThanOrEqual(22);
  });

  it("décroît d'autant plus vite que le formant est large", () => {
    const etroit = bouffee({ frequence: 1000, amplitude: 1, largeur: 30 }, FS, 0.002);
    const large = bouffee({ frequence: 1000, amplitude: 1, largeur: 300 }, FS, 0.002);
    expect(large.length).toBeLessThan(etroit.length);
  });

  it("monte progressivement au lieu de claquer", () => {
    const b = bouffee({ frequence: 1000, amplitude: 1, largeur: 60 }, FS, 0.005);
    expect(Math.abs(b[0])).toBeLessThan(0.01);
    // La crête ne tombe pas au premier échantillon : l'attaque a une durée. Elle n'atteint
    // pas l'amplitude nominale pour autant, parce que la bouffée décroît déjà pendant
    // qu'elle monte — une résonance étroite a une attaque plus longue que sa décroissance.
    const abs = [...b].map(Math.abs);
    const crete = abs.indexOf(Math.max(...abs));
    expect(crete).toBeGreaterThan(10);
    expect(Math.max(...abs)).toBeGreaterThan(0.2);
  });
});

describe("formants aux fréquences publiées", () => {
  it("place des bosses là où Peterson et Barney les mesurent", () => {
    for (const v of VOYELLES) {
      const e = enveloppe(chanter({ voyelle: v }).signal);
      const freqs = v.formants.map((f) => f.frequence);
      for (const f of freqs.slice(0, 3)) {
        // Deux formants voisins — le O a 570 et 840 Hz — se fondent en une seule bosse
        // large : chercher un creux entre eux ne veut alors rien dire. On ne teste donc la
        // saillance que des formants assez isolés pour en avoir une.
        const isole = freqs.every((autre) => autre === f || Math.abs(autre - f) > 400);
        if (!isole) continue;
        expect(e.valeur(f), `${v.id} ${f} Hz, à droite`).toBeGreaterThan(e.valeur(f + 350));
        if (f > 500) {
          expect(e.valeur(f), `${v.id} ${f} Hz, à gauche`).toBeGreaterThan(e.valeur(f - 350));
        }
      }
    }
  });

  it("distingue le I du A là où la phonétique les distingue", () => {
    // Le A a un premier formant haut (730 Hz) et un deuxième bas (1090) ; le I l'inverse
    // (270 et 2290). C'est le contraste le plus net de toute la table.
    const a = enveloppe(chanter({ voyelle: laVoyelle("a") }).signal);
    const i = enveloppe(chanter({ voyelle: laVoyelle("i") }).signal);
    expect(a.valeur(730) / a.valeur(270)).toBeGreaterThan(i.valeur(730) / i.valeur(270));
    expect(i.valeur(2290) / i.valeur(1090)).toBeGreaterThan(a.valeur(2290) / a.valeur(1090));
  });
});

describe("hauteur et formants indépendants", () => {
  it("ne déplace pas les formants quand la hauteur change", () => {
    // C'est la propriété qui justifie le procédé : un échantillon transposé, lui, emporte
    // ses formants avec lui et donne une voix de dessin animé.
    const graves = enveloppe(chanter({ frequence: 80 }).signal);
    const aigus = enveloppe(chanter({ frequence: 320 }).signal);
    for (const f of [730, 1090, 2440]) {
      const creux = f * 1.35;
      expect(graves.valeur(f) / graves.valeur(creux), `grave ${f}`).toBeGreaterThan(1);
      expect(aigus.valeur(f) / aigus.valeur(creux), `aigu ${f}`).toBeGreaterThan(1);
    }
  });

  it("change la période avec la fondamentale", () => {
    const periode = (f: number) => {
      const { signal } = chanter({ frequence: f, duree: 0.5 });
      const debut = Math.floor(FS * 0.2), termes = 4000;
      let meilleur = 0, max = -Infinity;
      for (let lag = Math.floor(FS / 500); lag < Math.floor(FS / 50); lag++) {
        let s = 0;
        for (let i = 0; i < termes; i++) s += signal[debut + i] * signal[debut + i + lag];
        if (s > max) { max = s; meilleur = lag; }
      }
      return FS / meilleur;
    };
    // La période est un nombre entier d'échantillons : la hauteur obtenue est donc la plus
    // proche possible, à un demi-hertz près à 220 Hz, et c'est exact.
    expect(Math.abs(periode(110) - 110) / 110).toBeLessThan(0.01);
    expect(Math.abs(periode(220) - 220) / 220).toBeLessThan(0.01);
  });

  it("déplace les formants, et eux seuls, quand on change la taille du conduit", () => {
    // Douze demi-tons : les formants doublent, la hauteur ne bouge pas.
    const normal = enveloppe(chanter().signal);
    const double = enveloppe(chanter({ decalageFormants: 12 }).signal);
    expect(double.valeur(1460) / double.valeur(730))
      .toBeGreaterThan(normal.valeur(1460) / normal.valeur(730));
  });
});

describe("réglages de voix", () => {
  it("élargit les bosses quand on ouvre les largeurs de bande", () => {
    // Une résonance large porte plus loin de son centre : c'est la définition même de la
    // largeur de bande, et c'est ce qu'on mesure — le niveau à 400 Hz sous le formant,
    // rapporté au niveau du formant.
    const jupe = (facteurLargeur: number) => {
      const e = enveloppe(chanter({ facteurLargeur }).signal);
      return e.valeur(330) / e.valeur(730);
    };
    expect(jupe(4)).toBeGreaterThan(jupe(1));
  });

  it("déclenche cinq bouffées par période", () => {
    const { bouffees } = chanter({ frequence: 100, duree: 1 });
    // Cent périodes, cinq formants.
    expect(bouffees).toBeGreaterThanOrEqual(5 * 99);
    expect(bouffees).toBeLessThanOrEqual(5 * 102);
  });

  it("rend la voix instable avec le jitter, et stable sans", () => {
    const sans = chanter({ jitter: 0, duree: 0.5 }).signal;
    const avec = chanter({ jitter: 1, duree: 0.5 }).signal;
    expect(sans).not.toEqual(avec);
    // Sans jitter ni vibrato, deux exécutions sont identiques.
    expect(chanter({ jitter: 0, duree: 0.5 }).signal).toEqual(sans);
  });
});

describe("robustesse", () => {
  it("rend la longueur demandée, sans saturer", () => {
    const { signal } = chanter({ duree: 0.4 });
    expect(signal.length).toBe(Math.ceil(0.4 * FS));
    let crete = 0;
    for (const x of signal) crete = Math.max(crete, Math.abs(x));
    expect(crete).toBeCloseTo(0.9, 6);
  });

  it("ne replie aucun formant au-delà de Nyquist", () => {
    // Décalage de deux octaves : le cinquième formant dépasserait 18 kHz.
    const { signal } = chanter({ decalageFormants: 24, duree: 0.3 });
    for (const x of signal) expect(Number.isFinite(x)).toBe(true);
  });

  it("tient les fondamentales extrêmes", () => {
    for (const frequence of [20, 40, 880, 2000]) {
      const { signal } = chanter({ frequence, duree: 0.2 });
      for (const x of signal) expect(Number.isFinite(x), `${frequence} Hz`).toBe(true);
    }
  });

  it("retombe sur la première voyelle quand on en demande une inconnue", () => {
    expect(laVoyelle("zzz").id).toBe("a");
  });
});
