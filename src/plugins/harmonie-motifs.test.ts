// plugins/harmonie-motifs.test.ts — Le nœud « Harmonie par motifs » : son fichier, son texte, ses
// réglages, son aveu dans les deux langues.
//
// Le calcul est éprouvé contre SoundHelix dans `audio/soundhelix-harmonie.test.ts`. Ici on vérifie
// le CÂBLAGE : que le fichier rendu porte ce que l'harmonie a calculé, la résolution du morceau, un
// marqueur par section et la fin au bon tic ; que chaque réglage agit ; et qu'une faute se dit.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { empreinteValeurs, lancerFiche } from "../audio/lancer-fiche";
import { lireReleveSoundHelix } from "../audio/temoins-soundhelix";
import { fiches } from "./harmonie-motifs";

const fiche = fiches.find((f) => f.id === "harmonie-motifs")!;
const MOTIF_ACCORDS = /<chordPattern>([^<]*)<\/chordPattern>/.exec(
  readFileSync(join(process.cwd(), "src", "audio", "temoins-soundhelix", "essai-accords.xml"), "utf8"))![1];

const lu = async (v: unknown) => parseMidi(new Uint8Array(await (v as File).arrayBuffer()));

/** Les notes d'un fichier à une piste, en tics, sans les arrêts. */
async function notesEnTics(v: unknown) {
  const midi = await lu(v);
  let tic = 0;
  const notes: [number, number][] = [];
  for (const e of midi.tracks[0]) {
    tic += e.deltaTime;
    if (e.type === "noteOn") notes.push([tic, e.noteNumber]);
  }
  return notes;
}

async function avecLangue<T>(langue: string, f: () => Promise<T>): Promise<T> {
  const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} },
    configurable: true, writable: true,
  });
  try { return await f(); } finally {
    if (avant) Object.defineProperty(globalThis, "localStorage", avant);
    else delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
}

describe("le nœud Harmonie par motifs", () => {
  it("rend, au motif de l'essai d'accords, les accords que SoundHelix a relevés, décalés du do central", async () => {
    const r = await lancerFiche(fiche, { "Motifs d'accords": MOTIF_ACCORDS, Mesures: 32, "Tics par temps": "4",
      Registre: 3, "Renversement au plus proche": 1 }, { entrees: [] });
    expect(r.levee).toBeNull();
    const releve = lireReleveSoundHelix(readFileSync(join(process.cwd(), "src", "audio", "temoins-soundhelix", "accords.txt"), "utf8"));
    const attendues = releve.accords.flatMap((a) => a.hauteurs.map((p) => [a.tic, 60 + p] as [number, number]));
    const lues = await notesEnTics(r.valeurs[0]);
    const tri = (l: [number, number][]) => [...l].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(tri(lues)).toEqual(tri(attendues));
  });

  it("écrit la grille du morceau en résolution, un marqueur par section, et finit avec le morceau", async () => {
    const r = await lancerFiche(fiche, { "Motifs d'accords": "Am/4,+F/2,G/2", Mesures: 6, "Temps par mesure": 3,
      "Tics par temps": "12", Tempo: 90 }, { entrees: [] });
    const midi = await lu(r.valeurs[0]);
    expect(midi.header.ticksPerBeat).toBe(12);
    let tic = 0;
    const meta: string[] = [];
    for (const e of midi.tracks[0]) {
      tic += e.deltaTime;
      if (e.type === "marker") meta.push(`${tic}:${e.text}`);
      if (e.type === "setTempo") meta.push(`tempo ${Math.round(60_000_000 / e.microsecondsPerBeat)}`);
      if (e.type === "timeSignature") meta.push(`mesure ${e.numerator}/${e.denominator}`);
      if (e.type === "endOfTrack") meta.push(`fin ${tic}`);
    }
    // 6 mesures de 3 temps à 12 tics : 216 tics ; les sections tombent aux tics 0, 48, 96, 144, 192.
    expect(meta).toEqual(["tempo 90", "mesure 3/4", "0:section", "48:section", "96:section", "144:section",
      "192:section", "fin 216"]);
  });

  it("dit les accords en symboles usuels, une ligne par section", async () => {
    // Un seul cycle du motif en quatre mesures : deux sections. Le septième de SoundHelix n'a pas de
    // quinte, et son symbole le dit.
    const r = await lancerFiche(fiche, { "Motifs d'accords": "Am/4,F4/4,+E7/4,C/4", Mesures: 4,
      "Renversement au plus proche": 0 }, { entrees: [] });
    expect(r.valeurs[1]).toBe(["Am F/A", "E7no5 C"].join("\n"));
  });

  it("chaque réglage change ce que le nœud rend", async () => {
    // Un seul motif, qui tire dans les trois tables : sans quoi les tables et la graine n'auraient,
    // légitimement, rien à faire.
    const base = { "Motifs d'accords": "0/2,1/2,1!0/1.5,2/2.5", "Tables d'accords": "Dm\nC,F,G\nE,E7",
      Mesures: 8, "Temps par mesure": 4, "Tics par temps": "4", Tempo: 120, Registre: 3,
      "Renversement au plus proche": 1, Graine: 11, Instrument: 0 };
    const empreinte = async (reglages: Record<string, string | number>) =>
      empreinteValeurs((await lancerFiche(fiche, reglages, { entrees: [] })).valeurs);
    const reference = await empreinte(base);
    const variantes: Record<string, string | number> = {
      "Motifs d'accords": "Am/4,C/4", "Tables d'accords": "Am\nG,C,F\nE7,E", Mesures: 12, "Temps par mesure": 3,
      // Le premier accord, ré mineur, donne le renversement de tous les autres : le registre 0 le
      // descend d'une octave, quand 4 à 11 le placeraient comme 3.
      "Tics par temps": "3", Tempo: 96, Registre: 0, "Renversement au plus proche": 0, Graine: 12, Instrument: 48,
    };
    for (const p of fiche.parametres) {
      expect(variantes[p.nom], `variante de « ${p.nom} »`).toBeDefined();
      expect(await empreinte({ ...base, [p.nom]: variantes[p.nom] }), p.nom).not.toBe(reference);
    }
  });

  it("dit ce qu'il n'a pas su lire, dans les deux langues", async () => {
    const reglages = { "Motifs d'accords": "Am/4,Cmaj7/4" };
    const fr = await avecLangue("fr", () => lancerFiche(fiche, reglages, { entrees: [] }));
    const en = await avecLangue("en", () => lancerFiche(fiche, reglages, { entrees: [] }));
    expect(fr.erreurRendue).toBe(true);
    expect(fr.message).toBe("accord inconnu : « Cmaj7 »");
    expect(en.message).toBe("unknown chord: « Cmaj7 »");
    expect(fr.valeurs).toEqual([null, null]);
  });

  it("donne le motif tiré, les sections, les mesures, la première section et la graine", async () => {
    const fr = await avecLangue("fr", () => lancerFiche(fiche, { "Motifs d'accords": "Am/4,F/4", Mesures: 8, Graine: 7 },
      { entrees: [] }));
    const en = await avecLangue("en", () => lancerFiche(fiche, { "Motifs d'accords": "Am/4,F/4", Mesures: 8, Graine: 7 },
      { entrees: [] }));
    // Sans « + », chaque retour du premier élément ouvre une section : quatre en huit mesures.
    expect(fr.message).toBe("motif 1 sur 1 · 4 sections · 8 mesures · Am F/A · graine 7");
    expect(en.message).toBe("pattern 1 of 1 · 4 sections · 8 bars · Am F/A · seed 7");
  });
});
