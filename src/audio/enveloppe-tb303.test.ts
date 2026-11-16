// audio/enveloppe-tb303.test.ts — La coupure conduite par les notes : correspondance, déclin, glissé, accent.
//
// L'enveloppe se relit dans la coupure rendue : log2(coupure / base) vaut échelle · (enveloppe −
// décalage) plus le terme d'accent, et l'échelle et le décalage sont connus. Les valeurs attendues de la
// correspondance sont celles qu'Open303 tire de ses constantes, recalculées ici à la main.
import { describe, expect, it } from "vitest";
import {
  CRETE_ACCENT_SEUL, DECLIN_ACCENT, OCTAVES_ACCENT, coupureEnveloppee, echelleEnveloppe,
  type NoteTb303, type OptionsEnveloppeTb303,
} from "./enveloppe-tb303";

const FE = 48000;
const BAS = 313.8152786059267;

const options = (o: Partial<OptionsEnveloppeTb303> = {}): OptionsEnveloppeTb303 => ({
  frequence: FE, longueur: FE, notes: [], coupure: 800, resonance: 0,
  modulation: 0.5, declin: 0.5, accent: 0, velociteAccent: 100, ...o,
});
const note = (debut: number, fin: number, velocite = 80): NoteTb303 => ({ debut, fin, velocite });

/** L'enveloppe principale relue dans la coupure, accent nul. */
function enveloppeRelue(c: Float32Array, base: number, modulation: number): Float64Array {
  const { echelle, decalage } = echelleEnveloppe(base, modulation);
  return Float64Array.from(c, (v) => Math.log2(v / base) / echelle + decalage);
}

describe("la correspondance de la modulation d'enveloppe", () => {
  it("à la coupure la plus basse : repos × 0,860 et crête × 1,434 à 0 %, × 0,398 et × 9,082 à 100 %", () => {
    // 2^(−0,736966 · 0,294391) = 0,860 ; 2^(0,736966 · 0,705609) = 1,434 ; avec une échelle de
    // 0,736966 + 3,773996 = 4,510962 à 100 % : 0,398 et 9,082.
    for (const [modulation, repos, crete] of [[0, 0.860, 1.434], [1, 0.398, 9.082]]) {
      const r = coupureEnveloppee(options({ coupure: BAS, modulation, notes: [note(0.5, 0.6)] }));
      expect(r.coupure[100] / BAS).toBeCloseTo(repos, 3);
      expect(Math.max(...r.coupure) / BAS).toBeCloseTo(crete, 3);
    }
  });

  it("descend le repos d'autant plus que la modulation est forte, et ne s'annule pas à 0 %", () => {
    const repos = [0, 0.5, 1].map((m) => coupureEnveloppee(options({ modulation: m, notes: [note(0.5, 0.6)] })).coupure[100]);
    expect(repos[0]).toBeGreaterThan(repos[1]);
    expect(repos[1]).toBeGreaterThan(repos[2]);
    const zero = coupureEnveloppee(options({ modulation: 0, notes: [note(0.2, 0.3)] })).coupure;
    expect(Math.max(...zero) / Math.min(...zero)).toBeGreaterThan(1.5);
  });
});

describe("l'enveloppe principale", () => {
  it("monte en 3 ms, puis retombe à un dixième au bout du « Déclin »", () => {
    for (const declin of [0.2, 0.5, 2]) {
      const r = coupureEnveloppee(options({ longueur: 3 * FE, declin, notes: [note(0.1, 0.2)] }));
      const meg = enveloppeRelue(r.coupure, 800, 0.5);
      const sommet = Math.round(0.103 * FE) - 1;
      expect(meg[sommet]).toBeCloseTo(1, 6);
      expect(meg[sommet + Math.round(declin * FE)]).toBeCloseTo(0.1, 3);
    }
  });

  it("une note accentuée retombe en 200 ms, quel que soit le « Déclin »", () => {
    const r = coupureEnveloppee(options({ declin: 2, notes: [note(0.1, 0.2, 127)] }));
    const meg = enveloppeRelue(r.coupure, 800, 0.5);
    expect(meg[Math.round(0.103 * FE) - 1 + Math.round(DECLIN_ACCENT * FE)]).toBeCloseTo(0.1, 3);
  });

  it("UNE NOTE QUI COMMENCE AVANT LA FIN DE LA PRÉCÉDENTE GLISSE : elle ne relance rien", () => {
    const seule = coupureEnveloppee(options({ notes: [note(0.1, 0.4)] }));
    const liees = coupureEnveloppee(options({ notes: [note(0.1, 0.4), note(0.35, 0.6), note(0.1, 0.3)] }));
    expect(liees.coupure).toEqual(seule.coupure);
    expect([liees.jouees, liees.glissees]).toEqual([1, 2]);
    const detachees = coupureEnveloppee(options({ notes: [note(0.1, 0.3), note(0.3, 0.6)] }));
    expect([detachees.jouees, detachees.glissees]).toEqual([2, 0]);
  });

  it("une note de vélocité nulle ou au-delà du son ne compte pas", () => {
    const r = coupureEnveloppee(options({ notes: [note(0.1, 0.2, 0), note(5, 6)] }));
    expect([r.jouees, r.accentuees, r.glissees]).toEqual([0, 0, 0]);
  });
});

