// audio/soundhelix-accompagnement.test.ts — L'arpège et la nappe égalent ceux de SoundHelix, note pour
// note.
//
// NIVEAU 1, À ENTRÉES ÉGALES. Pour chaque arpège et chaque nappe des essais déterministes, les motifs
// et les options sont lus dans l'XML d'essai, l'harmonie calculée puis écrite et relue en MIDI,
// l'activité prise telle que le programme l'a tirée. Chaque ligne rendue doit égaler, note pour note,
// la séquence que le programme a calculée.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lireMotif } from "./soundhelix-motifs";
import { VELOCITE_MAX } from "./soundhelix-midi";
import { champ, harmonieDeLEssai, pisteDeLEssai } from "./soundhelix-essais";
import { appliquerPiste } from "./soundhelix-voix";
import { etenduesDAccord, motifPourDuree, rendreArpege, rendreNappe } from "./soundhelix-accompagnement";
import { lireReleveSoundHelix } from "./temoins-soundhelix";

const DOSSIER = join(process.cwd(), "src", "audio", "temoins-soundhelix");
const lire = (nom: string) => readFileSync(join(DOSSIER, nom), "utf8");

const ESSAIS: [string, string, string[]][] = [
  ["essai-accords.xml", "accords", ["arpege", "nappe", "nappe_normale"]],
  ["essai-registre.xml", "registre", ["arpege_fondamental", "nappe_rejouee"]],
];

const vrai = (xml: string, balise: string, defaut: boolean) => (champ(xml, balise) ?? String(defaut)) === "true";

describe("l'arpège et la nappe, à entrées égales avec SoundHelix", () => {
  for (const [nomXml, temoin, instruments] of ESSAIS) {
    const xml = lire(nomXml);
    const releve = lireReleveSoundHelix(lire(`${temoin}.txt`));
    const h = harmonieDeLEssai(xml);
    it.each(instruments)(`${nomXml} : « %s » égale le programme, note pour note`, (instrument) => {
      const p = pisteDeLEssai(xml, instrument);
      const segments = releve.voix.get(p.voix)!;
      const commun = { harmonie: h, segments, couperALaSection: vrai(p.moteurXml, "obeyChordSections", false) };
      let lignes;
      if (p.moteur === "ArpeggioSequenceEngine") {
        const motifs = p.chaines.map((c) => lireMotif(c.texte, { velociteMax: VELOCITE_MAX, ticsParTemps: h.ticsParTemps,
          ...(c.ticsParTemps ? { ticsParTempsMotif: c.ticsParTemps } : {}) }));
        lignes = [rendreArpege({ ...commun, motifs, normaliser: vrai(p.moteurXml, "normalizeChords", true) })];
      } else {
        lignes = rendreNappe({ ...commun, decalages: (champ(p.moteurXml, "offsets") ?? "0,1,2").split(",").map(Number),
          normaliser: vrai(p.moteurXml, "normalizeChords", false), rejouer: vrai(p.moteurXml, "retriggerPitches", true),
          velocite: Number(champ(p.moteurXml, "velocity") ?? VELOCITE_MAX) });
      }
      const rendues = lignes.map((l) => appliquerPiste(l, p.transposition, p.velocite, VELOCITE_MAX));
      const attendues = releve.sequences.filter((s) => s.instrument === instrument);
      expect(rendues.length).toBe(attendues.length);
      rendues.forEach((ligne, rang) => {
        const notes = ligne.filter((e) => e.hauteur !== null).map((e) => [e.tic, e.tics, e.hauteur, e.velocite, e.lie]);
        const ref = attendues[rang].entrees.filter((e) => e.hauteur !== null).map((e) => [e.tic, e.tics, e.hauteur, e.velocite, e.lie]);
        expect(ref.length, `${instrument} ${rang} : le témoin joue`).toBeGreaterThan(0);
        expect(notes, `${instrument}, ligne ${rang}`).toEqual(ref);
      });
    });
  }
});

describe("le choix du motif d'arpège", () => {
  const m = (t: string) => lireMotif(t, { velociteMax: 1000, ticsParTemps: 4 });
  const motifs = [m("0,1,2,1"), m("0,1,2,3,4,3,2,1"), m("0/2,1/2,2/2,1/2,0/8")];
  it.each([[3, 4], [4, 4], [5, 8], [8, 8], [9, 16], [16, 16], [40, 16]])("un accord de %i tics prend le motif de %i", (tics, attendu) => {
    expect(motifPourDuree(motifs, tics).reduce((t, e) => t + e.tics, 0)).toBe(attendu);
  });
});

describe("les étendues d'accord", () => {
  it("un accord qui court par-dessus une section se coupe à la section quand on le demande", () => {
    const h = harmonieDeLEssai(lire("essai-batterie.xml"));
    expect(etenduesDAccord(h, false, false).length).toBe(h.accords.length);
    expect(etenduesDAccord(h, false, true).length).toBeGreaterThan(h.accords.length);
  });

  it("une nappe tenue se rejoue au début de chaque section quand on coupe à la section, même sur le même accord", () => {
    // L'essai de batterie n'a qu'un accord, fondu sur ses douze sections : aucun témoin ne pose de
    // nappe tenue dessus, et ce cas tient la rupture que « Couper à la section » y fait.
    const h = harmonieDeLEssai(lire("essai-batterie.xml"));
    const nappe = (couper: boolean) => rendreNappe({ harmonie: h, decalages: [0, 1, 2], segments: null, normaliser: false,
      couperALaSection: couper, rejouer: false, velocite: 700 })[0].filter((e) => e.hauteur !== null);
    expect(nappe(false).map((e) => [e.tic, e.tics])).toEqual([[0, h.tics]]);
    expect(nappe(true).map((e) => e.tic)).toEqual(h.sections);
  });
});
