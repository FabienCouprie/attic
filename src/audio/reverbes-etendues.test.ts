// audio/reverbes-etendues.test.ts — Ce qui distingue ces deux réverbérations des sept autres.
//
// POUR LA HACHÉE, une seule chose compte et elle se mesure : APRÈS LA FERMETURE, IL NE RESTE RIEN.
// C'est ce silence brutal qui fait le son de 1985, et c'est aussi ce qu'une porte ordinaire posée
// derrière une réverbération ne donne pas — elle suit le niveau de la queue au lieu de suivre les
// attaques du son sec, et l'on entend une extinction là où l'on voulait un couperet.
//
// POUR LE SHIMMER, c'est que chaque génération monte et faiblit : sans la seconde propriété, la
// boucle ne s'éteindrait jamais ; sans la première, ce ne serait qu'une réverbération de plus.
import { describe, expect, it } from "vitest";
import {
  enveloppePorte, reverberationHachee, shimmer, transposerParReechantillonnage,
} from "./reverbes-etendues";

const SR = 22050;

/** Une frappe : une attaque nette suivie d'une extinction rapide, comme une caisse claire. */
function frappe(dureeSec = 2, instantSec = 0.1): Float32Array {
  const n = Math.round(dureeSec * SR);
  const debut = Math.round(instantSec * SR);
  return Float32Array.from({ length: n }, (_, i) => {
    if (i < debut) return 0;
    const t = (i - debut) / SR;
    return 0.8 * Math.exp(-40 * t) * Math.sin(2 * Math.PI * 180 * t);
  });
}

const rms = (x: Float32Array, debut = 0, fin = x.length) => {
  let s = 0;
  for (let i = debut; i < fin; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, fin - debut));
};

describe("l'enveloppe de la porte", () => {
  const base = { seuilDb: -40, maintienSec: 0.2, chuteSec: 0.01, frequence: SR };

  it("s'ouvre à l'attaque et tient le temps demandé", () => {
    const e = enveloppePorte(frappe(), base);
    expect(e[Math.round(0.05 * SR)]).toBe(0);            // avant la frappe
    expect(e[Math.round(0.15 * SR)]).toBe(1);            // pendant le maintien
    expect(e[Math.round(0.5 * SR)]).toBe(0);             // après la chute
  });

  it("UNE SECONDE FRAPPE RELANCE LE COMPTE À REBOURS", () => {
    const x = frappe(2, 0.1);
    const seconde = frappe(2, 0.25);
    for (let i = 0; i < x.length; i++) x[i] += seconde[i];
    const e = enveloppePorte(x, base);
    // Sans relance, la porte se fermerait à 0,3 s ; avec, elle tient jusqu'à 0,45.
    expect(e[Math.round(0.4 * SR)]).toBeGreaterThan(0.9);
  });

  it("le maintien décide de la longueur : plus long, porte ouverte plus tard", () => {
    const court = enveloppePorte(frappe(), base);
    const long = enveloppePorte(frappe(), { ...base, maintienSec: 0.6 });
    expect(court[Math.round(0.5 * SR)]).toBe(0);
    expect(long[Math.round(0.5 * SR)]).toBe(1);
  });

  it("un son sous le seuil n'ouvre rien", () => {
    const faible = Float32Array.from(frappe(), (v) => v * 0.001);
    expect(Math.max(...enveloppePorte(faible, base))).toBe(0);
  });
});

describe("la réverbération hachée", () => {
  const base = {
    decroissanceSec: 1.5, seuilDb: -40, maintienSec: 0.2, chuteSec: 0.01,
    melange: 1, frequence: SR, graine: 3,
  };

  it("LA QUEUE EST COUPÉE NET : la traînée dure le maintien, non la décroissance", () => {
    const r = reverberationHachee(frappe(), base);
    // 0,91 s de traînée libre mesurées : la queue s'éteint à −40 dB de sa crête bien avant la fin
    // de sa décroissance nominale d'une seconde et demie, ce qui est le propre d'une mesure à seuil.
    expect(r.traineeLibreSec).toBeGreaterThan(0.8);
    // 0,42 s mesurées, et le compte tombe juste : la frappe passe sous le seuil à 0,21 s — elle
    // décroît en exp(−40 t) depuis 0,8, et croise 0,01 après 0,11 s —, le maintien de 0,2 s court
    // à partir de là, et la chute de 10 ms achève. La porte suit les ATTAQUES, pas l'horloge.
    expect(r.traineeSec).toBeLessThan(0.3);
    expect(r.traineeSec).toBeGreaterThan(0.1);
  });

  it("et un maintien très long laisse la queue entière : le chiffre mesure bien la porte", () => {
    const ouverte = reverberationHachee(frappe(), { ...base, maintienSec: 10 });
    expect(ouverte.traineeSec).toBeCloseTo(ouverte.traineeLibreSec, 2);
  });

  it("UN MORCEAU QUI SE TERMINE SUR UNE FRAPPE GARDE SA QUEUE, le temps que la porte se ferme", () => {
    // Le cas mesuré dans l'application : une boîte à rythmes qui joue jusqu'au dernier échantillon.
    // La sortie coupée à la longueur de l'entrée rendait une traînée nulle ; elle dure désormais
    // le maintien plus la chute de la porte, et n'est jamais négative.
    const continu = Float32Array.from({ length: SR }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 200 * i) / SR));
    const r = reverberationHachee(continu, base);
    expect(r.traineeSec).toBeGreaterThan(0);
    expect(r.traineeSec).toBeLessThanOrEqual(base.maintienSec + base.chuteSec + 0.005);
  });

  it("et la queue existe bien AVANT la fermeture : on n'a pas simplement tout coupé", () => {
    const r = reverberationHachee(frappe(), base);
    // Juste après la frappe, il y a du son ajouté ; bien après, il n'y a plus que le sec.
    const tot = rms(r.audio, Math.round(0.12 * SR), Math.round(0.28 * SR));
    const fin = rms(r.audio, Math.round(0.6 * SR), Math.round(1.8 * SR));
    expect(tot).toBeGreaterThan(20 * fin);
  });

  it("un maintien plus long garde la queue plus longtemps", () => {
    const court = reverberationHachee(frappe(), base);
    const long = reverberationHachee(frappe(), { ...base, maintienSec: 0.8 });
    const fenetre = [Math.round(0.4 * SR), Math.round(0.7 * SR)] as const;
    expect(rms(long.audio, ...fenetre)).toBeGreaterThan(rms(court.audio, ...fenetre));
  });

  it("à mélange nul, le son sec ressort intact", () => {
    const x = frappe();
    const r = reverberationHachee(x, { ...base, melange: 0 });
    for (let i = 0; i < x.length; i += 313) expect(r.audio[i]).toBeCloseTo(x[i], 6);
  });

  it("LA SORTIE DURE LE SON PLUS LE TEMPS DE FERMETURE DE LA PORTE — la dernière frappe garde sa queue", () => {
    const x = frappe();
    const attendu = x.length + Math.round((base.maintienSec + base.chuteSec) * SR);
    expect(reverberationHachee(x, base).audio.length).toBe(attendu);
    // Un son qui s'arrête net sur une frappe : sa réverbération hachée sonne après lui.
    const finNette = new Float32Array(SR);
    finNette[SR - 10] = 0.9;
    const r = reverberationHachee(finNette, base);
    let apres = 0;
    for (let i = SR; i < r.audio.length; i++) apres = Math.max(apres, Math.abs(r.audio[i]));
    expect(apres).toBeGreaterThan(0.001);
  });

  it("un silence ne fait ni lever ni rendre des valeurs impossibles", () => {
    const r = reverberationHachee(new Float32Array(SR), base);
    expect([...r.audio].every((v) => v === 0)).toBe(true);
    expect(Number.isFinite(r.traineeSec)).toBe(true);
  });
});

