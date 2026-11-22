// audio/corpus.test.ts — Le type corpus, son fichier, son MIDI à une piste par voix, et sa tonalité.

import { describe, expect, it } from "vitest";
import { estCorpus, voixDeLaPiece } from "./corpus";
import { corpusDepuisJson, corpusVersJson } from "./corpus-fichier";
import { sequenceDepuisMidiParPiste, sequenceVersMidiParVoix } from "./corpus-midi";
import { tonaliteDesNotes } from "./corpus-tonalite";
import { corpusDEssai } from "./valeurs-essai";
import { lireTableDcml } from "./dcml-tsv";
import { TABLE_175 } from "./choral-175-dcml";
import type { Sequence } from "./sequence";

/** Les notes d'une voix, en noires arrondies au millième. */
const voixDe = (s: Sequence, v: number) => s.notes.filter((n) => (n.voix ?? 0) === v)
  .map((n) => [n.note, Math.round(n.debut * 1000) / 1000, Math.round(n.fin * 1000) / 1000]);

describe("le type corpus", () => {
  it("reconnaît un corpus, et rien d'autre", () => {
    expect(estCorpus(corpusDEssai())).toBe(true);
    expect(estCorpus({ notes: [] })).toBe(false);
    expect(estCorpus({ pieces: [{ source: "x", sequence: { notes: "non" }, tonalite: null }] })).toBe(false);
    expect(voixDeLaPiece(corpusDEssai().pieces[0])).toBe(4);
  });
});

describe("le fichier de corpus", () => {
  it("rend à la relecture les mêmes pièces, voix, noms et tonalités", () => {
    const c = corpusDEssai();
    const relu = corpusDepuisJson(corpusVersJson(c, { nom: "essai", source: "essai", licence: "CC0-1.0" }, new Map([["essai-do-majeur", "4/4"]])));
    expect(relu.corpus.pieces.map((p) => p.source)).toEqual(["essai-do-majeur", "essai-la-mineur"]);
    for (const [k, p] of relu.corpus.pieces.entries()) {
      for (let v = 0; v < 4; v++) expect(voixDe(p.sequence, v)).toEqual(voixDe(c.pieces[k].sequence, v));
      expect(p.tonalite).toEqual(c.pieces[k].tonalite);
      expect(p.sequence.voix?.map((x) => x.nom)).toEqual(["soprano", "alto", "ténor", "basse"]);
    }
    expect(relu.metriques.get("essai-do-majeur")).toBe("4/4");
  });

  it("refuse en le disant un texte qui n'est pas un corpus", () => {
    expect(() => corpusDepuisJson(JSON.stringify({ pieces: [] }))).toThrow(/pas un corpus/);
  });
});

describe("le MIDI d'une pièce, une piste par voix", () => {
  it("rend chaque voix sur sa piste, à la relecture", async () => {
    const piece = lireTableDcml(TABLE_175, 60).sequence;
    const relue = sequenceDepuisMidiParPiste(await sequenceVersMidiParVoix(piece));
    expect(relue.orphelines).toBe(0);
    expect(relue.sequence.voix?.length).toBe(4);
    for (let v = 0; v < 4; v++) expect(voixDe(relue.sequence, v)).toEqual(voixDe(piece, v));
  });

  it("lit le tempo du fichier, et suit ses changements en cours de route", async () => {
    const piece = corpusDEssai().pieces[0].sequence;
    const relue = sequenceDepuisMidiParPiste(await sequenceVersMidiParVoix({ ...piece, tempo: 90 }));
    expect(relue.sequence.tempo).toBe(90);
    expect(voixDe(relue.sequence, 3)).toEqual(voixDe(piece, 3));
    // De 60 à 120 à la noire à la deuxième seconde : les instants restent ceux qui ont été écrits.
    const notes = [0, 1, 2, 2.5, 3].map((debut) => ({ note: 60, velocite: 80, debut, fin: debut + 0.5 }));
    const fichier = new Uint8Array(await (await import("./midi-ecriture")).notesVersFichierMidi(notes, 60, 0, undefined, undefined, [{ debut: 2, bpm: 120 }]).arrayBuffer());
    expect(sequenceDepuisMidiParPiste(fichier).sequence.notes.map((n) => [n.debut, n.fin])).toEqual(notes.map((n) => [n.debut, n.fin]));
  });
});

describe("la tonalité d'une pièce", () => {
  it("lit do majeur et la mineur sur les deux pièces d'essai, et le choral 175 en do majeur", () => {
    const [majeur, mineur] = corpusDEssai().pieces;
    expect(tonaliteDesNotes(majeur.sequence)).toEqual({ tonique: 0, mode: "majeur", origine: "notes" });
    expect(tonaliteDesNotes(mineur.sequence)).toEqual({ tonique: 9, mode: "mineur", origine: "notes" });
    expect(tonaliteDesNotes(lireTableDcml(TABLE_175, 60).sequence)).toMatchObject({ tonique: 0, mode: "majeur" });
    expect(tonaliteDesNotes({ notes: [] })).toBe(null);
  });
});
