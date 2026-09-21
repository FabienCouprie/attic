// audio/koch.test.ts — L'arpège flocon de Koch : trois niveaux du même flocon, à trois vitesses.
//
// Les anciens tests ne vérifiaient que la présence de notes ; ceux-ci vérifient ce que le nœud
// promet — une polyrythmie 1 : 4 : 16, des pics réduits d'un tiers à chaque niveau, un pas fixé par
// le tempo — et que le réglage de timbre change bien le son.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { PROFONDEUR_MAX, genererNotesKoch, subdiviserKoch, snapperNote, type OptionsArpegeKoch } from "./koch";
import { rendreSequence } from "./midi";

const BASE: OptionsArpegeKoch = {
  cle: "C", gamme: "chromatique", octave: 4, accord: "Majeur", profondeur: 3, direction: "alternée",
  hauteur: 3, tempo: 120, repetitions: 1, articulation: 0.85, notesRepetees: "rejouees", timbre: "douce", volume: 80,
};
const voix = <T extends { velocite: number }>(notes: T[], k: number): T[] => notes.filter((n) => n.velocite === 80 + k * 10);

describe("subdivision de Koch", () => {
  it("au premier niveau : le tiers central devient un pic de la hauteur demandée", () => {
    const n = subdiviserKoch(60, 64, 1, 1, 3);
    expect(n).toHaveLength(4);
    expect(n[0]).toBe(60);
    expect(n[1]).toBeCloseTo(61.333, 3);
    expect(n[2]).toBeCloseTo(65, 6);
    expect(n[3]).toBeCloseTo(62.667, 3);
  });

  it("AUTOSIMILAIRE : chaque niveau pose des pics trois fois plus petits", () => {
    // Sur un segment plat, le pic du premier niveau vaut la hauteur ; au second, les sous-pics du
    // premier sous-segment (plat lui aussi) ne valent plus que le tiers.
    const n2 = subdiviserKoch(60, 60, 2, 1, 9);
    expect(n2).toHaveLength(16);
    expect(n2[2] - 60).toBeCloseTo(3, 6);
    const n1 = subdiviserKoch(60, 60, 1, 1, 9);
    expect(n1[2] - 60).toBeCloseTo(9, 6);
  });
});

