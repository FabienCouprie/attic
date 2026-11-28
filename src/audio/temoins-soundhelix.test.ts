// audio/temoins-soundhelix.test.ts — Les témoins de SoundHelix se lisent, se tiennent entre eux, et
// exercent ce qu'ils doivent exercer.
//
// TROIS CHOSES À PROUVER AVANT DE S'EN SERVIR. Que le relevé se lit sans rien perdre : l'harmonie,
// chaque voix et chaque séquence couvrent le morceau au tic près. Que le relevé et le fichier MIDI
// disent la même chose, ce qui fixe la règle de passage de l'un à l'autre (transposition, vélocité,
// décalage d'un tic) au lieu de la supposer. Et que chaque voix des essais déterministes joue : un
// moteur qui ne rendrait rien dans le témoin y serait comparé à du silence, et passerait.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { TEMOINS } from "../../scripts/temoins-soundhelix.mjs";
import {
  lireEntrees, lireReleveSoundHelix, notesDuFichierTemoin, voixActive, type ReleveSoundHelix,
} from "./temoins-soundhelix";

const DOSSIER = join(process.cwd(), "src", "audio", "temoins-soundhelix");
const lireTexte = (base: string) => readFileSync(join(DOSSIER, `${base}.txt`), "utf8");
const lireMidi = (base: string) => new Uint8Array(readFileSync(join(DOSSIER, `${base}.mid`)));
const releve = (base: string) => lireReleveSoundHelix(lireTexte(base));

/** Les essais où rien ne tire au hasard une fois l'harmonie et la matrice données. */
const DETERMINISTES = ["accords", "registre", "batterie"];

/** La vélocité MIDI que le lecteur de SoundHelix écrit, de 1 à 127, linéaire. */
function velociteMidi(r: ReleveSoundHelix, v: number): number {
  return v === 0 ? 0 : 1 + Math.floor(((v - 1) * 126) / (r.velociteMax - 1));
}

/** La voix qui gouverne une ligne : son instrument, sauf pour la batterie, une voix par ligne. */
function voixDeLigne(base: string, instrument: string, rang: number): string {
  if (base === "batterie" && instrument === "batterie") {
    return ["grosse_caisse", "caisse_claire", "charleston", "charleston", "cymbale"][rang];
  }
  return instrument;
}

describe("la grammaire des entrées", () => {
  it("pose chaque entrée à son tic, liaison, silence et vélocité compris", () => {
    expect(lireEntrees("0/2:500,-/1,-3~/3:1000,12/1:1")).toEqual([
      { tic: 0, tics: 2, hauteur: 0, velocite: 500, lie: false },
      { tic: 2, tics: 1, hauteur: null, velocite: 0, lie: false },
      { tic: 3, tics: 3, hauteur: -3, velocite: 1000, lie: true },
      { tic: 6, tics: 1, hauteur: 12, velocite: 1, lie: false },
    ]);
  });

  it("refuse ce qu'elle ne sait pas lire, plutôt que de le taire", () => {
    expect(() => lireEntrees("0:500/2")).toThrow(/illisible/);
    expect(() => lireReleveSoundHelix("nom=x\nune ligne inconnue")).toThrow(/ligne 2/);
    expect(() => lireReleveSoundHelix("nom=x")).toThrow(/graine/);
  });
});

describe("la lecture d'un fichier MIDI", () => {
  it("tient un départ de vélocité nulle pour un arrêt, et ferme à la fin ce qui reste ouvert", () => {
    // Les témoins de SoundHelix n'écrivent que des `noteOff` (relevé : 1 440 dans `accords.mid`,
    // aucun départ de vélocité nulle). Ce fichier fait exprès porte l'autre écriture de l'arrêt, et
    // une note que rien ne ferme.
    const octets = writeMidi({
      header: { format: 1, numTracks: 1, ticksPerBeat: 4 },
      tracks: [[
        { deltaTime: 0, channel: 2, type: "noteOn", noteNumber: 60, velocity: 90 },
        { deltaTime: 3, channel: 2, type: "noteOn", noteNumber: 60, velocity: 0 },
        { deltaTime: 1, channel: 2, type: "noteOn", noteNumber: 62, velocity: 80 },
        { deltaTime: 2, meta: true, type: "endOfTrack" },
      ]],
    });
    expect(notesDuFichierTemoin(new Uint8Array(octets)).get(3)).toEqual([
      { tic: 0, tics: 3, hauteur: 60, velocite: 90, sansArret: false },
      { tic: 4, tics: 2, hauteur: 62, velocite: 80, sansArret: true },
    ]);
  });
});

