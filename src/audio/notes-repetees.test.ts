// audio/notes-repetees.test.ts — Une note qui se rejoue à la même hauteur doit sonner.
//
// Le défaut rapporté : « les progressions par genre ne sont pas audibles, on n'a qu'un
// seul accord en entrée de jeu ». La cause n'était pas dans l'harmonie — les degrés
// générés étaient justes — mais dans l'écriture du fichier MIDI. Un accord est tenu
// jusqu'au suivant, donc son note-off tombe au tick exact du note-on qui relance la même
// hauteur ; les note-off étant écrits APRÈS les note-on du même tick, la note relancée
// était refermée à l'instant où elle s'ouvrait. Durée nulle, et le rendu écarte tout ce
// qui dure moins d'une milliseconde. En blues (I–I–I–I) toutes les hauteurs se répètent :
// seul le premier accord s'entendait.
//
// Ces tests mesurent la durée des notes telles qu'un lecteur les relit, par les trois
// chemins qui écrivent du MIDI : `notesVersFichierMidi`, les pistes de la Groove Box et
// le Générateur d'accords.
import { describe, expect, it } from "vitest";
import { parseMidi } from "midi-file";
import { analyserMidi, notesVersFichierMidi } from "./midi";
import { genererGrooveBox, type ConfigGrooveBox } from "./groove-box";
import { genererAccords } from "./generation";

/** Les notes relues, telles que le rendu les recevra. */
const relire = (bytes: Uint8Array) => analyserMidi(parseMidi(bytes)).notes;
/** Celles qui sonnent : `rendreAvecSF2` écarte tout ce qui dure 1 ms ou moins. */
const audibles = (bytes: Uint8Array, canal?: number) =>
  relire(bytes).filter((n) => n.fin - n.debut > 0.001 && (canal === undefined || n.canal === canal));

const CONFIG: ConfigGrooveBox = {
  cle: "C", gamme: "majeur", genre: "pop", progression: "I-V-vi-IV", extension: "aucune",
  tempo: 120, dureeAccord: 2, nbAccords: 8, styleRythme: "Pop dance",
  neurones: 10, connectivite: 0.3, memoire: 0.3, spectre: 0.9, octave: 4,
  densite: 0.7, repetition: 0.25, silence: 0.1, graine: 42,
};

describe("notesVersFichierMidi", () => {
  it("garde les trois notes d'une hauteur répétée bout à bout", async () => {
    const notes = [
      { note: 60, velocite: 90, debut: 0, fin: 1 },
      { note: 60, velocite: 90, debut: 1, fin: 2 },
      { note: 60, velocite: 90, debut: 2, fin: 3 },
    ];
    const bytes = new Uint8Array(await notesVersFichierMidi(notes, 120).arrayBuffer());
    const relues = audibles(bytes);
    expect(relues.length).toBe(3);
    for (const n of relues) expect(n.fin - n.debut).toBeCloseTo(1, 2);
  });

  it("n'écourte pas une note qu'une autre hauteur relaie au même instant", async () => {
    const bytes = new Uint8Array(await notesVersFichierMidi([
      { note: 60, velocite: 90, debut: 0, fin: 1 },
      { note: 64, velocite: 90, debut: 1, fin: 2 },
    ], 120).arrayBuffer());
    expect(audibles(bytes).map((n) => [n.note, +(n.fin - n.debut).toFixed(2)]))
      .toEqual([[60, 1], [64, 1]]);
  });

  it("écrit le tempo et l'instrument avant la première note", async () => {
    const bytes = new Uint8Array(await notesVersFichierMidi(
      [{ note: 60, velocite: 90, debut: 0, fin: 1 }], 120, 0, 0, 24,
    ).arrayBuffer());
    const types = parseMidi(bytes).tracks[0].map((e) => e.type);
    expect(types.indexOf("programChange")).toBeLessThan(types.indexOf("noteOn"));
    expect(types.indexOf("setTempo")).toBeLessThan(types.indexOf("noteOn"));
  });
});

describe("Groove Box : tous les accords s'entendent", () => {
  // Le blues est le cas extrême — I–I–I–I, donc huit accords aux mêmes hauteurs — mais
  // un degré répété suffit, et la boucle en crée un dès que la progression se referme
  // sur son premier degré.
  for (const genre of ["blues", "pop", "jazz", "rock", "classique", "ambient"]) {
    it(`${genre} : aucune note muette dans la piste des accords`, () => {
      const r = genererGrooveBox({ ...CONFIG, genre });
      const generees = r.notes.filter((n) => n.canal === 0).length;
      expect(audibles(r.midiBytes, 0).length).toBe(generees);
      // La sortie « MIDI accords » passe par un autre écrivain : même promesse.
      expect(audibles(r.midiAccords).length).toBe(generees);
    });
  }

  it("le blues fait bien entendre huit attaques d'accord, et pas une seule", () => {
    const r = genererGrooveBox({ ...CONFIG, genre: "blues" });
    const debuts = new Set(audibles(r.midiBytes, 0).map((n) => +n.debut.toFixed(3)));
    expect(debuts.size).toBe(CONFIG.nbAccords);
  });

  it("la basse ne se tait pas non plus quand la fondamentale se répète", () => {
    const r = genererGrooveBox({ ...CONFIG, genre: "blues" });
    expect(audibles(r.midiBytes, 1).length).toBe(r.notes.filter((n) => n.canal === 1).length);
    expect(audibles(r.midiBasse).length).toBe(r.notes.filter((n) => n.canal === 1).length);
  });
});

describe("Générateur d'accords", () => {
  it("ne laisse aucune note muette sur une progression qui répète un degré", () => {
    // Les accords y sont arpégés : on ne compte pas les attaques, on vérifie qu'aucune
    // note relue n'a une durée nulle — c'est exactement ce que produisait l'ordre inversé.
    const { midiBytes } = genererAccords("C", "majeur", "personnalisé", "I-I-IV-I", 120, 2, 8);
    const muettes = relire(midiBytes).filter((n) => n.fin - n.debut <= 0.001);
    expect(muettes).toEqual([]);
    expect(audibles(midiBytes).length).toBeGreaterThan(8);
  });
});