describe("trois niveaux du même flocon", () => {
  it("POLYRYTHMIE 1 : 4 : 16 — 64, 16 et 4 notes par cycle à la profondeur 3, qui finissent ensemble", () => {
    const { notes } = genererNotesKoch(BASE);
    const [a, b, c] = [0, 1, 2].map((k) => voix(notes, k));
    // Chaque voix rejoue ses notes répétées ici : les comptes sont ceux de la subdivision, plus la note d'arrivée.
    expect([a.length, b.length, c.length]).toEqual([65, 17, 5]);
    const pas = (v: typeof a) => v[1].debut - v[0].debut;
    expect(pas(b) / pas(a)).toBeCloseTo(4, 9);
    expect(pas(c) / pas(a)).toBeCloseTo(16, 9);
    // Les trois voix atteignent leur note d'arrivée au même instant : la fin du cycle.
    const arrivee = (v: typeof a) => v[v.length - 1].debut;
    expect(arrivee(a)).toBeCloseTo(arrivee(b), 9);
    expect(arrivee(b)).toBeCloseTo(arrivee(c), 9);
  });

  it("LE PAS EST FIXÉ PAR LE TEMPO : une double-croche, quelle que soit la profondeur", () => {
    for (const profondeur of [1, 2, 3, 4]) {
      const a = voix(genererNotesKoch({ ...BASE, profondeur }).notes, 0);
      expect(a[1].debut - a[0].debut, `profondeur ${profondeur}`).toBeCloseTo(60 / 120 / 4, 9);
    }
  });

  it("chaque niveau quadruple le cycle, et la profondeur est plafonnée", () => {
    const d = (p: number) => genererNotesKoch({ ...BASE, profondeur: p }).notes.reduce((m, n) => Math.max(m, n.debut), 0);
    expect(d(3) / d(2)).toBeCloseTo(4, 6);
    expect(genererNotesKoch({ ...BASE, profondeur: 9 }).notes.length).toBe(genererNotesKoch({ ...BASE, profondeur: PROFONDEUR_MAX }).notes.length);
  });

  it("les répétitions enchaînent les cycles", () => {
    const un = genererNotesKoch({ ...BASE, repetitions: 1 }).dureeTotale;
    const deux = genererNotesKoch({ ...BASE, repetitions: 2 }).dureeTotale;
    const cycle = 64 * (60 / 120 / 4);
    expect(deux - un).toBeCloseTo(cycle, 9);
  });

  it("L'ARTICULATION est la part du pas qui sonne, à la vitesse de chaque voix", () => {
    const { notes } = genererNotesKoch({ ...BASE, articulation: 0.5 });
    const c = voix(notes, 2);
    const pasC = c[1].debut - c[0].debut;
    expect(c[0].fin - c[0].debut).toBeCloseTo(pasC * 0.5, 9);
  });

  it("LIÉES, deux notes consécutives identiques n'en font qu'une, plus longue", () => {
    const opt = { ...BASE, gamme: "pentatonique-majeure", hauteur: 1 };
    const liees = genererNotesKoch({ ...opt, notesRepetees: "liees" }).notes;
    const rejouees = genererNotesKoch({ ...opt, notesRepetees: "rejouees" }).notes;
    expect(liees.length).toBeLessThan(rejouees.length);
    for (const k of [0, 1, 2]) {
      const v = voix(liees, k);
      for (let i = 1; i < v.length - 1; i++) expect(v[i].note, `voix ${k}, note ${i}`).not.toBe(v[i - 1].note);
    }
  });

  it("des accords différents donnent des notes différentes, toujours dans les bornes MIDI", () => {
    const maj = genererNotesKoch(BASE).notes, min = genererNotesKoch({ ...BASE, accord: "Mineur" }).notes;
    expect(JSON.stringify(maj)).not.toBe(JSON.stringify(min));
    const extreme = genererNotesKoch({ ...BASE, octave: 1, profondeur: 4, direction: "extérieure", hauteur: 12 }).notes;
    for (const n of extreme) { expect(n.note).toBeGreaterThanOrEqual(0); expect(n.note).toBeLessThanOrEqual(127); }
  });

  it("snapperNote ramène sur la gamme", () => {
    const majeur = [0, 2, 4, 5, 7, 9, 11];
    expect([60, 61, 62, 63, 64].map((m) => snapperNote(m, majeur))).toEqual([60, 60, 62, 62, 64]);
  });
});

describe("le timbre de la synthèse FM", () => {
  const notes = [{ note: 69, velocite: 100, debut: 0, fin: 0.3 }];
  it("DOUCE ET PERCUTANTE NE DONNENT PLUS LE MÊME SON", async () => {
    const douce = (await rendreSequence(notes, "FM/Oscillateurs", 80, 0, 0, "douce")).getChannelData(0);
    const perc = (await rendreSequence(notes, "FM/Oscillateurs", 80, 0, 0, "percutante")).getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < douce.length; i++) ecart = Math.max(ecart, Math.abs(douce[i] - perc[i]));
    expect(ecart).toBeGreaterThan(0.05);
  });

  it("SANS CARACTÈRE, LE RENDU D'ORIGINE EST INCHANGÉ — les autres nœuds ne bougent pas", async () => {
    const sans = (await rendreSequence(notes, "FM/Oscillateurs", 80, 0, 0)).getChannelData(0);
    const brillante = (await rendreSequence(notes, "FM/Oscillateurs", 80, 0, 0, "brillante")).getChannelData(0);
    expect(sans.every((v, i) => v === brillante[i])).toBe(true);
  });
});
