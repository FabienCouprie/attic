// audio/musicxml-parties.test.ts — Un choral écrit une partie par voix, relu voix par voix.

import { describe, expect, it } from "vitest";
import { sequenceVersMusicXMLParVoix } from "./musicxml-parties";
import { notesVersMusicXML } from "./musicxml";
import { lirePartitionSource } from "../plugins/partition-source";
import { lireTableDcml } from "./dcml-tsv";
import { TABLE_175 } from "./choral-175-dcml";
import type { Sequence } from "./sequence";

const voixDe = (s: Sequence, v: number) => s.notes.filter((n) => (n.voix ?? 0) === v).map((n) => [n.note, Math.round(n.debut * 1000) / 1000]);

describe("le MusicXML à une partie par voix", () => {
  it("rend à la relecture les quatre voix du choral 175, chacune la sienne", async () => {
    const choral = { ...lireTableDcml(TABLE_175, 60).sequence, voix: ["soprano", "alto", "ténor", "basse"].map((nom, numero) => ({ numero, nom })) };
    const xml = sequenceVersMusicXMLParVoix(choral, { titre: "Jesus, meine Zuversicht" });
    expect(xml.match(/<score-part id="P\d">/g)).toHaveLength(4);
    expect(xml.match(/<clef><sign>F<\/sign>/g)).toHaveLength(2);
    const lue = await lirePartitionSource({ texte: xml, nom: "175" }, 60);
    if (!lue.ok) throw new Error(lue.message);
    for (let v = 0; v < 4; v++) expect(voixDe(lue.sequence, v), `voix ${v}`).toEqual(voixDe(choral, v));
  }, 60_000);

  it("écrit toutes les parties de la même longueur, une voix qui se tait tôt comprise", () => {
    const s: Sequence = { tempo: 60, notes: [
      { note: 72, velocite: 80, debut: 0, fin: 8, voix: 0 },
      { note: 48, velocite: 80, debut: 0, fin: 1, voix: 1 },
    ] };
    const xml = sequenceVersMusicXMLParVoix(s);
    const parties = xml.split('<part id="').slice(1);
    expect(parties.map((p) => (p.match(/<measure /g) ?? []).length)).toEqual([2, 2]);
    // Seule, la voix courte n'en aurait écrit qu'une.
    expect((notesVersMusicXML([s.notes[1]], { tempo: 60 }).match(/<measure /g) ?? []).length).toBe(1);
  });
});
