// audio/barre-modale.test.ts — Les rapports modaux publiés, retrouvés dans le spectre.
//
// Ce module ne se teste pas par ce qu'il calcule mais par ce que l'acoustique dit : une
// barre libre vibre sur 1 / 2,756 / 5,404 / 8,933, une barre de marimba est taillée pour
// tomber sur 1 / 4 / 10, et une cloche tubulaire sonne sur des partiels vers 2, 3, 4,2 et
// 5,4 — si bien que la note qu'on entend n'est PAS dans le son. Ces tests cherchent ces
// fréquences-là dans le spectre produit, et le dernier vérifie l'absence de la
// fondamentale, qui est le fait le plus contre-intuitif de toute la synthèse modale.
import { describe, expect, it } from "vitest";
import { BARRES, barre, synthetiserBarre } from "./barre-modale";
import { fft } from "./fft";

const FS = 44100;

const frapper = (id: string, frequence = 262, duree = 1.5, options: Partial<{ durete: number; amortissement: number; tremolo: number }> = {}) =>
  synthetiserBarre({
    barre: barre(id), frequence, duree, frequenceEch: FS,
    durete: options.durete ?? 0.5,
    amortissement: options.amortissement ?? 0,
    tremolo: options.tremolo ?? 0,
    frequenceTremolo: 5,
  });

