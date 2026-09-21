// audio/objets-sonores.test.ts — Découper, décrire, réordonner, monter.
//
// Chaque matériau est fabriqué pour que la bonne réponse soit connue d'avance : des attaques à des
// instants écrits, des silences de longueurs écrites, un changement de timbre à un instant écrit.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { decouperEnObjets, monter, reordonnerObjets } from "./objets-sonores";
import { creerAleatoire } from "../core/hasard";

const SR = 44100;
const tampon = (n: number, f: (i: number) => number) => {
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  b.copyToChannel(Float32Array.from({ length: n }, (_, i) => f(i)), 0);
  return b;
};
const hasard = (g: number) => { let e = g; return () => { e = (e * 1664525 + 1013904223) >>> 0; return e / 4294967296 * 2 - 1; }; };

/** Des notes frappées aux instants donnés, qui décroissent, sur un fond presque muet. */
function frappes(instants: number[], dureeS: number, hz = (k: number) => 440 + 110 * k) {
  const fond = hasard(1);
  return tampon(Math.round(dureeS * SR), (i) => {
    let v = 0.001 * fond();
    instants.forEach((t, k) => {
      const d = i / SR - t;
      if (d >= 0) v += 0.6 * Math.exp(-d * 8) * Math.sin(2 * Math.PI * hz(k) * d);
    });
    return v;
  });
}

const OPTS = { sensibilite: 50, dureeMinMs: 80, seuilSilenceDb: -40 };

describe("découper en objets", () => {
  it("PAR LES ATTAQUES : cinq frappes, cinq objets, chacun commencé à 5 ms près", () => {
    const instants = [0.2, 0.7, 1.3, 1.8, 2.5];
    const objets = decouperEnObjets(frappes(instants, 3.2), { critere: "attaques", ...OPTS });
    expect(objets.map((o) => o.debut.toFixed(2))).toHaveLength(5);
    objets.forEach((o, k) => expect(Math.abs(o.debut - instants[k]), `objet ${k} à ${o.debut.toFixed(4)} s`).toBeLessThan(0.005));
    // Chaque objet va jusqu'à l'attaque suivante : sa résonance lui appartient.
    expect(Math.abs(objets[0].debut + objets[0].duree - objets[1].debut)).toBeLessThan(1e-9);
  });

  it("PAR LES SILENCES : trois sons séparés, trois objets ; un trou de 30 ms ne coupe pas un objet", () => {
    const son = tampon(3 * SR, (i) => {
      const t = i / SR;
      const dedans = (t > 0.3 && t < 0.8 && !(t > 0.5 && t < 0.53)) || (t > 1.2 && t < 1.6) || (t > 2.1 && t < 2.7);
      return dedans ? 0.5 * Math.sin(2 * Math.PI * 330 * t) : 0;
    });
    const objets = decouperEnObjets(son, { critere: "silences", ...OPTS });
    expect(objets).toHaveLength(3);
    const attendus = [[0.3, 0.8], [1.2, 1.6], [2.1, 2.7]];
    objets.forEach((o, k) => {
      expect(Math.abs(o.debut - attendus[k][0]), `début ${k}`).toBeLessThan(0.03);
      expect(Math.abs(o.debut + o.duree - attendus[k][1]), `fin ${k}`).toBeLessThan(0.03);
    });
  });

  it("PAR LE TIMBRE : un bruit qui devient une note, sans silence ni attaque, se coupe au changement", () => {
    const h = hasard(4);
    const son = tampon(2 * SR, (i) => (i < SR ? 0.3 * h() : 0.42 * Math.sin(2 * Math.PI * 440 * i / SR)));
    const objets = decouperEnObjets(son, { critere: "timbre", ...OPTS, sensibilite: 30 });
    expect(objets.length).toBeGreaterThanOrEqual(2);
    const frontiere = objets[1].debut;
    expect(Math.abs(frontiere - 1), `frontière à ${frontiere.toFixed(3)} s`).toBeLessThan(0.05);
  });

  it("LES DESCRIPTEURS DISENT CE QU'ON ENTEND : la note est tonique, le bruit bruité ; l'aigu est brillant", () => {
    const h = hasard(7);
    const son = tampon(3 * SR, (i) => {
      const t = i / SR;
      if (t < 0.9) return 0.4 * Math.sin(2 * Math.PI * 300 * t);
      if (t > 1 && t < 1.9) return 0.4 * h();
      if (t > 2) return 0.1 * Math.sin(2 * Math.PI * 3000 * t);
      return 0;
    });
    const [note, bruit, aigu] = decouperEnObjets(son, { critere: "silences", ...OPTS, seuilSilenceDb: -50 });
    expect(note.bruit).toBeLessThan(0.05);
    expect(bruit.bruit).toBeGreaterThan(0.5);
    expect(Math.abs(note.brillance / 300 - 1)).toBeLessThan(0.15);
    expect(aigu.brillance).toBeGreaterThan(2500);
    // Et la sonie suit le niveau : 0,1 d'amplitude, c'est 12 dB sous 0,4.
    expect(Math.abs(note.sonie - aigu.sonie - 12)).toBeLessThan(1.5);
  });

  it("la sensibilité décide du nombre d'objets", () => {
    const son = frappes([0.2, 0.5, 0.8, 1.1, 1.4, 1.7], 2.2, (k) => 300 * (1 + (k % 2)));
    const peu = decouperEnObjets(son, { critere: "attaques", ...OPTS, sensibilite: 0 }).length;
    const beaucoup = decouperEnObjets(son, { critere: "attaques", ...OPTS, sensibilite: 100 }).length;
    expect(beaucoup).toBeGreaterThanOrEqual(peu);
    expect(beaucoup).toBeGreaterThanOrEqual(6);
  });
});