describe("les témoins de SoundHelix", () => {
  it("sont tous là, un relevé et un MIDI par témoin", () => {
    expect(TEMOINS.length).toBe(8);
    for (const t of TEMOINS) {
      expect(lireTexte(t.base).length, t.base).toBeGreaterThan(1000);
      expect(lireMidi(t.base).length, t.base).toBeGreaterThan(1000);
    }
  });

  it.each(TEMOINS.map((t) => t.base))("%s : harmonie, voix et séquences couvrent le morceau au tic près", (base) => {
    const r = releve(base);
    expect(r.tics).toBe(r.mesures * r.tempsParMesure * r.ticsParTemps);
    let tic = 0;
    for (const a of r.accords) {
      expect(a.tic, `${base}, accord ${a.nom}`).toBe(tic);
      tic += a.tics;
    }
    expect(tic).toBe(r.tics);
    expect(r.sections[0]).toBe(0);
    r.sections.forEach((s, k) => {
      if (k > 0) expect(s, `${base}, section ${k}`).toBeGreaterThan(r.sections[k - 1]);
      expect(s).toBeLessThan(r.tics);
    });
    expect(r.voix.size).toBeGreaterThan(0);
    for (const [nom, segments] of r.voix) {
      expect(segments.reduce((t, s) => t + Math.abs(s), 0), `${base}, voix ${nom}`).toBe(r.tics);
    }
    for (const s of r.sequences) {
      expect(s.entrees.reduce((t, e) => t + e.tics, 0), `${base}, ${s.instrument} ${s.rang}`).toBe(r.tics);
    }
  });

  it("un accord peut couvrir plusieurs sections : deux accords égaux qui se suivent sont fondus", () => {
    // `Am/16` répété : un seul accord pour douze sections. Un nœud qui prendrait chaque début de
    // section pour un changement d'accord rejouerait la nappe là où SoundHelix la tient.
    const r = releve("batterie");
    expect(r.sections.length).toBe(12);
    expect(r.accords.map((a) => [a.tic, a.tics, a.nom])).toEqual([[0, 768, "Am"]]);
  });

  it.each(DETERMINISTES)("%s : chaque ligne de chaque piste joue au moins une note", (base) => {
    const r = releve(base);
    for (const s of r.sequences) {
      expect(s.entrees.some((e) => e.hauteur !== null), `${base}, ${s.instrument} ${s.rang}`).toBe(true);
    }
  });

  it.each(DETERMINISTES)("%s : une note mélodique ne part que d'un tic où sa voix joue", (base) => {
    const r = releve(base);
    let comptees = 0;
    for (const s of r.sequences) {
      if (s.type !== "MELODIC") continue;
      const segments = r.voix.get(voixDeLigne(base, s.instrument, s.rang));
      expect(segments, `${base}, voix de ${s.instrument}`).toBeDefined();
      for (const e of s.entrees) {
        if (e.hauteur === null) continue;
        expect(voixActive(segments!, e.tic), `${base}, ${s.instrument} au tic ${e.tic}`).toBe(true);
        comptees++;
      }
    }
    expect(comptees).toBeGreaterThan(100);
  });

  it.each(TEMOINS.map((t) => t.base))("%s : le MIDI est le relevé transposé, décalé d'un tic", (base) => {
    // LA RÈGLE DE PASSAGE, relevée et non supposée : départ au tic du relevé plus un ; hauteur plus
    // la transposition du lecteur, sauf la batterie ; vélocité ramenée linéairement sur 1 à 127 ; et
    // l'arrêt absent du fichier pour toute note qui finit avec le morceau, son arrêt tombant un tic
    // après le dernier que le lecteur écrit.
    const r = releve(base);
    const fichier = notesDuFichierTemoin(lireMidi(base));
    type Attendue = { tic: number; tics: number; hauteur: number; velocite: number; sansArret: boolean };
    const parCanal = new Map<number, Attendue[]>();
    for (const s of r.sequences) {
      const liste = parCanal.get(s.canal) ?? [];
      for (const e of s.entrees) {
        if (e.hauteur === null) continue;
        liste.push({
          tic: e.tic + 1,
          tics: e.tics,
          hauteur: e.hauteur + (s.type === "MELODIC" ? r.transposition : 0),
          velocite: velociteMidi(r, e.velocite),
          sansArret: e.tic + e.tics >= r.tics,
        });
      }
      parCanal.set(s.canal, liste);
    }
    expect([...fichier.keys()].sort((a, b) => a - b)).toEqual([...parCanal.keys()].sort((a, b) => a - b));
    for (const [canal, attendues] of parCanal) {
      attendues.sort((a, b) => a.tic - b.tic || a.hauteur - b.hauteur);
      const lues = fichier.get(canal)!.map((n) => ({ ...n, tics: n.sansArret ? 0 : n.tics }));
      expect(lues, `${base}, canal ${canal}`).toEqual(attendues.map((a) => ({ ...a, tics: a.sansArret ? 0 : a.tics })));
    }
  });
});
