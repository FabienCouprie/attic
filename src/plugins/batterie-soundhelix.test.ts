// plugins/batterie-soundhelix.test.ts — « Batterie à motifs », « Motif conditionnel » et « Groove » :
// l'essai de batterie rejoué de bout en bout par les fichiers, égal au programme note pour note.
//
// Le calcul est éprouvé dans `audio/soundhelix-batterie.test.ts`. Ici on vérifie le CÂBLAGE : la
// batterie posée sur le fichier du nœud du lot 1 et la matrice relevée, puis les quatre motifs
// conditionnels de l'essai, chacun un nœud, enchaînés dans l'ordre de l'XML ; le fichier final doit
// porter, percussion par percussion, les notes du relevé. Puis le groove, et les fautes.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMidi, writeMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { lancerFiche } from "../audio/lancer-fiche";
import { lireReleveSoundHelix } from "../audio/temoins-soundhelix";
import { joueAuTic } from "../audio/soundhelix-activite";
import { velociteMidi } from "../audio/soundhelix-midi";
import { millieme } from "../audio/soundhelix-batterie-midi";
import { champ } from "../audio/soundhelix-essais";
import { motifEnCrescendo } from "../audio/soundhelix-generateurs";
import { fiches as fichesHarmonie } from "./harmonie-motifs";
import { fiches } from "./batterie-soundhelix";

const DOSSIER = join(process.cwd(), "src", "audio", "temoins-soundhelix");
const XML = readFileSync(join(DOSSIER, "essai-batterie.xml"), "utf8");
const RELEVE = lireReleveSoundHelix(readFileSync(join(DOSSIER, "batterie.txt"), "utf8"));
const batterie = fiches.find((f) => f.id === "batterie-motifs")!;
const conditionnel = fiches.find((f) => f.id === "motif-conditionnel")!;
const groove = fiches.find((f) => f.id === "groove-midi")!;
const ficheHarmonie = fichesHarmonie.find((f) => f.id === "harmonie-motifs")!;

const MATRICE = [...RELEVE.voix.entries()].map(([nom, segments]) => `${nom}  ${RELEVE.sections.map((d, k) =>
  joueAuTic(segments, Math.floor((d + (RELEVE.sections[k + 1] ?? RELEVE.tics)) / 2)) ? "x" : ".").join("")}`).join("\n");

const moteur = /<sequenceEngine class="DrumSequenceEngine">[\s\S]*?<\/sequenceEngine>/.exec(XML)![0];
const piste = /<instrument>batterie<\/instrument>[\s\S]*?<\/track>/.exec(XML)![0];
const PATTERNS = [...moteur.matchAll(/<pattern>\s*<pitch>(\d+)<\/pitch>[\s\S]*?<string>([^<]*)<\/string>[\s\S]*?<\/pattern>/g)].map((m) => [m[1], m[2]]);
const VOIX = [...piste.matchAll(/<activityVector>([^<]+)<\/activityVector>/g)].map((m) => m[1]);

/** Les notes d'un fichier, par hauteur : [tic, durée, vélocité MIDI]. */
async function notesParHauteur(v: unknown): Promise<Map<number, number[][]>> {
  const midi = parseMidi(new Uint8Array(await (v as File).arrayBuffer()));
  const out = new Map<number, number[][]>();
  const ouvertes = new Map<number, number[]>();
  let tic = 0;
  for (const e of midi.tracks[0]) {
    tic += e.deltaTime;
    if (e.type === "noteOn") { const n = [tic, 0, e.velocity]; out.set(e.noteNumber, [...(out.get(e.noteNumber) ?? []), n]); ouvertes.set(e.noteNumber, n); }
    if (e.type === "noteOff") { const n = ouvertes.get(e.noteNumber); if (n) n[1] = tic - n[0]; }
  }
  return out;
}

describe("la batterie et ses motifs conditionnels, rejoués par les fichiers", () => {
  it("égalent le programme note pour note, percussion par percussion", async () => {
    const h = (await lancerFiche(ficheHarmonie, { "Motifs d'accords": "Am/16", Mesures: 48, "Tics par temps": "4" }, { entrees: [] })).valeurs[0];
    const lignes = PATTERNS.map(([p, m], i) => `${p}  ${VOIX[i]}  ${m}`).join("\n");
    let fichier = (await lancerFiche(batterie, { Lignes: lignes }, { entrees: [h, MATRICE, null, null, null, null] })).valeurs[0];
    const messages: string[] = [];
    for (const [, b] of moteur.matchAll(/<conditionalPattern>([\s\S]*?)<\/conditionalPattern>/g)) {
      const motif = b.includes("CrescendoPatternEngine")
        ? motifEnCrescendo({ tics: Number(champ(b, "patternTicks")), velocite: { min: Number(champ(b, "minVelocity")), max: Number(champ(b, "maxVelocity")) },
          exposant: Number(champ(b, "velocityExponent")), prefixe: champ(b, "prefixPattern") ?? "", motif: champ(b, "pattern")!, suffixe: champ(b, "suffixPattern") ?? "" })
        : champ(b, "string")!;
      const r = await lancerFiche(conditionnel, {
        Motif: motif, "Percussions visées": champ(b, "target")!.split(",").map((k) => PATTERNS[Number(k)][0]).join(","),
        Avant: champ(b, "precondition") ?? "", "Après": champ(b, "postcondition") ?? "", Mode: champ(b, "mode") === "replace" ? "remplacer" : "ajouter",
        "Probabilité": Number(champ(b, "probability")),
      }, { entrees: [fichier, h, MATRICE, null] });
      expect(r.erreurRendue, r.message).toBe(false);
      messages.push(r.message);
      fichier = r.valeurs[0];
    }
    expect(messages.map((m) => /écrit à (\d+)/.exec(m)?.[1])).toEqual(["2", "4", "2", "2"]);
    const rendues = await notesParHauteur(fichier);
    PATTERNS.forEach(([p], rang) => {
      const ref = RELEVE.sequences.filter((s) => s.instrument === "batterie")[rang].entrees
        .filter((e) => e.hauteur !== null).map((e) => [e.tic, e.tics, velociteMidi(e.velocite)]);
      expect(rendues.get(Number(p)), `percussion ${p}`).toEqual(ref);
    });
  });
});

