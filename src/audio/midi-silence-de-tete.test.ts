// audio/midi-silence-de-tete.test.ts — Un fichier MIDI garde le temps de ses notes, silence de
// tête compris.
//
// LE DÉFAUT QUE CE GARDE TIENT, relevé le 2026-11-21 par la passe profonde du banc des gammes.
// `notesVersFichierMidi` retranchait de chaque instant le début de la première note : une pièce qui
// commence par un silence le perdait dans son fichier, la première note tombait au tick zéro, et le
// MIDI jouait en avance sur le son que le même nœud rend à côté de lui. Mesuré en mi bémol majeur, à
// la graine 1 : « Mélodie aléatoire » à 100 BPM sonnait un temps, 0,60 s, après son MIDI, et le
// réservoir musical 0,25 s. Le recalage était là depuis le commit initial.
//
// LA RELECTURE PASSE PAR `notesDuMidi`, le chemin que les composants emploient pour lire un MIDI
// reçu : c'est ce qu'ils entendront, et non ce que l'écriture croit avoir écrit.
import { describe, expect, it } from "vitest";
import { notesDuMidi } from "./midi";
import { notesVersFichierMidi } from "./midi-ecriture";

const relire = async (fichier: File) => {
  const notes = await notesDuMidi(fichier);
  if (!notes) throw new Error("le fichier écrit n'a pas été relu");
  return notes;
};

describe("notesVersFichierMidi garde le silence de tête", () => {
  it("des notes qui commencent à 0,6 s relisent leur première note à 0,6 s", async () => {
    // Deux tempos, dont celui de « Mélodie aléatoire » : un tick y vaut 1,25 ms, et 0,6 s tombe
    // juste sur un tick dans les deux cas.
    for (const tempo of [100, 120]) {
      const relues = await relire(notesVersFichierMidi([
        { note: 63, velocite: 90, debut: 0.6, fin: 1.2 },
        { note: 67, velocite: 90, debut: 1.2, fin: 1.8 },
      ], tempo));
      expect(relues.map((n) => n.note), `à ${tempo} BPM`).toEqual([63, 67]);
      expect(relues[0].debut, `à ${tempo} BPM, la première note`).toBeCloseTo(0.6, 3);
      expect(relues[0].fin, `à ${tempo} BPM, la fin de la première note`).toBeCloseTo(1.2, 3);
      expect(relues[1].debut, `à ${tempo} BPM, la seconde note`).toBeCloseTo(1.2, 3);
    }
  });

  it("une note seule qui commence tard reste tard", async () => {
    const [seule] = await relire(notesVersFichierMidi([{ note: 60, velocite: 90, debut: 2.5, fin: 3 }], 120));
    expect(seule.debut).toBeCloseTo(2.5, 3);
    expect(seule.fin).toBeCloseTo(3, 3);
  });

  it("une note commencée avant zéro est rognée à zéro, et non perdue", async () => {
    // UN FICHIER MIDI NE SAIT PAS ÉCRIRE UN INSTANT NÉGATIF, et le rendu non plus : il en joue la part
    // qui suit zéro. Le fichier fait de même, plutôt que de taire la note ou de décaler la pièce.
    const relues = await relire(notesVersFichierMidi([
      { note: 60, velocite: 90, debut: -0.25, fin: 0.5 },
      { note: 62, velocite: 90, debut: -1, fin: -0.5 },
      { note: 64, velocite: 90, debut: 0.5, fin: 1 },
    ], 120));
    expect(relues.map((n) => [n.note, +n.debut.toFixed(3), +n.fin.toFixed(3)]))
      .toEqual([[60, 0, 0.5], [64, 0.5, 1]]);
  });
});