describe("réordonner les objets", () => {
  const troisNotes = () => {
    const f = [880, 220, 440];
    return {
      son: tampon(3 * SR, (i) => 0.4 * Math.sin(2 * Math.PI * f[Math.floor(i / SR)] * (i / SR))),
      objets: f.map((hz, k) => ({ debut: k, duree: 1, brillance: hz, sonie: -10, bruit: 0 })),
    };
  };
  const frequence = (x: Float32Array, de: number, a: number) => {
    let n = 0;
    for (let i = de + 1; i < a; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
    return (n * SR) / (a - de);
  };

  it("PAR BRILLANCE CROISSANTE : 220, 440, 880 — et à l'envers en décroissant", () => {
    const { son, objets } = troisNotes();
    const y = reordonnerObjets(son, objets, { critere: "brillance", decroissant: false, espaceMs: 0, fonduMs: 10 }).getChannelData(0);
    const f = [0, 1, 2].map((k) => frequence(y, k * SR + 2000, (k + 1) * SR - 2000));
    expect(f.map((v) => Math.round(v / 10) * 10)).toEqual([220, 440, 880]);
    const z = reordonnerObjets(son, objets, { critere: "brillance", decroissant: true, espaceMs: 0, fonduMs: 10 }).getChannelData(0);
    expect(Math.round(frequence(z, 2000, SR - 2000) / 10) * 10).toBe(880);
  });

  it("L'ESPACE SÉPARE OU FAIT CHEVAUCHER, et les fondus ouvrent et ferment chaque objet", () => {
    const { son, objets } = troisNotes();
    expect(reordonnerObjets(son, objets, { critere: "origine", decroissant: false, espaceMs: 500, fonduMs: 10 }).length).toBe(Math.round(4 * SR));
    expect(reordonnerObjets(son, objets, { critere: "origine", decroissant: false, espaceMs: -250, fonduMs: 10 }).length).toBe(Math.round(2.5 * SR));
    const y = reordonnerObjets(son, objets, { critere: "origine", decroissant: false, espaceMs: 0, fonduMs: 10 }).getChannelData(0);
    expect(y[0]).toBe(0);
    expect(Math.abs(y[SR - 1])).toBeLessThan(1e-3);
  });

  it("au hasard, à graine égale, le même ordre", () => {
    const { son, objets } = troisNotes();
    const a = reordonnerObjets(son, objets, { critere: "hasard", decroissant: false, espaceMs: 0, fonduMs: 5, hasard: creerAleatoire(9) });
    const b = reordonnerObjets(son, objets, { critere: "hasard", decroissant: false, espaceMs: 0, fonduMs: 5, hasard: creerAleatoire(9) });
    expect(a.getChannelData(0).every((v, i) => v === b.getChannelData(0)[i])).toBe(true);
  });
});

describe("monter", () => {
  const clic = (n = 100) => tampon(n, (i) => (i === 0 ? 1 : 0));
  const plan = (son: AudioBuffer, debut: number, gainDb = 0, fonduEntreeMs = 0, fonduSortieMs = 0) => ({ son, debut, gainDb, fonduEntreeMs, fonduSortieMs });

  it("CHAQUE SON À SON INSTANT ET À SON NIVEAU", async () => {
    const y = (await monter([plan(clic(), 0.5), plan(clic(), 1.2, -6)])).getChannelData(0);
    expect(y[Math.round(0.5 * SR)]).toBeCloseTo(1, 6);
    expect(y[Math.round(1.2 * SR)]).toBeCloseTo(Math.pow(10, -6 / 20), 5);
    expect(y.length).toBe(Math.round(1.2 * SR) + 100);
  });

  it("les sons se superposent, un début négatif rogne, et une autre fréquence est ramenée à la première", async () => {
    const un = tampon(SR, () => 0.25);
    const y = (await monter([plan(un, 0), plan(un, 0.5), plan(un, -0.75)])).getChannelData(0);
    expect(y[Math.round(0.1 * SR)]).toBeCloseTo(0.5, 5);
    expect(y[Math.round(0.6 * SR)]).toBeCloseTo(0.5, 5);
    const lent = new AudioBuffer({ numberOfChannels: 1, length: 22050, sampleRate: 22050 });
    const z = await monter([plan(clic(), 0), plan(lent, 0)]);
    expect(z.sampleRate).toBe(SR);
    expect(Math.abs(z.length - SR)).toBeLessThan(5);
  });

  it("CHAQUE PISTE A SES PROPRES FONDUS, d'entrée et de sortie", async () => {
    const un = tampon(SR, () => 0.5);
    const y = (await monter([plan(un, 0, 0, 100, 0), plan(un, 2, 0, 0, 400)])).getChannelData(0);
    // Première piste : fondu d'entrée de 100 ms, aucun fondu de sortie.
    expect(y[0]).toBe(0);
    expect(y[Math.round(0.05 * SR)]).toBeCloseTo(0.5 * Math.sin(Math.PI / 4), 3);
    expect(y[SR - 1]).toBeCloseTo(0.5, 6);
    // Seconde : entrée franche, sortie sur 400 ms.
    expect(y[2 * SR]).toBeCloseTo(0.5, 6);
    expect(y[3 * SR - Math.round(0.2 * SR)]).toBeCloseTo(0.5 * Math.sin(Math.PI / 4), 2);
    expect(Math.abs(y[3 * SR - 1])).toBeLessThan(1e-3);
  });

  it("LE FONDU EST À PUISSANCE CONSTANTE : deux sons qui se croisent gardent leur énergie", async () => {
    // Deux bruits indépendants croisés sur une seconde : sans perte au milieu, contrairement à deux
    // rampes droites, qui creuseraient de 3 dB.
    const a = tampon(2 * SR, hasard(11)), b = tampon(2 * SR, hasard(12));
    const y = (await monter([plan(a, 0, 0, 0, 1000), plan(b, 1, 0, 1000, 0)])).getChannelData(0);
    const puissance = (de: number, n: number) => { let e = 0; for (let i = de; i < de + n; i++) e += y[i] * y[i]; return e / n; };
    const avant = puissance(Math.round(0.2 * SR), SR / 10), milieu = puissance(Math.round(1.45 * SR), SR / 10);
    expect(Math.abs(10 * Math.log10(milieu / avant))).toBeLessThan(0.6);
  });

  it("des fondus plus longs que le son sont réduits dans la même proportion", async () => {
    const y = (await monter([plan(tampon(SR / 10, () => 0.5), 0, 0, 1000, 1000)])).getChannelData(0);
    expect(y.every(Number.isFinite)).toBe(true);
    const milieu = y[Math.round(SR / 20)];
    expect(milieu).toBeGreaterThan(0.45);
  });
});
