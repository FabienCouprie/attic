// audio/dcml-tsv.test.ts — Les tables de notes du DCML : colonnes par nom, liaisons, voix.
//
// Les lignes sont tirées du choral n° 1 du corpus (`DCMLab/bach_chorales` v2.0, CC0) et réduites :
// l'en-tête est le sien, et les deux notes liées de la basse aux temps 30 et 31 sont les siennes.

import { describe, expect, it } from "vitest";
import { lireTableDcml, nombreMs3 } from "./dcml-tsv";

const ENTETE = "mc\tmn\tquarterbeats\tquarterbeats_all_endings\tduration_qb\tmc_onset\tmn_onset\ttimesig\tstaff\tvoice\tduration\tnominal_duration\tscalar\ttied\ttpc\tmidi\tname\toctave\tchord_id";
const ligne = (qb: string, duree: string, staff: number, voice: number, midi: number, tied = "") =>
  ["8", "8", qb, qb, duree, "0", "0", "3/4", String(staff), String(voice), "1/4", "1/4", "1", tied, "1", String(midi), "X", "4", "1"].join("\t");

describe("nombreMs3", () => {
  it("lit entiers, décimaux et fractions, et rend NaN pour une case vide", () => {
    expect(nombreMs3("30")).toBe(30);
    expect(nombreMs3("0.5")).toBe(0.5);
    expect(nombreMs3("3/2")).toBe(1.5);
    expect(Number.isNaN(nombreMs3(""))).toBe(true);
  });
});

describe("lireTableDcml", () => {
  it("numérote les voix par portée puis par voix : soprano, alto, ténor, basse", () => {
    const t = [ENTETE, ligne("0", "1.0", 2, 2, 43), ligne("0", "1.0", 2, 1, 59), ligne("0", "1.0", 1, 2, 62), ligne("0", "1.0", 1, 1, 67)].join("\n");
    const { sequence } = lireTableDcml(t, 60);
    const parVoix = [0, 1, 2, 3].map((v) => sequence.notes.find((n) => n.voix === v)?.note);
    expect(parVoix).toEqual([67, 62, 59, 43]);
  });

  it("joint une liaison en une seule note, comme la basse du choral n° 1 aux temps 30 et 31", () => {
    const t = [ENTETE, ligne("30", "1.0", 2, 2, 52, "1"), ligne("31", "1.0", 2, 2, 52, "-1"), ligne("32", "1.0", 2, 2, 50)].join("\n");
    const { sequence, liees } = lireTableDcml(t, 60);
    expect(sequence.notes.map((n) => [n.note, n.debut, n.fin])).toEqual([[52, 30, 32], [50, 32, 33]]);
    expect(liees).toBe(1);
  });

  it("lit les colonnes par leur nom, quel que soit leur ordre", () => {
    const t = ["midi\tstaff\tvoice\tduration_qb\tquarterbeats\ttied", "67\t1\t1\t3/2\t1/2\t"].join("\n");
    const { sequence } = lireTableDcml(t, 60);
    expect(sequence.notes.map((n) => [n.note, n.debut, n.fin])).toEqual([[67, 0.5, 2]]);
  });

  it("met le tempo dans les secondes : une noire vaut 60 / tempo", () => {
    const { sequence } = lireTableDcml([ENTETE, ligne("2", "1.0", 1, 1, 67)].join("\n"), 120);
    expect(sequence.notes[0].debut).toBe(1);
    expect(sequence.notes[0].fin).toBe(1.5);
  });

  it("refuse une ligne illisible en la nommant, et une table sans ses colonnes", () => {
    const { refusees } = lireTableDcml([ENTETE, ligne("", "1.0", 1, 1, 67)].join("\n"), 60);
    expect(refusees).toEqual([{ ligne: 2, raison: "attaque, durée, portée, voix ou hauteur illisible" }]);
    expect(lireTableDcml("a\tb\n1\t2").refusees[0].raison).toMatch(/^colonnes absentes : staff, voice, midi, duration_qb/);
  });
});
