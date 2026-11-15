// audio/accords-sans-passage.test.ts — Un accord ne se bâtit pas sur une note de passage.
//
// LA BEBOP DOMINANTE EST LE MIXOLYDIEN ET SA SEPTIÈME MAJEURE DE PASSAGE (`gammes.ts`), et elle va
// sur l'accord de septième (`accord-gamme.ts`). Ses accords comptaient pourtant la note de passage
// comme une note de l'accord : le I sortait Cmaj7, le iii Em7 et le V G7, soit exactement les accords
// de do majeur. Décision de Fabien du 2026-11-15 : les accords laissent la note de passage, les
// mélodies la gardent, puisque c'est elle qui fait tomber les notes de l'accord sur les temps.
//
// CE QUI EST TENU, dans chaque générateur qui bâtit des accords sur une gamme : la bebop dominante
// y rend les accords du mixolydien, note pour note, et la mélodie du générateur par script garde le
// si de passage.
import { describe, expect, it } from "vitest";
import { parseMidi } from "midi-file";
import { GAMMES, degresDeGamme, degresSansPassage } from "./gammes";
import { genererAccords } from "./generation-accords";
import { genererDepuisScript } from "./generation";
import { genererGrooveBox, type ConfigGrooveBox } from "./groove-box";
import { NB_LIGNES_ACCORDS, genererNotesSequenceurAccords, nomAccordPourLigne } from "./accords-sequencer";

/** Les notes tenues d'un canal d'un fichier MIDI, dans l'ordre. */
function notesDuCanal(octets: Uint8Array, canal: number): number[] {
  const midi = parseMidi(octets);
  const notes: number[] = [];
  for (const piste of midi.tracks) {
    for (const e of piste) {
      if (e.type === "noteOn" && e.velocity > 0 && e.channel === canal) notes.push(e.noteNumber);
    }
  }
  return notes;
}

describe("la note de passage", () => {
  it("la bebop dominante porte sa septième majeure de passage, et elle seule en a une", () => {
    for (const g of GAMMES) {
      const attendu = g.id === "bebop-dominant" ? [11] : undefined;
      expect(g.passage, g.id).toEqual(attendu);
      for (const p of g.passage ?? []) expect(g.degres, g.id).toContain(p);
    }
  });

  it("sans sa note de passage, la bebop dominante est le mixolydien ; les autres gammes ne changent pas", () => {
    expect(degresSansPassage("bebop-dominant")).toEqual(degresDeGamme("mixolydien"));
    for (const g of GAMMES.filter((x) => x.id !== "bebop-dominant")) {
      expect(degresSansPassage(g.id), g.id).toEqual(g.degres);
    }
    expect(degresSansPassage("inconnue", "mineur")).toEqual(degresDeGamme("mineur"));
  });
});

describe("LES ACCORDS DE LA BEBOP DOMINANTE SONT CEUX DU MIXOLYDIEN", () => {
  it("le séquenceur d'accords les nomme comme ceux du mixolydien, triades, septièmes et sixtes", () => {
    const noms = (gamme: string) => Array.from({ length: NB_LIGNES_ACCORDS }, (_, r) => nomAccordPourLigne(r, "C", gamme));
    const bebop = noms("bebop-dominant");
    expect(bebop).toEqual(noms("mixolydien"));
    // Le I est une septième de dominante, comme la table des gammes d'accord l'associe.
    expect(bebop[1]).toBe("C7");
  });

  it("le séquenceur d'accords en joue les notes", () => {
    // Une rangée allumée par pas : les sept degrés, chacun en triade, en septième et en sixte.
    const grille = Array.from({ length: NB_LIGNES_ACCORDS }, (_, r) =>
      Array.from({ length: NB_LIGNES_ACCORDS }, (_, s) => s === r));
    const notes = (gamme: string) => genererNotesSequenceurAccords(grille, "C", gamme, "harmonie", 120, NB_LIGNES_ACCORDS, 0, 1, 3)
      .map((n) => [n.note, n.debut]);
    expect(notes("bebop-dominant")).toEqual(notes("mixolydien"));
  });

  it("le générateur d'accords rend le même fichier, septièmes comprises", () => {
    const fichier = (gamme: string) =>
      genererAccords("C", gamme, "custom", "I-ii-iii-IV-V-vi-VII", 120, 2, 7, "septieme").midiBytes;
    expect(Array.from(fichier("bebop-dominant"))).toEqual(Array.from(fichier("mixolydien")));
  });

  it("la boîte à groove en joue les accords et la basse", () => {
    const config = (gamme: string): ConfigGrooveBox => ({
      cle: "C", gamme, genre: "jazz", progression: "I-iii-V-VII", extension: "idiomatique",
      tempo: 110, dureeAccord: 2, nbAccords: 8, styleRythme: "Pop dance", neurones: 15,
      connectivite: 0.3, memoire: 0.3, spectre: 0.9, octave: 4, densite: 0.7,
      repetition: 0.25, silence: 0.1, graine: 7,
    });
    const accordsEtBasse = (gamme: string) => genererGrooveBox(config(gamme)).notes
      .filter((n) => n.canal === 0 || n.canal === 1).map((n) => [n.canal, n.note, n.debut]);
    expect(accordsEtBasse("bebop-dominant")).toEqual(accordsEtBasse("mixolydien"));
  });

  it("le générateur par script en joue les accords, et sa mélodie garde le si de passage", async () => {
    const script = (gamme: string) => `genre = pop\ncle = C\ngamme = ${gamme}\nduree = 16`;
    const bebop = (await genererDepuisScript(script("bebop-dominant"))).midiBytes;
    const mixo = (await genererDepuisScript(script("mixolydien"))).midiBytes;
    expect(notesDuCanal(bebop, 0)).toEqual(notesDuCanal(mixo, 0));
    expect(notesDuCanal(bebop, 2).some((n) => n % 12 === 11)).toBe(true);
    expect(notesDuCanal(mixo, 2).some((n) => n % 12 === 11)).toBe(false);
  });
});
