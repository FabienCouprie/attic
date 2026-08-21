// audio/gendyn.test.ts — Tout le procédé repose sur les barrières
// réfléchissantes : sans elles la marche aléatoire s'échappe et le son meurt.
// C'est donc elles, et le caractère déterministe du tirage, qu'on verrouille.
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { gendyn, miroir } from "./gendyn";

const BASE = {
  dureeSec: 1, sampleRate: 8000, points: 8,
  dureeMinMs: 0.5, dureeMaxMs: 4, pasTemps: 0.1, pasAmplitude: 0.1, graine: 1,
};

describe("miroir", () => {
  it("laisse passer ce qui est déjà dans le domaine", () => {
    expect(miroir(0.3, -1, 1)).toBeCloseTo(0.3, 12);
  });

  it("renvoie vers l'intérieur au lieu d'écrêter", () => {
    // La différence est décisive : écrêter collerait la valeur contre 1, où elle
    // resterait — la marche s'immobiliserait et le son se figerait.
    expect(miroir(1.2, -1, 1)).toBeCloseTo(0.8, 12);
    expect(miroir(-1.5, -1, 1)).toBeCloseTo(-0.5, 12);
  });

  it("rebondit autant de fois qu'il le faut", () => {
    // Un pas peut dépasser plusieurs fois la largeur du domaine.
    for (const v of [12.7, -30.4, 101]) {
      const r = miroir(v, -1, 1);
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it("ne boucle pas indéfiniment sur un domaine dégénéré", () => {
    expect(miroir(5, 2, 2)).toBe(2);
  });
});

describe("gendyn", () => {
  it("produit la durée demandée", () => {
    const b = gendyn({ ...BASE, dureeSec: 2 });
    expect(b.length).toBe(2 * BASE.sampleRate);
    expect(b.sampleRate).toBe(BASE.sampleRate);
  });

  it("reste borné, quelle que soit la violence de la marche", () => {
    // Sans barrières, une marche à grands pas quitterait le domaine en quelques
    // périodes et saturerait.
    for (const pas of [0.1, 0.5, 1]) {
      const d = gendyn({ ...BASE, pasAmplitude: pas, pasTemps: pas }).getChannelData(0);
      let pic = 0;
      for (let i = 0; i < d.length; i++) pic = Math.max(pic, Math.abs(d[i]));
      expect(pic, `pas ${pas}`).toBeLessThanOrEqual(1);
    }
  });

  it("même graine, même son ; graine différente, son différent", () => {
    const a = gendyn({ ...BASE, graine: 42 }).getChannelData(0);
    const b = gendyn({ ...BASE, graine: 42 }).getChannelData(0);
    const c = gendyn({ ...BASE, graine: 43 }).getChannelData(0);
    for (let i = 0; i < a.length; i += 197) expect(b[i]).toBe(a[i]);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart += Math.abs(a[i] - c[i]);
    expect(ecart / a.length).toBeGreaterThan(1e-3);
  });

  it("le son évolue : la fin ne ressemble pas au début", () => {
    // C'est l'objet même du procédé — la forme d'onde dérive continûment.
    const d = gendyn({ ...BASE, dureeSec: 2, pasTemps: 0.2, pasAmplitude: 0.2 }).getChannelData(0);
    const trame = 2048;
    const correlation = (a: number, b: number) => {
      let num = 0, na = 0, nb = 0;
      for (let i = 0; i < trame; i++) {
        num += d[a + i] * d[b + i];
        na += d[a + i] * d[a + i];
        nb += d[b + i] * d[b + i];
      }
      return num / (Math.sqrt(na * nb) || 1);
    };
    expect(Math.abs(correlation(0, d.length - trame - 1))).toBeLessThan(0.5);
  });

  it("un pas nul fige la forme d'onde : elle devient périodique", () => {
    // Garde-fou du test précédent. Sans marche, le polygone ne bouge plus et le
    // signal se répète exactement d'une période à l'autre.
    const b = gendyn({ ...BASE, dureeSec: 0.5, pasTemps: 0, pasAmplitude: 0, points: 4, graine: 5 });
    const d = b.getChannelData(0);
    // On cherche le décalage qui MINIMISE l'écart, et non celui qui maximise la
    // corrélation : les segments successifs d'un polygone se ressemblent, si
    // bien qu'un pic de corrélation parasite peut désigner un simple segment au
    // lieu de la période entière. S'il y a périodicité, un décalage d'écart
    // quasi nul existe forcément.
    const ecartAuDecalage = (lag: number) => {
      let s = 0;
      for (let i = 0; i < 1000; i++) s += Math.abs(d[i] - d[i + lag]);
      return s / 1000;
    };
    let minimum = Infinity;
    for (let lag = 8; lag < 400; lag++) minimum = Math.min(minimum, ecartAuDecalage(lag));
    expect(minimum).toBeLessThan(0.02);
  });

  it("avec une marche active, aucune périodicité ne subsiste", () => {
    // Contrepartie du test précédent : c'est bien la marche qui casse la
    // répétition, pas un hasard de mesure.
    const d = gendyn({ ...BASE, dureeSec: 0.5, pasTemps: 0.3, pasAmplitude: 0.3, points: 4, graine: 5 }).getChannelData(0);
    let minimum = Infinity;
    for (let lag = 8; lag < 400; lag++) {
      let s = 0;
      for (let i = 0; i < 1000; i++) s += Math.abs(d[i] - d[i + lag]);
      minimum = Math.min(minimum, s / 1000);
    }
    expect(minimum).toBeGreaterThan(0.05);
  });

  it("les durées restent dans les bornes : la hauteur ne s'échappe pas", () => {
    // Bornes serrées autour d'une valeur : le nombre de segments par seconde
    // doit rester compatible avec elles.
    const sr = 8000;
    const b = gendyn({ ...BASE, sampleRate: sr, dureeSec: 1, dureeMinMs: 1, dureeMaxMs: 2, points: 4, pasTemps: 1 });
    const d = b.getChannelData(0);
    // Chaque segment dure entre 8 et 16 échantillons ; on compte les sommets par
    // changement de pente.
    let sommets = 0;
    for (let i = 1; i < d.length - 1; i++) {
      const p1 = d[i] - d[i - 1], p2 = d[i + 1] - d[i];
      if (Math.abs(p2 - p1) > 1e-7) sommets++;
    }
    const parSeconde = sommets;
    expect(parSeconde).toBeGreaterThan(sr / 20);
    expect(parSeconde).toBeLessThan(sr / 6);
  });
});