describe("le groove", () => {
  it("déplace les notes d'un pas sur deux, et garde les pistes, les canaux et les tempos", async () => {
    const pistes = [
      [{ deltaTime: 0, meta: true as const, type: "setTempo" as const, microsecondsPerBeat: 500_000 }, { deltaTime: 0, meta: true as const, type: "endOfTrack" as const }],
      [0, 1, 2, 3].flatMap((k) => [
        { deltaTime: k === 0 ? 0 : 60, type: "noteOn" as const, channel: 3, noteNumber: 60 + k, velocity: 90 },
        { deltaTime: 60, type: "noteOff" as const, channel: 3, noteNumber: 60 + k, velocity: 0 },
      ]).concat([{ deltaTime: 0, meta: true as const, type: "endOfTrack" as const } as never]),
    ];
    const octets = new Uint8Array(writeMidi({ header: { format: 1, numTracks: 2, ticksPerBeat: 480 }, tracks: pistes as never }));
    const r = await lancerFiche(groove, { Groove: "110,90", "Tics par temps": "4" }, { entrees: [new File([octets], "a.mid")] });
    const midi = parseMidi(new Uint8Array(await (r.valeurs[0] as File).arrayBuffer()));
    expect(midi.tracks.length).toBe(2);
    let tic = 0;
    const departs = midi.tracks[1].flatMap((e) => { tic += e.deltaTime; return e.type === "noteOn" ? [[tic, e.channel]] : []; });
    // Pas de 120 tics : la double croche de départ en 0, 120, 240, 360 tombe en 0, 132, 240, 372.
    expect(departs).toEqual([[0, 3], [132, 3], [240, 3], [372, 3]]);
    expect(r.message).toBe("2 notes déplacées · groove 110, 90");
  });

  it("monte la résolution d'un fichier à la grille du chantier, où un dixième de pas s'arrondirait à zéro", async () => {
    const piste = [0, 1, 2, 3].flatMap((k) => [
      { deltaTime: k === 0 ? 0 : 0, type: "noteOn" as const, channel: 0, noteNumber: 60 + k, velocity: 90 },
      { deltaTime: 1, type: "noteOff" as const, channel: 0, noteNumber: 60 + k, velocity: 0 },
    ]);
    const octets = new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 4 },
      tracks: [[...piste, { deltaTime: 0, meta: true, type: "endOfTrack" }]] as never }));
    const r = await lancerFiche(groove, { Groove: "110,90", "Tics par temps": "4" }, { entrees: [new File([octets], "c.mid")] });
    const midi = parseMidi(new Uint8Array(await (r.valeurs[0] as File).arrayBuffer()));
    expect(midi.header.ticksPerBeat).toBe(480);
    let tic = 0;
    expect(midi.tracks[0].flatMap((e) => { tic += e.deltaTime; return e.type === "noteOn" ? [tic] : []; })).toEqual([0, 132, 240, 372]);
  });

  it("dit un groove illisible", async () => {
    const r = await lancerFiche(groove, { Groove: "110,x" }, { entrees: [new File([new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [[{ deltaTime: 0, meta: true, type: "endOfTrack" }]] }))], "b.mid")] });
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toMatch(/groove illisible/);
  });
});

describe("les vélocités aller et retour", () => {
  it("chaque vélocité MIDI de 1 à 127 se retrouve après son passage en millièmes", () => {
    for (let v = 1; v <= 127; v++) expect(velociteMidi(millieme(v))).toBe(v);
  });
});

describe("les fautes", () => {
  it("une ligne illisible, une voix absente, des percussions illisibles", async () => {
    const h = (await lancerFiche(ficheHarmonie, { "Motifs d'accords": "Am/4", Mesures: 4 }, { entrees: [] })).valeurs[0];
    const ligne = await lancerFiche(batterie, { Lignes: "36 0,-,-,-" }, { entrees: [h, null, null, null, null, null] });
    expect(ligne.message).toMatch(/ligne de batterie illisible/);
    const voix = await lancerFiche(batterie, { Lignes: "36 kick 0,-" }, { entrees: [h, "snare xxxx", null, null, null, null] });
    expect(voix.message).toMatch(/pas de voix « kick »/);
    const fichier = (await lancerFiche(batterie, {}, { entrees: [h, null, null, null, null, null] })).valeurs[0];
    const cibles = await lancerFiche(conditionnel, { "Percussions visées": "a" }, { entrees: [fichier, h, "v1 xxxx", null] });
    expect(cibles.message).toMatch(/percussions visées illisibles/);
  });
});