describe("le shimmer", () => {
  const base = {
    decroissanceSec: 0.8, rebouclage: 0.6, demiTons: 12, generations: 4,
    melange: 1, frequence: SR, graine: 5,
    transposer: (x: Float32Array, d: number) => transposerParReechantillonnage(x, d),
  };

  it("CHAQUE GÉNÉRATION EST PLUS FAIBLE QUE LA PRÉCÉDENTE — sans quoi la boucle n'a pas de fin", () => {
    const r = shimmer(frappe(), base);
    expect(r.generationsDb.length).toBe(4);
    expect(r.generationsDb[0]).toBe(0);
    for (let g = 1; g < r.generationsDb.length; g++) {
      expect(r.generationsDb[g]).toBeLessThan(r.generationsDb[g - 1]);
    }
  });

  it("le rebouclage décide de la vitesse d'extinction", () => {
    const faible = shimmer(frappe(), { ...base, rebouclage: 0.2 });
    const fort = shimmer(frappe(), { ...base, rebouclage: 0.9 });
    expect(fort.generationsDb[3]).toBeGreaterThan(faible.generationsDb[3]);
  });

  it("LA PREMIÈRE GÉNÉRATION N'EST PAS TRANSPOSÉE : on entend la salle avant l'octave", () => {
    let transpositions = 0;
    shimmer(frappe(), {
      ...base, generations: 3,
      transposer: (x, d) => { transpositions++; return transposerParReechantillonnage(x, d); },
    });
    // Trois générations demandent deux transpositions, pas trois.
    expect(transpositions).toBe(2);
  });

  it("le rebouclage est borné : à 1, la boucle s'éteint quand même", () => {
    const r = shimmer(frappe(), { ...base, rebouclage: 1, generations: 6 });
    expect(r.generationsDb[5]).toBeLessThan(0);
    expect([...r.audio].every(Number.isFinite)).toBe(true);
  });

  it("à mélange nul, le son sec ressort intact", () => {
    const x = frappe();
    const r = shimmer(x, { ...base, melange: 0 });
    for (let i = 0; i < x.length; i += 313) expect(r.audio[i]).toBeCloseTo(x[i], 6);
  });

  it("la durée ne change pas, et le nombre de générations est borné", () => {
    const x = frappe();
    expect(shimmer(x, base).audio.length).toBe(x.length);
    expect(shimmer(x, { ...base, generations: 99 }).generationsDb.length).toBe(8);
    expect(shimmer(x, { ...base, generations: 0 }).generationsDb.length).toBe(1);
  });
});

describe("la transposition de secours", () => {
  it("une octave fait lire deux fois plus vite, donc monte d'une octave", () => {
    const n = 4096;
    const sinus = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 200 * i) / SR));
    const haut = transposerParReechantillonnage(sinus, 12);
    // Compter les passages par zéro montants : deux fois plus nombreux à l'octave.
    const montees = (x: Float32Array) => {
      let n2 = 0;
      for (let i = 1; i < x.length / 2; i++) if (x[i - 1] <= 0 && x[i] > 0) n2++;
      return n2;
    };
    expect(montees(haut) / montees(sinus)).toBeGreaterThan(1.8);
    expect(montees(haut) / montees(sinus)).toBeLessThan(2.2);
  });

  it("ne déborde pas du tampon", () => {
    expect(transposerParReechantillonnage(new Float32Array(100), 12).length).toBe(100);
    expect([...transposerParReechantillonnage(new Float32Array(10), 24)].every(Number.isFinite)).toBe(true);
  });
});
