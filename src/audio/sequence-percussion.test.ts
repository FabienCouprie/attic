// audio/sequence-percussion.test.ts — La batterie d'une séquence est-elle bien mise à part ?
//
// CE QUE CE FICHIER DOIT TENIR. Deux choses, et la seconde compte autant que la première : que le
// canal dix parte à la batterie, et qu'une séquence qui ne dit rien de ses canaux rende exactement
// ce qu'elle rendait. La seconde est ce qui autorise à toucher un rendu employé par une vingtaine
// de composants.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { CANAL_PERCUSSION } from "./batterie-midi";
import { rendreSequence } from "./midi-sequence";
import type { Note } from "./note";
import {
  estFrappe, melangerTampons, RESERVE_BATTERIE, separerPercussions, tamponSilencieux,
} from "./sequence-percussion";

const note = (n: number, debut: number, canal?: number): Note =>
  ({ note: n, velocite: 100, debut, fin: debut + 0.2, ...(canal === undefined ? {} : { canal }) });

/** Le plus grand écart entre deux tampons, échantillon par échantillon. */
function ecartMax(a: AudioBuffer, b: AudioBuffer): number {
  let pire = 0;
  for (let c = 0; c < Math.min(a.numberOfChannels, b.numberOfChannels); c++) {
    const ga = a.getChannelData(c), gb = b.getChannelData(c);
    for (let i = 0; i < Math.min(ga.length, gb.length); i++) {
      pire = Math.max(pire, Math.abs(ga[i] - gb[i]));
    }
  }
  return pire;
}

/** La crête d'un tampon, toutes voies confondues. */
function crete(b: AudioBuffer): number {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    for (const v of b.getChannelData(c)) m = Math.max(m, Math.abs(v));
  }
  return m;
}

describe("ce qui part à la batterie", () => {
  it("LE CANAL DIX, ET LUI SEUL", () => {
    expect(estFrappe(note(36, 0, CANAL_PERCUSSION))).toBe(true);
    for (const canal of [0, 1, 8, 10, 15]) expect(estFrappe(note(36, 0, canal)), `canal ${canal}`).toBe(false);
  });

  it("UN CANAL ABSENT VAUT ZÉRO : une séquence qui les ignore reste entièrement mélodique", () => {
    expect(estFrappe(note(36, 0))).toBe(false);
    const { frappes, hauteurs } = separerPercussions([note(60, 0), note(64, 1), note(67, 2)]);
    expect(frappes).toHaveLength(0);
    expect(hauteurs).toHaveLength(3);
  });

  it("le partage garde l'ordre de chaque côté et ne perd aucune note", () => {
    const notes = [note(60, 0), note(36, 1, 9), note(64, 2), note(38, 3, 9), note(67, 4)];
    const { frappes, hauteurs } = separerPercussions(notes);
    expect(frappes.map((n) => n.debut)).toEqual([1, 3]);
    expect(hauteurs.map((n) => n.debut)).toEqual([0, 2, 4]);
    expect(frappes.length + hauteurs.length).toBe(notes.length);
  });
});

describe("le mélange des deux moitiés", () => {
  const remplir = (duree: number, valeur: number, sampleRate = 44100) => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: Math.ceil(duree * sampleRate), sampleRate });
    for (let c = 0; c < 2; c++) b.getChannelData(c).fill(valeur);
    return b;
  };

  it("les deux s'additionnent, sans écrêtage", () => {
    const m = melangerTampons(remplir(0.1, 0.3), remplir(0.1, 0.5), 0.1);
    expect(m.getChannelData(0)[0]).toBeCloseTo(0.8, 6);
    const fort = melangerTampons(remplir(0.1, 0.7), remplir(0.1, 0.7), 0.1);
    expect(fort.getChannelData(0)[0]).toBeCloseTo(1.4, 6);
  });

  it("LA DURÉE VOULUE L'EMPORTE : la queue d'une cymbale ne rallonge pas la pièce", () => {
    // La batterie est rendue avec une demi-seconde de queue ; elle ne doit pas s'ajouter au cycle.
    const m = melangerTampons(remplir(1, 0.1), remplir(1.5, 0.1), 1);
    expect(m.duration).toBeCloseTo(1, 6);
    expect(m.getChannelData(0)[m.length - 1]).toBeCloseTo(0.2, 6);
  });

  it("une moitié plus courte que la durée laisse du silence après elle", () => {
    const m = melangerTampons(remplir(0.5, 0.4), remplir(1, 0.1), 1);
    expect(m.getChannelData(0)[0]).toBeCloseTo(0.5, 6);
    expect(m.getChannelData(0)[m.length - 1]).toBeCloseTo(0.1, 6);
  });

  it("un silence est bien silencieux, et de la bonne durée", () => {
    const s = tamponSilencieux(2);
    expect(s.duration).toBeCloseTo(2, 6);
    expect(crete(s)).toBe(0);
  });
});

