// audio/soundhelix-voix.test.ts — Les voix égalent celles de SoundHelix, note pour note.
//
// NIVEAU 1, À ENTRÉES ÉGALES. Pour chaque piste des essais déterministes que ce moteur reprend (motif
// sur l'accord, motifs superposés, accords plaqués, motifs libres), le motif est lu dans l'XML
// d'essai, l'harmonie calculée par `audio/soundhelix-harmonie.ts` puis ÉCRITE ET RELUE en MIDI, et
// l'activité prise telle que le programme l'a tirée, ses segments en tics. Chaque ligne rendue doit
// égaler, note pour note, la séquence que le programme a calculée : tic, durée, hauteur, vélocité et
// liaison.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lireMotif } from "./soundhelix-motifs";
import { VELOCITE_MAX } from "./soundhelix-midi";
import { champ, harmonieDeLEssai, pisteDeLEssai } from "./soundhelix-essais";
import { type Reprise, appliquerPiste, noteDePassage, rendreLigne } from "./soundhelix-voix";
import { lireReleveSoundHelix } from "./temoins-soundhelix";

const DOSSIER = join(process.cwd(), "src", "audio", "temoins-soundhelix");
const lire = (nom: string) => readFileSync(join(DOSSIER, nom), "utf8");

const REPRISES: Record<string, Reprise> = { song: "morceau", chordSection: "section", chord: "accord" };

const ESSAIS: [string, string, string[]][] = [
  ["essai-accords.xml", "accords", ["plaque", "basse", "accomp", "libre", "libre_multi"]],
  ["essai-registre.xml", "registre", ["motif_fondamental", "motif_morceau", "plaque_large"]],
  ["essai-batterie.xml", "batterie", ["basse"]],
];

describe("les voix, à entrées égales avec SoundHelix", () => {
  for (const [nomXml, temoin, instruments] of ESSAIS) {
    const xml = lire(nomXml);
    const releve = lireReleveSoundHelix(lire(`${temoin}.txt`));
    const h = harmonieDeLEssai(xml);
    it.each(instruments)(`${nomXml} : « %s » égale le programme, note pour note`, (instrument) => {
      const p = pisteDeLEssai(xml, instrument);
      const plaque = p.moteur === "ChordSequenceEngine";
      const libres = p.moteur.startsWith("Free");
      const paralleles = plaque ? (champ(p.moteurXml, "offsets") ?? "0,1,2").split(",").map(Number) : [0];
      // Le moteur des accords plaqués ne reprend son motif qu'à la fin du morceau.
      const reprise = plaque ? "morceau" : REPRISES[champ(p.moteurXml, "patternRestartMode") ?? "song"];
      const normaliser = (champ(p.moteurXml, "normalizeChords") ?? "true") === "true";
      const lignes = p.chaines.flatMap((c) => paralleles.map((parallele) => {
        const motif = lireMotif(c.texte, { jokers: libres ? "" : "+", velociteMax: VELOCITE_MAX, ticsParTemps: h.ticsParTemps,
          ...(c.ticsParTemps ? { ticsParTempsMotif: c.ticsParTemps } : {}) });
        return appliquerPiste(rendreLigne({ harmonie: h, motif, segments: releve.voix.get(p.voix)!, libres, normaliser, reprise, parallele }),
          p.transposition, p.velocite, VELOCITE_MAX);
      }));
      const attendues = releve.sequences.filter((s) => s.instrument === instrument);
      expect(lignes.length).toBe(attendues.length);
      lignes.forEach((ligne, rang) => {
        const notes = ligne.filter((e) => e.hauteur !== null).map((e) => [e.tic, e.tics, e.hauteur, e.velocite, e.lie]);
        const ref = attendues[rang].entrees.filter((e) => e.hauteur !== null).map((e) => [e.tic, e.tics, e.hauteur, e.velocite, e.lie]);
        expect(ref.length, `${instrument} ${rang} : le témoin joue`).toBeGreaterThan(0);
        expect(notes, `${instrument}, ligne ${rang}`).toEqual(ref);
      });
    });
  }
});

describe("la vélocité de la piste", () => {
  it("se compte par défaut, et ne descend jamais sous 1", () => {
    // Aucun témoin du banc ne tombe entre deux entiers : 700 × 500 / 1000 vaut 350 tout rond. Ce cas
    // tient la troncature et le plancher, que SoundHelix applique.
    const ligne = [{ tic: 0, tics: 1, hauteur: 0, velocite: 333, lie: false }, { tic: 1, tics: 1, hauteur: 0, velocite: 1, lie: false }];
    expect(appliquerPiste(ligne, 0, 500, VELOCITE_MAX).map((e) => e.velocite)).toEqual([166, 1]);
    expect(appliquerPiste(ligne, 0, VELOCITE_MAX, VELOCITE_MAX).map((e) => e.velocite)).toEqual([333, 1]);
  });
});

describe("la note de passage", () => {
  it.each([
    [[0, 4, 7], [5, 9, 12], 2], [[5, 9, 12], [0, 4, 7], 4], [[0, 4, 7], [2, 5, 9], 1],
    [[0, 4, 7], [1, 5, 8], 0], [[0, 4, 7], [0, 3, 7], 0], [[4, 7, 11], [7, 11, 14], 5], [[0, 4, 7], null, 0],
  ] as const)("de %j vers %j : %i", (a, b, attendu) => {
    expect(noteDePassage(a, b)).toBe(attendu);
  });
});
