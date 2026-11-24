// audio/corpus-mode.test.ts — Le mode d'une pièce lu sans rien estimer : par l'armure et la finale, et dans
// le MEI que Verovio rend de la partition, sous les quatre notations qu'il lit.

import { describe, expect, it } from "vitest";
import { basseFinale, DEGRE_DU_MODE, tonaliteDeLArmure, tonaliteDuMei } from "./corpus-mode";
import { MODES_CHORAL } from "./choral-regles";
import { lirePartitionSource } from "../plugins/partition-source";
import type { Note } from "./note";

const note = (n: number, debut: number, fin: number, voix: number): Note => ({ note: n, velocite: 80, debut, fin, voix });
const pc = (x: number) => ((x % 12) + 12) % 12;

describe("tonaliteDeLArmure", () => {
  it("lit chaque mode, sous chaque armure de quatre bémols à quatre dièses, par l'écart de la finale à la tonique majeure", () => {
    for (const mode of MODES_CHORAL) {
      for (let quintes = -4; quintes <= 4; quintes++) {
        const finale = pc(7 * quintes + DEGRE_DU_MODE[mode]);
        const s = { notes: [note(72, 0, 2, 0), note(60 + finale, 1, 2, 3), note(36 + finale, 0, 2, 3)], tempo: 60 };
        expect(tonaliteDeLArmure(s, quintes), `${mode}, ${quintes} quintes`).toEqual({ tonique: finale, mode, origine: "armure" });
      }
    }
  });

  it("ne rend ni le lydien ni le locrien, ni rien d'une pièce sans note", () => {
    const sur = (finale: number) => ({ notes: [note(48 + finale, 0, 1, 3)], tempo: 60 });
    expect(tonaliteDeLArmure(sur(5), 0)).toBeNull();
    expect(tonaliteDeLArmure(sur(11), 0)).toBeNull();
    expect(tonaliteDeLArmure({ notes: [], tempo: 60 }, 0)).toBeNull();
  });

  it("prend pour finale la note la plus grave qui sonne encore à la dernière attaque", () => {
    // La basse tient sol depuis le début ; la dernière attaque est celle du soprano, sur do.
    const s = { notes: [note(43, 0, 4, 3), note(72, 0, 3, 0), note(72, 3, 4, 0)], tempo: 60 };
    expect(basseFinale(s)).toBe(43);
    expect(tonaliteDeLArmure(s, 1)).toEqual({ tonique: 7, mode: "majeur", origine: "armure" });
  });
});

describe("tonaliteDuMei", () => {
  it("lit les formes que Verovio rend : keySig à armure, keySig à nom de note, scoreDef à clé", () => {
    expect(tonaliteDuMei(`<scoreDef xml:id="a"><staffDef n="1"><keySig xml:id="k" mode="mixolydian" sig="0" />`)).toEqual({ tonique: 7, mode: "mixolydien", origine: "armure" });
    expect(tonaliteDuMei(`<keySig xml:id="k" mode="mixolydian" sig="0" pname="g" />`)).toEqual({ tonique: 7, mode: "mixolydien", origine: "armure" });
    expect(tonaliteDuMei(`<scoreDef key.mode="mixolydian" key.pname="g" meter.count="4">`)).toEqual({ tonique: 7, mode: "mixolydien", origine: "armure" });
  });

  it("place la tonique par les altérations de l'armure ou du nom de note", () => {
    expect(tonaliteDuMei(`<keySig mode="dorian" sig="2f" />`)).toEqual({ tonique: 0, mode: "dorien", origine: "armure" });
    expect(tonaliteDuMei(`<keySig mode="phrygian" sig="1s" />`)).toEqual({ tonique: 11, mode: "phrygien", origine: "armure" });
    expect(tonaliteDuMei(`<scoreDef key.pname="f" key.accid="s" key.mode="minor">`)).toEqual({ tonique: 6, mode: "mineur", origine: "armure" });
    expect(tonaliteDuMei(`<scoreDef key.pname="b" key.accid="f" key.mode="major">`)).toEqual({ tonique: 10, mode: "majeur", origine: "armure" });
  });

  it("lit l'ionien et l'éolien en majeur et en mineur, et rien d'un mode qu'aucun nœud n'offre ni d'une armure sans mode", () => {
    expect(tonaliteDuMei(`<keySig mode="ionian" sig="1s" />`)?.mode).toBe("majeur");
    expect(tonaliteDuMei(`<keySig mode="aeolian" sig="0" />`)).toEqual({ tonique: 9, mode: "mineur", origine: "armure" });
    expect(tonaliteDuMei(`<keySig mode="lydian" sig="0" />`)).toBeNull();
    expect(tonaliteDuMei(`<keySig mode="locrian" sig="0" />`)).toBeNull();
    expect(tonaliteDuMei(`<scoreDef><staffDef n="1"><keySig sig="3f" />`)).toBeNull();
  });
});

const MUSICXML = (fifths: number, mode: string) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>S</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>${fifths}</fifths>${mode ? `<mode>${mode}</mode>` : ""}</key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`;
const MEI = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><music><body><mdiv><score>
<scoreDef key.pname="g" key.mode="mixolydian" meter.count="4" meter.unit="4"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
<section><measure n="1"><staff n="1"><layer n="1"><note pname="g" oct="4" dur="1"/></layer></staff></measure></section></score></mdiv></body></music></mei>`;
const HUMDRUM = (armure: string, cle: string) => ["**kern", "*M4/4", `*k[${armure}]`, cle, "=1", "1e", "==", "*-", ""].join("\n");
const ABC = (cle: string) => ["X:1", "T:essai", "M:4/4", "L:1/4", `K:${cle}`, "G4|]", ""].join("\n");

describe("la tonalité écrite, lue par Verovio", () => {
  const lue = async (texte: string) => {
    const r = await lirePartitionSource({ texte, nom: "essai" }, 60);
    if (!r.ok) throw new Error(r.message);
    return r.tonaliteEcrite;
  };
  const SOL_MIXOLYDIEN = { tonique: 7, mode: "mixolydien", origine: "armure" };

  it("rend le même sol mixolydien écrit en MusicXML, en MEI, en Humdrum et en ABC", async () => {
    expect(await lue(MUSICXML(0, "mixolydian"))).toEqual(SOL_MIXOLYDIEN);
    expect(await lue(MEI)).toEqual(SOL_MIXOLYDIEN);
    expect(await lue(HUMDRUM("", "*G:mix"))).toEqual(SOL_MIXOLYDIEN);
    expect(await lue(ABC("Gmix"))).toEqual(SOL_MIXOLYDIEN);
  });

  it("lit le dorien et le phrygien, armure comprise, et rien d'une armure sans mode", async () => {
    expect(await lue(MUSICXML(-1, "dorian"))).toEqual({ tonique: 7, mode: "dorien", origine: "armure" });
    expect(await lue(ABC("Ddor"))).toEqual({ tonique: 2, mode: "dorien", origine: "armure" });
    expect(await lue(HUMDRUM("", "*e:phr"))).toEqual({ tonique: 4, mode: "phrygien", origine: "armure" });
    expect(await lue(HUMDRUM("b-", "*d:"))).toEqual({ tonique: 2, mode: "mineur", origine: "armure" });
    expect(await lue(MUSICXML(2, ""))).toBeNull();
  });
});
