// audio/fusion-midi.test.ts — Réunir les sorties MIDI d'un nœud en un seul fichier jouable.
import { describe, expect, it } from "vitest";
import { parseMidi } from "midi-file";
import { fusionnerMidis, notesVersFichierMidi } from "./midi";

const octets = async (f: File) => new Uint8Array(await f.arrayBuffer());
const partie = (note: number, canal: number, programme?: number) =>
  notesVersFichierMidi([{ note, velocite: 90, debut: 0, fin: 1 }], 120, canal, programme === undefined ? undefined : 0, programme);

describe("fusionnerMidis", () => {
  it("garde le canal et l'instrument de chaque partie", async () => {
    const fusion = parseMidi(fusionnerMidis([
      await octets(partie(60, 0, 24)),
      await octets(partie(40, 1, 33)),
      await octets(partie(36, 9)),
    ]));
    const evenements = fusion.tracks.flat();
    const programmes = evenements.filter((e) => e.type === "programChange") as { channel: number; programNumber: number }[];
    expect(programmes.map((p) => [p.channel, p.programNumber])).toEqual([[0, 24], [1, 33]]);
    const notes = evenements.filter((e) => e.type === "noteOn") as { channel: number; noteNumber: number }[];
    expect(notes.map((n) => [n.channel, n.noteNumber])).toEqual([[0, 60], [1, 40], [9, 36]]);
  });

  it("produit un fichier multi-piste dont l'en-tête annonce le bon compte", async () => {
    const fusion = parseMidi(fusionnerMidis([await octets(partie(60, 0)), await octets(partie(62, 1))]));
    expect(fusion.header.format).toBe(1);
    expect(fusion.header.numTracks).toBe(fusion.tracks.length);
  });

  it("refuse des résolutions différentes plutôt que de rejouer à la mauvaise vitesse", async () => {
    const normal = await octets(partie(60, 0));
    const autre = parseMidi(normal);
    autre.header.ticksPerBeat = 96;
    const { writeMidi } = await import("midi-file");
    expect(() => fusionnerMidis([normal, new Uint8Array(writeMidi(autre as never))])).toThrow(/Résolutions/);
  });

  it("refuse une liste vide", () => {
    expect(() => fusionnerMidis([])).toThrow(/Aucun MIDI/);
  });
});
