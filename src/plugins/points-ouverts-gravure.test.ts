// @vitest-environment jsdom
// plugins/points-ouverts-gravure.test.ts — Les points ouverts de la gravure VexFlow, lus comme un musicien.
//
// Les points laissés ouverts par la revue des notations en texte, tranchés par Fabien le 2026-11-22,
// pour les graveurs VexFlow. Le dessin se relève par ses objets, comme dans
// `vexflow-gravure.test.ts` : chaque note avec ses hauteurs et sa durée, chaque barre de mesure.
//
// RESTE LA TABLATURE, le 2026-11-23 : les deux autres graveurs de ces points, celui d'un fichier MIDI
// et celui d'une progression, ont quitté le catalogue à la demande de Fabien.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BarNote, StaveNote, TabNote } from "vexflow";
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