describe("le rendu d'une séquence, bout en bout", () => {
  it("UNE SÉQUENCE SANS CANAL REND EXACTEMENT CE QU'ELLE RENDAIT, échantillon par échantillon", async () => {
    // Le garde-fou du changement : le partage ne doit toucher à rien de ce qui existe. La même
    // séquence écrite avec des canaux mélodiques explicites doit donner le même son que sans.
    const sans = [note(60, 0), note(64, 0.25), note(67, 0.5)];
    const avec = [note(60, 0, 0), note(64, 0.25, 1), note(67, 0.5, 4)];
    const [a, b] = await Promise.all([
      rendreSequence(sans, "FM/Oscillateurs", 80, undefined, undefined, "pur", 1),
      rendreSequence(avec, "FM/Oscillateurs", 80, undefined, undefined, "pur", 1),
    ]);
    expect(a.length).toBe(b.length);
    expect(ecartMax(a, b)).toBe(0);
  });

  it("UNE GROSSE CAISSE NE SORT PLUS EN SINUSOÏDE : le canal dix s'entend", async () => {
    // Le même numéro de note, 36, rendu des deux façons. En hauteur, c'est un do très grave tenu ;
    // à la batterie, c'est une frappe qui retombe. Les deux tampons ne peuvent pas se ressembler.
    const enHauteur = await rendreSequence([note(36, 0)], "FM/Oscillateurs", 80, undefined, undefined, "pur", 1);
    const enFrappe = await rendreSequence(
      [note(36, 0, CANAL_PERCUSSION)], "FM/Oscillateurs", 80, undefined, undefined, "pur", 1);
    expect(crete(enFrappe)).toBeGreaterThan(0);
    expect(ecartMax(enHauteur, enFrappe)).toBeGreaterThan(0.01);
  });

  it("LA BATTERIE GARDE LA MÊME RÉSERVE QUE LES HAUTEURS, sans quoi le mélange écrête", async () => {
    // Le niveau est un gain : la même frappe rendue à deux volumes dans le rapport de la réserve
    // doit donner deux tampons dans ce même rapport. C'est ce qui autorise à appliquer la réserve
    // en multipliant le volume plutôt qu'en repassant sur les échantillons.
    const { rendreBatterieMidi } = await import("./tone-synths");
    const frappes = [note(36, 0, CANAL_PERCUSSION)];
    const plein = await rendreBatterieMidi({ notes: frappes, volume: 100 });
    const reduit = await rendreBatterieMidi({ notes: frappes, volume: 100 * RESERVE_BATTERIE });
    expect(crete(reduit)).toBeGreaterThan(0);
    expect(crete(reduit) / crete(plein)).toBeCloseTo(RESERVE_BATTERIE, 6);
    // Et le rendu de séquence applique bien cette réserve, et non le niveau plein.
    const parLaSequence = await rendreSequence(
      frappes, "FM/Oscillateurs", 100, undefined, undefined, "pur", 1);
    expect(crete(parLaSequence)).toBeCloseTo(crete(reduit), 6);
  });

  it("une séquence de batterie seule garde la durée voulue, silence final compris", async () => {
    const rendu = await rendreSequence(
      [note(36, 0, CANAL_PERCUSSION), note(38, 0.5, CANAL_PERCUSSION)],
      "FM/Oscillateurs", 80, undefined, undefined, "pur", 3);
    expect(rendu.duration).toBeCloseTo(3, 2);
  });

  it("LES DEUX MOITIÉS SONNENT ENSEMBLE, et non l'une à la place de l'autre", async () => {
    const melodie = [note(72, 0), note(76, 0.5)];
    // DEUX GROSSES CAISSES ET AUCUNE CAISSE CLAIRE : celle-ci mêle un bruit à son corps, et deux
    // rendus successifs n'en donnent pas les mêmes échantillons. Comparer une somme demande des
    // voix reproductibles, et la membrane en est une.
    const frappes = [note(36, 0, CANAL_PERCUSSION), note(36, 0.5, CANAL_PERCUSSION)];
    const seule = await rendreSequence(melodie, "FM/Oscillateurs", 80, undefined, undefined, "pur", 2);
    const batterie = await rendreSequence(frappes, "FM/Oscillateurs", 80, undefined, undefined, "pur", 2);
    const ensemble = await rendreSequence(
      [...melodie, ...frappes], "FM/Oscillateurs", 80, undefined, undefined, "pur", 2);
    expect(ensemble.length).toBe(seule.length);
    // La somme des deux, à la précision du flottant simple : rien d'autre n'est ajouté au passage.
    for (let i = 0; i < ensemble.length; i += 137) {
      const attendu = seule.getChannelData(0)[i] + batterie.getChannelData(0)[i];
      expect(ensemble.getChannelData(0)[i]).toBeCloseTo(attendu, 5);
    }
  });
});
