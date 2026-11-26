// plugins/tempo-de-l-entree.test.ts — Une transformation de notes garde le tempo de ce qu'elle reçoit.
//
// LE DÉFAUT, relevé le 2026-11-26 en répondant à Fabien, « si ce réglage n'a aucun effet pourquoi
// est-il là ? ». « Harmonie négative » et « Renversements et voicings » lisaient les notes reçues en
// secondes, ce qui laissait tomber le tempo de l'entrée, et réécrivaient le fichier à leur propre
// Tempo, 120 par défaut. Un morceau reçu à 90 BPM ressortait étiqueté à 120 : ses notes tombaient hors
// de la grille des temps, et ce qui grave en aval lisait des valeurs fausses. « Renversements et
// voicings » se contredisait en plus : sa sortie Séquence gardait le tempo reçu, sa sortie MIDI 120.
//
// LA DÉCISION DE FABIEN : le tempo de l'entrée l'emporte, ses changements compris, et le Tempo du nœud
// ne sert que lorsque l'entrée n'en porte pas. C'est déjà la règle de « MusicXML ».
//
// CE QUI EST COMPARÉ : les tempos écrits et les ticks des débuts de note, entrée contre sortie. Les
// deux fichiers ont 480 ticks par noire, et une note qui garde son instant garde donc son tick.
import "node-web-audio-api/polyfill.js";
import { parseMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { lancerFiche, type FicheLancable, type Reglages } from "../audio/lancer-fiche";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import type { Sequence } from "../audio/sequence";
import { fiches } from "./theorie-composition";

const fiche = (id: string): FicheLancable => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f as unknown as FicheLancable;
};

/**
 * Les tempos écrits, en ticks et en microsecondes par noire, et les ticks distincts des débuts de note.
 *
 * LES MICROSECONDES, ET NON DES BPM ARRONDIS : l'écriture les tronque, et un tempo relu puis réécrit
 * pouvait en perdre une sans qu'un arrondi en BPM le montre.
 */
async function lire(f: unknown) {
  expect(f, "la sortie MIDI est vide").toBeInstanceOf(File);
  const m = parseMidi(new Uint8Array(await (f as File).arrayBuffer()));
  const tempos: [number, number][] = [];
  const debuts = new Set<number>();
  for (const piste of m.tracks) {
    let tick = 0;
    for (const e of piste) {
      tick += e.deltaTime;
      if (e.type === "setTempo") tempos.push([tick, e.microsecondsPerBeat]);
      if (e.type === "noteOn" && e.velocity > 0) debuts.add(tick);
    }
  }
  return { tpq: m.header.ticksPerBeat, tempos: tempos.sort((a, b) => a[0] - b[0]), debuts: [...debuts].sort((a, b) => a - b) };
}

/** Quatre accords d'une noire, les deux premiers à 90 BPM, les deux suivants à 60 : un changement de tempo au troisième. */
const ACCORDS = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]];
const INSTANTS = [0, 2 / 3, 4 / 3, 7 / 3];
const notes = () => ACCORDS.flatMap((a, i) => a.map((note) => ({
  note, velocite: 90, debut: INSTANTS[i], fin: INSTANTS[i] + (i < 2 ? 2 / 3 : 1) * 0.9,
})));
const midiRecu = () => notesVersFichierMidi(notes(), 90, 0, undefined, undefined, [{ debut: 0, bpm: 90 }, { debut: 4 / 3, bpm: 60 }]);

const lancer = (id: string, entrees: unknown[], reglages: Reglages = {}) =>
  lancerFiche(fiche(id), reglages, { entrees });

describe("une transformation de notes garde le tempo de ce qu'elle reçoit", () => {
  it("le MIDI reçu porte bien ce qu'on croit : 90 puis 60 BPM, une noire par accord", async () => {
    // L'INSTRUMENT D'ABORD : si l'entrée fabriquée ne portait pas ses deux tempos, les cas suivants
    // compareraient la sortie à une entrée fausse et pourraient passer sans rien prouver.
    expect(await lire(midiRecu())).toEqual({ tpq: 480, tempos: [[0, 666_666], [960, 1_000_000]], debuts: [0, 480, 960, 1440] });
  });

  for (const [id, entrees] of [
    ["harmonie-negative", () => [midiRecu()]],
    ["voicings-accords", () => [midiRecu(), null]],
  ] as const) {
    it(`${id.toUpperCase()} : le MIDI produit garde les tempos et la grille du MIDI reçu`, async () => {
      const recu = await lire(midiRecu());
      const r = await lancer(id, entrees());
      expect(r.levee, `${id} a levé`).toBeNull();
      const produit = await lire(r.valeurs[1]);
      expect(produit.tempos, "le tempo de l'entrée est perdu").toEqual(recu.tempos);
      expect(produit.debuts, "les notes tombent hors de la grille de l'entrée").toEqual(recu.debuts);
    });

    it(`${id.toUpperCase()} : sous un MIDI reçu, le Tempo du nœud ne change pas le fichier`, async () => {
      const a = await lire((await lancer(id, entrees(), { "Tempo": 60 })).valeurs[1]);
      const b = await lire((await lancer(id, entrees(), { "Tempo": 150 })).valeurs[1]);
      expect(b).toEqual(a);
    });
  }

  it("RENVERSEMENTS ET VOICINGS : une séquence reçue à 90 BPM sort à 90 sur ses deux sorties", async () => {
    const sequence: Sequence = { notes: notes().slice(0, 6), tempo: 90 };
    const r = await lancer("voicings-accords", [null, sequence], { "Tempo": 150 });
    expect((await lire(r.valeurs[1])).tempos, "la sortie MIDI ne dit pas le tempo de la séquence").toEqual([[0, 666_666]]);
    expect((r.valeurs[2] as Sequence).tempo, "la sortie Séquence ne dit pas le tempo reçu").toBe(90);
  });

  it("RENVERSEMENTS ET VOICINGS : une séquence sans tempo prend celui du nœud", async () => {
    // LE RÉGLAGE AGIT ENCORE, là où l'entrée ne dit rien : c'est le seul cas où il sert.
    const sequence: Sequence = { notes: notes().slice(0, 6) };
    const a = await lire((await lancer("voicings-accords", [null, sequence], { "Tempo": 100 })).valeurs[1]);
    const b = await lire((await lancer("voicings-accords", [null, sequence], { "Tempo": 150 })).valeurs[1]);
    expect(a.tempos).toEqual([[0, 600_000]]);
    expect(b.tempos).toEqual([[0, 400_000]]);
  });
});