describe("le balayage d'accent", () => {
  /** Les octaves que l'accent ajoute, relevés contre le même son sans accent. */
  function octavesAccent(notes: NoteTb303[], resonance: number, accent = 1): Float64Array {
    const avec = coupureEnveloppee(options({ notes, resonance, accent })).coupure;
    const sans = coupureEnveloppee(options({ notes, resonance, accent: 0 })).coupure;
    return Float64Array.from(avec, (v, i) => Math.log2(v / sans[i]));
  }

  it("un accent isolé à 100 %, résonance nulle, monte la coupure de deux octaves au plus, et les atteint", () => {
    const o = octavesAccent([note(0.1, 0.5, 127)], 0);
    expect(Math.max(...o)).toBeCloseTo(OCTAVES_ACCENT, 3);
    expect(CRETE_ACCENT_SEUL).toBeGreaterThan(0.5);
  });

  it("« Vélocité d'accent » décide : 99 n'accentue pas, 100 accentue", () => {
    expect(Math.max(...octavesAccent([note(0.1, 0.5, 99)], 0))).toBe(0);
    expect(Math.max(...octavesAccent([note(0.1, 0.5, 100)], 0))).toBeGreaterThan(1);
    expect(coupureEnveloppee(options({ notes: [note(0.1, 0.5, 100)] })).accentuees).toBe(1);
  });

  it("À RÉSONANCE FORTE, LE BALAYAGE EST LISSÉ ET DES ACCENTS RAPPROCHÉS MONTENT PLUS HAUT", () => {
    const rang = (s: number) => Math.round(s * FE);
    const accents = [note(0.1, 0.2, 127), note(0.25, 0.35, 127), note(0.4, 0.5, 127)];
    const doux = octavesAccent(accents, 0), lisse = octavesAccent(accents, 1);
    const creteEntre = (o: Float64Array, a: number, b: number) => Math.max(...o.subarray(rang(a), rang(b)));
    // Relevé : 2,00, 2,15 et 2,20 octaves à résonance nulle ; 0,70, 0,84 et 0,85 à résonance pleine.
    const croissance = (o: Float64Array) => creteEntre(o, 0.4, 0.55) / creteEntre(o, 0.1, 0.25);
    expect(croissance(doux)).toBeGreaterThan(1.05);
    expect(croissance(doux)).toBeLessThan(1.15);
    expect(croissance(lisse)).toBeGreaterThan(1.2);
    // Un accent seul monte moins haut quand le condensateur le lisse.
    expect(creteEntre(lisse, 0.1, 0.25)).toBeLessThan(0.5 * creteEntre(doux, 0.1, 0.25));
    // Et la crête du premier arrive plus tard : le condensateur lisse.
    const instant = (o: Float64Array) => { let k = rang(0.1); for (let i = rang(0.1); i < rang(0.25); i++) if (o[i] > o[k]) k = i; return k; };
    expect(instant(lisse)).toBeGreaterThan(instant(doux) + rang(0.01));
  });

  it("« Accent » règle la profondeur, proportionnellement", () => {
    const plein = Math.max(...octavesAccent([note(0.1, 0.5, 127)], 0, 1));
    const moitie = Math.max(...octavesAccent([note(0.1, 0.5, 127)], 0, 0.5));
    expect(moitie / plein).toBeCloseTo(0.5, 6);
  });
});
