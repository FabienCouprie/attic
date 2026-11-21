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
import { parseMidi } from "midi-file";
import { analyserMidi, notesDuMidi } from "./midi";
import { notesVersFichierMidi } from "./midi-ecriture";
import { genererGrooveBox, type ConfigGrooveBox } from "./groove-box";

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

// LA GROOVE BOX A SES PROPRES ÉCRIVAINS, et ils portaient le même recalage : le MIDI combiné sur la
// toute première note, chaque partie sur la sienne. Le son est rendu du MIDI combiné, dont les accords
// commencent à zéro ; une mélodie qui commence par un silence sortait donc en avance sur lui, et sur
// les trois autres parties une fois réunies par « Jointure MIDI ».
const GROOVE: ConfigGrooveBox = {
  cle: "C", gamme: "majeur", genre: "pop", progression: "I-V-vi-IV", extension: "aucune",
  tempo: 120, dureeAccord: 2, nbAccords: 4, styleRythme: "Pop dance",
  neurones: 10, connectivite: 0.3, memoire: 0.3, spectre: 0.9, octave: 4,
  densite: 0.7, repetition: 0.25, silence: 0.6, graine: 1,
};
const CANAUX = [["midiAccords", 0], ["midiBasse", 1], ["midiMelodie", 2], ["midiBatterie", 9]] as const;
const premiere = (notes: readonly { debut: number }[]) => Math.min(...notes.map((n) => n.debut));

describe("la Groove Box garde le silence de tête de chaque partie", () => {
  it("chaque partie, seule ou dans le MIDI combiné, relit sa première note à son instant", () => {
    // LE CAS NE PASSE PAS PAR CHANCE DE GRAINE : il compte les graines où la mélodie commence
    // vraiment tard, et en exige. Sans elles, il ne prouverait rien sur le recalage.
    let melodiesTardives = 0;
    for (let graine = 1; graine <= 12; graine++) {
      const r = genererGrooveBox({ ...GROOVE, graine });
      const combine = analyserMidi(parseMidi(r.midiBytes)).notes;
      for (const [cle, canal] of CANAUX) {
        const attendues = r.notes.filter((n) => n.canal === canal);
        if (attendues.length === 0) continue;
        const attendu = premiere(attendues);
        if (canal === 2 && attendu > 0.05) melodiesTardives++;
        const seule = analyserMidi(parseMidi(r[cle])).notes;
        expect(premiere(seule), `graine ${graine}, ${cle} seule`).toBeCloseTo(attendu, 2);
        expect(premiere(combine.filter((n) => n.canal === canal)), `graine ${graine}, canal ${canal} du MIDI combiné`)
          .toBeCloseTo(attendu, 2);
      }
    }
    expect(melodiesTardives, "aucune mélodie ne commence tard : le cas n'éprouve rien").toBeGreaterThan(0);
  });

  it("la batterie d'un patron qui ne frappe pas au premier pas garde son attente", () => {
    // Le reggae ne frappe qu'au troisième double-croche : 0,25 s à 120 BPM.
    const r = genererGrooveBox({ ...GROOVE, styleRythme: "Reggae" });
    const attendu = premiere(r.notes.filter((n) => n.canal === 9));
    expect(attendu, "le patron frappe au premier pas : le cas n'éprouve rien").toBeCloseTo(0.25, 3);
    expect(premiere(analyserMidi(parseMidi(r.midiBatterie)).notes)).toBeCloseTo(0.25, 2);
  });
});
