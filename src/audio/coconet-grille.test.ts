// audio/coconet-grille.test.ts — La grille de Coconet : ce qui s'y pose, ce qui est refusé, ce qui revient.
//
// Les cas sont tirés de la forme que le réseau lit (une case par double-croche et par voix,
// MIDI 36 à 81, quatre voix) et des promesses de la notice, non du code : la voix gardée ressort
// intacte, une note hors de l'étendue fait refuser la pièce entière, une case où aucune voix
// gardée ne sonne reste muette, et la liaison décide des cases répétées des seules voix écrites.

import { describe, expect, it } from "vitest";
import type { Note } from "./note";
import type { Sequence } from "./sequence";
import {
  COCONET_VOIX, SILENCE, estRefus, grilleDepuisSequence, sequenceDepuisGrille, type GrilleCoconet,
} from "./coconet-grille";

const noire = 0.5; // à 120 à la noire
const n = (note: number, debut: number, duree: number, voix?: number): Note =>
  ({ note, velocite: 90, debut, fin: debut + duree, voix });

const melodie = (): Sequence => ({
  notes: [n(67, 0, noire), n(69, noire, noire), n(71, 2 * noire, 2 * noire)],
  tempo: 120,
});

const grille = (seq: Sequence, garde: "soprano" | "toutes" = "soprano"): GrilleCoconet => {
  const g = grilleDepuisSequence(seq, garde, seq.tempo ?? 120);
  if (estRefus(g)) throw new Error("refus inattendu");
  return g;
};

describe("grilleDepuisSequence", () => {
  it("pose le soprano à la double-croche et demande les trois autres voix", () => {
    const g = grille(melodie());
    expect(g.pas).toBe(16); // quatre noires
    expect(g.gardees).toEqual([0]);
    expect(g.hauteurs[0]).toBe(67);
    expect(g.hauteurs[4 * COCONET_VOIX + 0]).toBe(69);
    expect(g.hauteurs[15 * COCONET_VOIX + 0]).toBe(71);
    for (let t = 0; t < g.pas; t++) {
      expect(g.masque[t * COCONET_VOIX + 0]).toBe(0);
      for (let v = 1; v < COCONET_VOIX; v++) expect(g.masque[t * COCONET_VOIX + v]).toBe(1);
    }
    expect(g.deplacees).toBe(0);
  });

  it("refuse la pièce entière pour une seule note hors de 36 à 81, et la rend pour être nommée", () => {
    const seq = melodie();
    seq.notes.push(n(84, 4 * noire, noire));
    const g = grilleDepuisSequence(seq, "soprano", 120);
    expect(estRefus(g)).toBe(true);
    if (estRefus(g)) expect(g.horsEtendue.map((x) => x.note)).toEqual([84]);
  });

  it("accepte les deux bords de l'étendue, 36 et 81", () => {
    const seq: Sequence = { notes: [n(36, 0, noire), n(81, noire, noire)], tempo: 120 };
    expect(estRefus(grilleDepuisSequence(seq, "soprano", 120))).toBe(false);
  });

  it("garde toutes les voix reçues et ne demande que celles qui manquent", () => {
    const seq: Sequence = { notes: [n(67, 0, noire, 0), n(43, 0, noire, 3)], tempo: 120 };
    const g = grille(seq, "toutes");
    expect(g.gardees).toEqual([0, 3]);
    expect(g.masque[0]).toBe(0);
    expect(g.masque[1]).toBe(1);
    expect(g.masque[2]).toBe(1);
    expect(g.masque[3]).toBe(0);
  });

  it("refuse une cinquième voix quand toutes sont gardées", () => {
    const seq: Sequence = { notes: [n(67, 0, noire, 0), n(60, 0, noire, 4)], tempo: 120 };
    const g = grilleDepuisSequence(seq, "toutes", 120);
    expect(estRefus(g) && g.voixEnTrop).toEqual([4]);
  });

  it("sous « Soprano », compte les notes reçues d'autres voix comme remplacées", () => {
    const seq: Sequence = { notes: [n(67, 0, noire, 0), n(43, 0, noire, 3)], tempo: 120 };
    expect(grille(seq).remplacees).toBe(1);
  });

  it("compte une note qui ne tombe pas sur une case", () => {
    const seq: Sequence = { notes: [n(67, 0.1, noire)], tempo: 120 };
    expect(grille(seq).deplacees).toBe(1);
  });

  it("garde la plus aiguë de deux notes d'une même voix sur la même case", () => {
    const seq: Sequence = { notes: [n(60, 0, noire), n(64, 0, noire)], tempo: 120 };
    const g = grille(seq);
    expect(g.hauteurs[0]).toBe(64);
    expect(g.recouvertes).toBe(4);
  });
});

describe("sequenceDepuisGrille", () => {
  /** Ce que le réseau aurait écrit : une hauteur fixe par voix, partout. */
  const ecrites = (g: GrilleCoconet, parVoix: number[]): Int16Array => {
    const e = new Int16Array(g.pas * COCONET_VOIX).fill(SILENCE);
    for (let t = 0; t < g.pas; t++) for (let v = 0; v < COCONET_VOIX; v++) e[t * COCONET_VOIX + v] = parVoix[v];
    return e;
  };

  it("rend le soprano reçu à l'identique, quoi que le réseau ait écrit à sa place", () => {
    const seq = melodie();
    const g = grille(seq);
    const notes = sequenceDepuisGrille(ecrites(g, [40, 62, 55, 43]), g, seq, "soprano", true);
    expect(notes.filter((x) => x.voix === 0)).toEqual(seq.notes.map((x) => ({ ...x, voix: 0 })));
  });

  it("liée, une voix écrite de hauteur constante fait une seule note tenue", () => {
    const seq = melodie();
    const g = grille(seq);
    const alto = sequenceDepuisGrille(ecrites(g, [0, 62, 55, 43]), g, seq, "soprano", true).filter((x) => x.voix === 1);
    expect(alto).toHaveLength(1);
    expect(alto[0].debut).toBe(0);
    expect(alto[0].fin).toBeCloseTo(4 * noire, 9);
  });

  it("déliée, la même voix est refrappée à chaque noire", () => {
    const seq = melodie();
    const g = grille(seq);
    const alto = sequenceDepuisGrille(ecrites(g, [0, 62, 55, 43]), g, seq, "soprano", false).filter((x) => x.voix === 1);
    expect(alto.map((x) => x.debut)).toEqual([0, noire, 2 * noire, 3 * noire]);
  });

  it("laisse muettes les voix écrites là où le soprano se tait", () => {
    const seq: Sequence = { notes: [n(67, 0, noire), n(69, 2 * noire, noire)], tempo: 120 };
    const g = grille(seq);
    const basse = sequenceDepuisGrille(ecrites(g, [0, 62, 55, 43]), g, seq, "soprano", true).filter((x) => x.voix === 3);
    expect(basse.map((x) => [x.debut, x.fin])).toEqual([[0, noire], [2 * noire, 3 * noire]]);
  });
});