function spectre(signal: Float32Array, depart = 0.02) {
  const n = 65536;
  const re = new Float64Array(n), im = new Float64Array(n);
  const debut = Math.floor(depart * FS);
  for (let i = 0; i < n && debut + i < signal.length; i++) {
    re[i] = signal[debut + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  fft(re, im, false);
  const mag: number[] = [];
  for (let k = 0; k < n / 2; k++) mag.push(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
  return { mag, resolution: FS / n };
}

/** Énergie autour d'une fréquence, à 2 % près. */
function energieAutour(signal: Float32Array, hz: number): number {
  const { mag, resolution } = spectre(signal);
  const centre = Math.round(hz / resolution);
  const large = Math.max(2, Math.round((hz * 0.02) / resolution));
  let s = 0;
  for (let k = Math.max(0, centre - large); k <= centre + large && k < mag.length; k++) s += mag[k];
  return s;
}

/** Les pics du spectre, du plus fort au plus faible. */
function pics(signal: Float32Array, combien: number): number[] {
  const { mag, resolution } = spectre(signal);
  const candidats: { hz: number; m: number }[] = [];
  for (let k = 2; k < mag.length - 1; k++) {
    if (mag[k] > mag[k - 1] && mag[k] > mag[k + 1] && mag[k] > 1e-3) {
      candidats.push({ hz: k * resolution, m: mag[k] });
    }
  }
  return candidats.sort((a, b) => b.m - a.m).slice(0, combien).map((c) => c.hz);
}

describe("rapports modaux", () => {
  it("place les modes d'une barre libre sur 1, 2,756, 5,404 et 8,933", () => {
    const f0 = 440;
    const signal = frapper("glockenspiel", f0, 1.5, { durete: 1 });
    for (const rapport of [1, 2.756, 5.404, 8.933]) {
      const attendu = f0 * rapport;
      const dedans = energieAutour(signal, attendu);
      // Entre deux modes, il ne doit presque rien y avoir : c'est ce qui prouve que le
      // spectre est fait de raies aux bons endroits et non d'un bruit large.
      const dehors = energieAutour(signal, attendu * 1.25);
      expect(dedans, `mode ${rapport}`).toBeGreaterThan(dehors * 10);
    }
  });

  it("ramène le marimba sur 1, 4 et 10 — c'est ce que fait l'arche creusée", () => {
    const f0 = 262;
    const signal = frapper("marimba", f0, 1.5, { durete: 1 });
    for (const rapport of [1, 4, 10]) {
      expect(energieAutour(signal, f0 * rapport), `mode ${rapport}`)
        .toBeGreaterThan(energieAutour(signal, f0 * rapport * 1.3) * 10);
    }
    // Et le deuxième mode de la barre libre, lui, a disparu.
    expect(energieAutour(signal, f0 * 2.756)).toBeLessThan(energieAutour(signal, f0 * 4));
  });

  it("ne met aucune énergie sur la note d'une cloche tubulaire — la fondamentale est absente", () => {
    const f0 = 262;
    const signal = frapper("cloche", f0, 2, { durete: 1 });
    const fondamentale = energieAutour(signal, f0);
    const premierPartiel = energieAutour(signal, f0 * 2);
    // La note perçue est reconstruite par l'oreille : elle ne figure pas dans le signal.
    expect(fondamentale).toBeLessThan(premierPartiel / 50);
    expect(premierPartiel).toBeGreaterThan(0);
  });

  it("fait battre le bol tibétain, par deux modes voisins", () => {
    const f0 = 220;
    const signal = frapper("bol", f0, 4, { durete: 0.3 });
    // Les deux modes annoncés à 1 et 1,02 : leur écart est de 2 % de la fondamentale.
    const deuxPremiers = pics(signal, 6).filter((hz) => hz > f0 * 0.9 && hz < f0 * 1.1).sort((a, b) => a - b);
    expect(deuxPremiers.length).toBeGreaterThanOrEqual(2);
    const ecart = deuxPremiers[deuxPremiers.length - 1] - deuxPremiers[0];
    expect(ecart).toBeGreaterThan(f0 * 0.01);
    expect(ecart).toBeLessThan(f0 * 0.03);
  });
});

describe("maillet", () => {
  it("réveille les modes hauts quand il est dur, et pas quand il est mou", () => {
    const f0 = 262;
    const aigu = (durete: number) => {
      const s = frapper("marimba", f0, 1, { durete });
      return energieAutour(s, f0 * 10) / energieAutour(s, f0);
    };
    expect(aigu(1)).toBeGreaterThan(aigu(0) * 2);
  });
});

describe("amortissement et trémolo", () => {
  it("raccourcit le son quand on amortit", () => {
    const queue = (amortissement: number) => {
      const s = frapper("vibraphone", 262, 3, { amortissement });
      let somme = 0;
      for (let i = Math.floor(FS * 2); i < s.length; i++) somme += s[i] * s[i];
      return Math.sqrt(somme / (s.length - Math.floor(FS * 2)));
    };
    expect(queue(1)).toBeLessThan(queue(0) / 5);
  });

  it("module l'amplitude au rythme du trémolo, sans couper le son", () => {
    const s = frapper("vibraphone", 262, 2, { tremolo: 1 });
    const rms = (d: number, f: number) => {
      let somme = 0;
      for (let i = d; i < f; i++) somme += s[i] * s[i];
      return Math.sqrt(somme / (f - d));
    };
    // À 5 Hz, un cycle fait 200 ms : on compare deux quarts de cycle opposés.
    const creux = rms(Math.floor(FS * 0.6), Math.floor(FS * 0.65));
    const crete = rms(Math.floor(FS * 0.7), Math.floor(FS * 0.75));
    expect(Math.abs(crete - creux)).toBeGreaterThan(0);
    expect(creux).toBeGreaterThan(0);
  });
});

describe("robustesse", () => {
  it("rend un signal de la longueur demandée pour tous les instruments", () => {
    for (const b of BARRES) {
      const s = frapper(b.id, 262, 0.5);
      expect(s.length, b.id).toBe(Math.ceil(0.5 * FS));
      let crete = 0;
      for (const x of s) crete = Math.max(crete, Math.abs(x));
      expect(crete, b.id).toBeGreaterThan(0.5);
      expect(crete, b.id).toBeLessThanOrEqual(0.9001);
    }
  });

  it("laisse tomber les modes au-delà de Nyquist plutôt que de les replier", () => {
    // Un glockenspiel très aigu : son quatrième mode dépasse 22 kHz et doit être ignoré.
    const s = frapper("glockenspiel", 3000, 0.3, { durete: 1 });
    for (const x of s) expect(Number.isFinite(x)).toBe(true);
    // Rien ne doit apparaître dans le grave par repliement.
    expect(energieAutour(s, 200)).toBeLessThan(energieAutour(s, 3000) / 10);
  });

  it("rejoue exactement le même son : rien n'est aléatoire ici", () => {
    expect(frapper("marimba")).toEqual(frapper("marimba"));
  });

  it("retombe sur le premier instrument quand on en demande un inconnu", () => {
    expect(barre("inconnu").id).toBe("glockenspiel");
  });
});
