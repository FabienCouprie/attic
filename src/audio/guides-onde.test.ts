// audio/guides-onde.test.ts — Un instrument à vent se vérifie par son spectre.
//
// Ces tests ne comparent pas des échantillons : ils mesurent ce que l'acoustique prédit et
// que le modèle doit retrouver tout seul. La clarinette doit sonner à la fréquence demandée
// et ne produire que des harmoniques IMPAIRS, parce que son tuyau est fermé à un bout —
// c'est la signature du clarinet et personne ne l'a programmée comme telle. Le cuivre doit
// s'éclaircir quand on souffle plus fort, parce que l'onde se raidit. La flûte doit être
// presque sinusoïdale. Et les trois doivent tenir leur hauteur sur tout le registre, ce
// qui a demandé deux corrections trouvées par la mesure : le retard du filtre de pertes,
// et l'amorçage du tuyau qui décide du mode.
import { describe, expect, it } from "vitest";
import { SEUILS, synthetiserVent, type Vent } from "./guides-onde";
import { fft } from "./fft";

const FS = 44100;

function hasardFixe(graine: number) {
  let x = graine >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

const jouer = (instrument: Vent, frequence: number, pression = 0.8, duree = 1.2) =>
  synthetiserVent({
    instrument, frequence, duree, frequenceEch: FS, pression,
    souffle: 0.05, vibrato: 0, frequenceVibrato: 5, attaque: 0.05, extinction: 0.05,
  }, hasardFixe(1));

/** Spectre de la partie tenue du son, fenêtré. */
function spectre(signal: Float32Array) {
  const n = 32768;
  const re = new Float64Array(n), im = new Float64Array(n);
  const debut = Math.floor(signal.length / 3);
  for (let i = 0; i < n && debut + i < signal.length; i++) {
    re[i] = signal[debut + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  fft(re, im, false);
  const mag: number[] = [];
  for (let k = 0; k < n / 2; k++) mag.push(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
  return { mag, resolution: FS / n };
}

function hauteur(signal: Float32Array): number {
  const { mag, resolution } = spectre(signal);
  let pic = 0, max = 0;
  for (let k = 2; k < mag.length; k++) if (mag[k] > max) { max = mag[k]; pic = k; }
  return pic * resolution;
}

function centroide(signal: Float32Array): number {
  const { mag, resolution } = spectre(signal);
  let s = 0, p = 0;
  for (let k = 1; k < mag.length; k++) { s += mag[k] * k * resolution; p += mag[k]; }
  return s / Math.max(1e-9, p);
}

/** Énergie autour du h-ième harmonique de `f`. */
function harmonique(signal: Float32Array, f: number, h: number): number {
  const { mag, resolution } = spectre(signal);
  const b = Math.round((f * h) / resolution);
  let s = 0;
  for (let k = Math.max(0, b - 3); k <= b + 3 && k < mag.length; k++) s += mag[k];
  return s;
}

describe("justesse", () => {
  it("sonne à la fréquence demandée, sur tout le registre", () => {
    // Mesuré : la clarinette rend 220,7 et 440,1 ; le cuivre 219,4 / 434,7 / 854,6 ;
    // la flûte 220,7 / 434,7 / 849,2. Le pire écart est de 3 % dans l'aigu du cuivre.
    for (const [instrument, frequences] of [
      ["clarinette", [220, 440]],
      ["flute", [220, 440, 880]],
      ["cuivre", [220, 440, 880]],
    ] as [Vent, number[]][]) {
      for (const f of frequences) {
        const mesuree = hauteur(jouer(instrument, f).signal);
        expect(Math.abs(mesuree - f) / f, `${instrument} ${f} → ${mesuree.toFixed(1)}`)
          .toBeLessThan(0.04);
      }
    }
  });

  it("garde sa hauteur quand la pression change", () => {
    // Un instrument dont la hauteur dépend du souffle serait injouable dans un graphe.
    for (const instrument of ["cuivre", "flute"] as Vent[]) {
      for (const p of [0.4, 0.6, 0.8, 1]) {
        const mesuree = hauteur(jouer(instrument, 440, p).signal);
        expect(Math.abs(mesuree - 440) / 440, `${instrument} pression ${p}`).toBeLessThan(0.04);
      }
    }
  });
});

describe("timbre", () => {
  it("ne donne à la clarinette que des harmoniques impairs — le tuyau fermé", () => {
    const { signal } = jouer("clarinette", 220);
    let impairs = 0, pairs = 0;
    for (let h = 1; h <= 9; h++) {
      const e = harmonique(signal, 220, h);
      if (h % 2 === 1) impairs += e; else pairs += e;
    }
    // Mesuré : les harmoniques pairs pèsent 0,4 % des impairs.
    expect(pairs / impairs).toBeLessThan(0.05);
  });

  it("donne au cuivre des harmoniques pairs, lui — le tuyau est ouvert", () => {
    const { signal } = jouer("cuivre", 220, 0.4);
    let impairs = 0, pairs = 0;
    for (let h = 1; h <= 9; h++) {
      const e = harmonique(signal, 220, h);
      if (h % 2 === 1) impairs += e; else pairs += e;
    }
    expect(pairs / impairs).toBeGreaterThan(0.05);
  });

  it("éclaircit le cuivre quand on souffle plus fort — l'onde se raidit", () => {
    // Mesuré : centre de gravité du spectre de 1020 Hz à 3393 Hz de la pression 0,2 à 1.
    const centres = [0.2, 0.4, 0.6, 0.8, 1].map((p) => centroide(jouer("cuivre", 220, p).signal));
    for (let i = 1; i < centres.length; i++) {
      expect(centres[i], `pression ${i}`).toBeGreaterThan(centres[i - 1]);
    }
    expect(centres[centres.length - 1]).toBeGreaterThan(centres[0] * 2);
  });

  it("rend la flûte presque sinusoïdale : c'est le vent le plus pauvre en harmoniques", () => {
    const { signal } = jouer("flute", 440);
    const f1 = harmonique(signal, 440, 1);
    let reste = 0;
    for (let h = 2; h <= 9; h++) reste += harmonique(signal, 440, h);
    expect(f1).toBeGreaterThan(reste * 2);
  });
});

describe("comportement", () => {
  it("met un temps à s'établir, comme un vrai instrument", () => {
    const { signal } = jouer("clarinette", 220, 0.8, 1.5);
    const rms = (d: number, f: number) => {
      let s = 0;
      for (let i = d; i < f; i++) s += signal[i] * signal[i];
      return Math.sqrt(s / (f - d));
    };
    // Les dix premières millisecondes sont plus faibles que le régime établi.
    expect(rms(0, Math.floor(FS * 0.01))).toBeLessThan(rms(Math.floor(FS * 0.5), Math.floor(FS * 0.6)));
  });

  it("reste muet sous le seuil de souffle de la clarinette", () => {
    // L'anche ne décolle pas : sous 0,4, il ne sort qu'un bruit de souffle sans hauteur.
    const faible = jouer("clarinette", 220, 0.1);
    const forte = jouer("clarinette", 220, 0.8);
    const h1 = (s: Float32Array) => harmonique(s, 220, 1);
    expect(h1(faible.signal)).toBeLessThan(h1(forte.signal) / 50);
    expect(SEUILS.clarinette).toBe(0.4);
  });

  it("laisse le tuyau résonner après le souffle, puis s'éteint", () => {
    // Un modèle physique ne se coupe pas net : quand on cesse de souffler, le tuyau
    // continue de sonner le temps que les pertes mangent l'onde. Ce qu'on exige, c'est que
    // le son DÉCROISSE — pas qu'il s'arrête à l'échantillon près, ce qui serait le signe
    // qu'une enveloppe a été plaquée par-dessus la physique.
    const { signal } = jouer("cuivre", 220, 0.8, 1);
    const rms = (d: number, f: number) => {
      let s = 0;
      for (let i = d; i < f; i++) s += signal[i] * signal[i];
      return Math.sqrt(s / (f - d));
    };
    const tenue = rms(Math.floor(FS * 0.5), Math.floor(FS * 0.6));
    const fenetre = (finMs: number) => {
      const fin = signal.length - Math.floor((FS * finMs) / 1000);
      return rms(fin - Math.floor(FS * 0.02), fin);
    };
    // Trois fenêtres de vingt millisecondes dans l'extinction, chacune plus faible que la
    // précédente : c'est une décroissance, et non une queue qui tient.
    const trois = [fenetre(40), fenetre(20), fenetre(0)];
    expect(trois[1]).toBeLessThan(trois[0]);
    expect(trois[2]).toBeLessThan(trois[1]);
    expect(trois[2]).toBeLessThan(tenue / 2);
    expect(trois[2]).toBeGreaterThan(0);
  });

  it("rejoue exactement le même son à graine égale", () => {
    const a = jouer("clarinette", 330).signal;
    const b = jouer("clarinette", 330).signal;
    expect(a).toEqual(b);
  });

  it("ne sature pas et rend la longueur demandée", () => {
    for (const instrument of ["clarinette", "flute", "cuivre"] as Vent[]) {
      const { signal } = jouer(instrument, 440, 0.8, 0.5);
      expect(signal.length, instrument).toBe(Math.ceil(0.5 * FS));
      let crete = 0;
      for (const x of signal) crete = Math.max(crete, Math.abs(x));
      expect(crete, instrument).toBeLessThanOrEqual(0.9001);
    }
  });

  it("tient les extrêmes du clavier sans exploser", () => {
    for (const instrument of ["clarinette", "flute", "cuivre"] as Vent[]) {
      for (const f of [27.5, 4186]) {
        const { signal } = jouer(instrument, f, 0.8, 0.3);
        for (const x of signal) expect(Number.isFinite(x), `${instrument} ${f}`).toBe(true);
      }
    }
  });
});
