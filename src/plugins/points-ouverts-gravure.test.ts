// @vitest-environment jsdom
// plugins/points-ouverts-gravure.test.ts — Les points ouverts de la gravure VexFlow, lus comme un musicien.
//
// Les points laissés ouverts par la revue des notations en texte, tranchés par Fabien le 2026-11-22,
// pour les trois graveurs VexFlow. Le dessin se relève par ses objets, comme dans
// `vexflow-gravure.test.ts` : chaque note avec ses hauteurs et sa durée, chaque barre de mesure.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BarNote, StaveNote, TabNote } from "vexflow";
import { writeMidi } from "midi-file";
import { fiches } from "./vexflow";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";

const F = (id: string) => fiches.find((f) => f.id === id) as unknown as FicheLancable;
let traits: string[] = [];

beforeAll(() => {
  (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
  const note = StaveNote.prototype.draw;
  StaveNote.prototype.draw = function (this: any) {
    traits.push(`${this.getKeys().join("+")}/${this.getDuration()}${this.isRest() ? "r" : ""}`);
    return note.call(this);
  };
  const barre = BarNote.prototype.draw;
  BarNote.prototype.draw = function (this: any) { traits.push("|"); return barre.call(this); };
  const tab = TabNote.prototype.draw;
  TabNote.prototype.draw = function (this: any) {
    traits.push(`${this.positions.map((p: any) => `${p.str}-${p.fret}`).join("+")}/${this.getDuration()}`);
    return tab.call(this);
  };
});
beforeEach(() => { traits = []; });

describe("la Partition MIDI lit ses durées en temps", () => {
  it("huit noires, le tempo passant de 120 à 60 après la quatrième : huit noires gravées", async () => {
    // Une noire est une noire, quel que soit son tempo. Le nœud convertissait les secondes au premier
    // tempo du fichier, et les quatre dernières devenaient des blanches.
    const TPM = 480;
    const evts: any[] = [{ deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500000 }];
    for (let i = 0; i < 8; i++) {
      if (i === 4) evts.push({ deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 1000000 });
      evts.push({ deltaTime: 0, type: "noteOn", noteNumber: 60 + i, velocity: 90, channel: 0 });
      evts.push({ deltaTime: TPM, type: "noteOff", noteNumber: 60 + i, velocity: 0, channel: 0 });
    }
    evts.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
    const octets = new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: TPM }, tracks: [evts] } as any));
    const r = await lancerFiche(F("vexflow-midi"), {}, { entrees: [new File([octets as BlobPart], "t.mid")] });
    expect(r.erreurRendue, r.message.slice(0, 200)).toBe(false);
    expect(traits.map((t) => (t === "|" ? t : t.split("/").pop()))).toEqual(["q", "q", "q", "q", "|", "q", "q", "q", "q"]);
  });
});

describe("la Partition écrit chaque accord à l'état fondamental", () => {
  // Décision de Fabien : « Root position ». Les notes s'empilent depuis la fondamentale, posée à
  // l'octave 4 : en do, V sonnait ré–sol–si, un second renversement.
  const accords = async (progression: string, tonalite: string, gamme = "majeur") => {
    const r = await lancerFiche(F("vexflow-partition"), { Progression: progression, "Tonalité": tonalite, Gamme: gamme }, { entrees: [null] });
    expect(r.erreurRendue, r.message.slice(0, 200)).toBe(false);
    // Les silences qui complètent la dernière mesure ne sont pas des accords.
    return traits.filter((t) => t !== "|" && !t.endsWith("r")).map((t) => t.split("/").slice(0, -1).join("/"));
  };

  it("I V vi IV en do", async () => {
    expect(await accords("I V vi IV", "C")).toEqual(["C/4+E/4+G/4", "G/4+B/4+D/5", "A/4+C/5+E/5", "F/4+A/4+C/5"]);
  });

  it("i iv V i en la mineur", async () => {
    expect(await accords("i iv V i", "A", "mineur")).toEqual(["A/4+C/5+E/5", "D/4+F/4+A/4", "E/4+G#/4+B/4", "A/4+C/5+E/5"]);
  });

  it("un accord à basse écrite garde sa basse en bas : C/E", async () => {
    expect(await accords("C/E G", "C")).toEqual(["E/4+G/4+C/5", "G/4+B/4+D/5"]);
  });
});

describe("la Tablature se coupe en mesures de 4/4", () => {
  // Décision de Fabien : « Cut into bars », comme la portée. Neuf noires se gravaient sans une barre.
  const graver = async (tablature: string) => {
    const r = await lancerFiche(F("vexflow-tab"), { Tablature: tablature }, { entrees: [null] });
    expect(r.erreurRendue, r.message.slice(0, 200)).toBe(false);
    return traits;
  };

  it("neuf noires : deux barres, après la quatrième et la huitième", async () => {
    const t = await graver("6-3/q 5-0/q 5-2/q 4-0/q 5-3/q 5-2/q 4-0/q 4-2/q 3-0/q");
    expect(t.filter((x) => x === "|")).toHaveLength(2);
    expect(t.indexOf("|")).toBe(4);
    expect(t.lastIndexOf("|")).toBe(9);
  });

  it("une blanche sur le quatrième temps passe la barre en deux noires, la seconde entre parenthèses", async () => {
    expect(await graver("6-3/q 5-0/q 5-2/q 4-0/h")).toEqual(["6-3/q", "5-0/q", "5-2/q", "4-0/q", "|", "4-(0)/q"]);
  });

  it("quatre noires tiennent dans une mesure, sans barre", async () => {
    expect(await graver("6-3/q 5-0/q 5-2/q 4-0/q")).toEqual(["6-3/q", "5-0/q", "5-2/q", "4-0/q"]);
  });
});
