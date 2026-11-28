// plugins/voix-sur-accord.test.ts — Le nœud « Voix sur l'accord » : branché sur l'harmonie du nœud
// du lot 1 et sur une matrice écrite, il rend dans son fichier ce que SoundHelix a joué.
//
// Le moteur est éprouvé note pour note dans `audio/soundhelix-voix.test.ts`. Ici on vérifie le
// CÂBLAGE de bout en bout : l'harmonie passe par le fichier du nœud « Harmonie par motifs », la
// matrice par son texte, le motif par le réglage ou par l'entrée, et le fichier rendu porte la
// grille, les hauteurs et les vélocités attendues ; chaque réglage agit ; une faute se dit.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { lancerFiche } from "../audio/lancer-fiche";
import { lireReleveSoundHelix } from "../audio/temoins-soundhelix";
import { joueAuTic } from "../audio/soundhelix-activite";
import { velociteMidi } from "../audio/soundhelix-midi";
import { fiches as fichesHarmonie } from "./harmonie-motifs";
import { fiches } from "./voix-sur-accord";

const DOSSIER = join(process.cwd(), "src", "audio", "temoins-soundhelix");
const fiche = fiches.find((f) => f.id === "voix-sur-accord")!;
const ficheHarmonie = fichesHarmonie.find((f) => f.id === "harmonie-motifs")!;
const XML = readFileSync(join(DOSSIER, "essai-accords.xml"), "utf8");
const RELEVE = lireReleveSoundHelix(readFileSync(join(DOSSIER, "accords.txt"), "utf8"));

/** L'harmonie de l'essai d'accords, rendue par le nœud du lot 1. */
async function harmonieDEssai(): Promise<File> {
  const motif = /<chordPattern>([^<]*)<\/chordPattern>/.exec(XML)![1];
  const r = await lancerFiche(ficheHarmonie, { "Motifs d'accords": motif, Mesures: 32, "Tics par temps": "4" }, { entrees: [] });
  return r.valeurs[0] as File;
}

/** Une ligne de matrice réécrite depuis le relevé : un signe par section, lu au milieu de la section. */
function ligneDuReleve(voix: string, nom = voix): string {
  const segments = RELEVE.voix.get(voix)!;
  const signes = RELEVE.sections.map((debut, k) =>
    joueAuTic(segments, Math.floor((debut + (RELEVE.sections[k + 1] ?? RELEVE.tics)) / 2)) ? "x" : ".");
  return `${nom}  ${signes.join("")}`;
}

/** Les notes d'un fichier en [tic, hauteur, vélocité, durée], triées. */
async function notes(v: unknown): Promise<number[][]> {
  const midi = parseMidi(new Uint8Array(await (v as File).arrayBuffer()));
  const out: number[][] = [];
  const ouvertes = new Map<number, number[][]>();
  for (const piste of midi.tracks) {
    let tic = 0;
    for (const e of piste) {
      tic += e.deltaTime;
      if (e.type === "noteOn") {
        const n = [tic, e.noteNumber, e.velocity, 0];
        out.push(n);
        ouvertes.set(e.noteNumber, [...(ouvertes.get(e.noteNumber) ?? []), n]);
      }
      if (e.type === "noteOff") { const n = ouvertes.get(e.noteNumber)?.shift(); if (n) n[3] = tic - n[0]; }
    }
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

const motifDe = (instrument: string) => new RegExp(`<instrument>${instrument}</instrument>[\\s\\S]*?<string>([^<]*)</string>`).exec(XML)![1];

describe("le nœud Voix sur l'accord", () => {
  it("rend, sur l'harmonie du nœud du lot 1 et la matrice relevée, le motif sur l'accord que SoundHelix a joué", async () => {
    const harmonie = await harmonieDEssai();
    const r = await lancerFiche(fiche, { Motif: motifDe("basse"), Voix: "basse", Reprise: "section",
      "Position fondamentale": 0, Transposition: -12 }, { entrees: [harmonie, ligneDuReleve("basse"), null] });
    expect(r.levee).toBeNull();
    expect(r.erreurRendue).toBe(false);
    const ref = RELEVE.sequences.find((s) => s.instrument === "basse")!.entrees.filter((e) => e.hauteur !== null)
      .map((e) => [e.tic, 60 + e.hauteur!, velociteMidi(e.velocite), e.tics]);
    expect(ref.length).toBeGreaterThan(100);
    expect(await notes(r.valeurs[0])).toEqual(ref.sort((a, b) => a[0] - b[0] || a[1] - b[1]));
    expect(r.message).toMatch(/notes · 1 ligne · voix « basse »/);
  });

  it("sans matrice, joue tout le morceau, et « Voix » n'y change rien", async () => {
    const harmonie = await harmonieDEssai();
    const a = await lancerFiche(fiche, { Motif: "0/4", Voix: "a" }, { entrees: [harmonie, null, null] });
    const b = await lancerFiche(fiche, { Motif: "0/4", Voix: "b" }, { entrees: [harmonie, null, null] });
    const na = await notes(a.valeurs[0]);
    expect(na.length).toBe(512 / 4);
    expect(await notes(b.valeurs[0])).toEqual(na);
  });

  it("les voix parallèles rendent l'accord plaqué, et « Libres » lit des demi-tons depuis le do central", async () => {
    const harmonie = await harmonieDEssai();
    const plaque = await notes((await lancerFiche(fiche, { Motif: "0/16", "Voix parallèles": "0,1,2" },
      { entrees: [harmonie, null, null] })).valeurs[0]);
    // Le premier accord de l'essai est la mineur, la-do-mi sous le do central : 57, 60, 64.
    expect(plaque.filter((n) => n[0] === 0).map((n) => n[1])).toEqual([57, 60, 64]);
    const libres = await notes((await lancerFiche(fiche, { Motif: "7/8,-5/8", Hauteurs: "libres" },
      { entrees: [harmonie, null, null] })).valeurs[0]);
    expect(libres.slice(0, 2).map((n) => n[1])).toEqual([67, 55]);
  });

  it("l'entrée « Motif » remplace le réglage, une ligne par motif", async () => {
    const harmonie = await harmonieDEssai();
    const r = await lancerFiche(fiche, { Motif: "0/16" }, { entrees: [harmonie, null, "0/8,-/8\n-/8,2/8"] });
    expect(r.message).toMatch(/2 lignes/);
    const n = await notes(r.valeurs[0]);
    expect(n.slice(0, 2).map((x) => [x[0], x[3]])).toEqual([[0, 8], [8, 8]]);
  });

  it("sur une harmonie à sections, « Position fondamentale » et « Reprise » agissent, ce que le banc ne peut voir", async () => {
    // Le banc de croisement ne reçoit qu'une mélodie, sans section : il déclare ces deux réglages,
    // et ce cas les tient sur l'harmonie de l'essai d'accords.
    const harmonie = await harmonieDEssai();
    const jouer = async (r: Record<string, unknown>) =>
      notes((await lancerFiche(fiche, { Motif: "0/3,1/2,2/5", ...r }, { entrees: [harmonie, null, null] })).valeurs[0]);
    // Le deuxième accord, au tic 16, ré mineur avec la à la basse (la, ré, fa) : 0 lit la, ou ré en
    // position fondamentale.
    const auTic16 = async (r: Record<string, unknown>) => (await jouer({ Motif: "0/4,1/4,2/8", ...r })).find((n) => n[0] === 16)?.[1];
    expect(await auTic16({ "Position fondamentale": 0 })).toBe(57);
    expect(await auTic16({ "Position fondamentale": 1 })).toBe(62);
    const morceau = await jouer({ Reprise: "morceau" });
    const section = await jouer({ Reprise: "section" });
    expect(section).not.toEqual(morceau);
    // Un motif de 10 tics repris à chaque section de 64 : une entrée part au tic 64, ce que le morceau ne fait pas.
    expect(section.some((n) => n[0] === 64)).toBe(true);
    expect(morceau.some((n) => n[0] === 64)).toBe(false);
  });

  it("la vélocité et la transposition s'appliquent à chaque note", async () => {
    const harmonie = await harmonieDEssai();
    const r = await lancerFiche(fiche, { Motif: "0/16:1000", "Vélocité": 50, Transposition: 12 }, { entrees: [harmonie, null, null] });
    const [premiere] = await notes(r.valeurs[0]);
    expect(premiere[1]).toBe(69);
    expect(premiere[2]).toBe(velociteMidi(500));
  });

  it("une faute se dit dans la langue de l'interface", async () => {
    const harmonie = await harmonieDEssai();
    const illisible = await lancerFiche(fiche, { Motif: "0/2,x" }, { entrees: [harmonie, null, null] });
    expect(illisible.erreurRendue).toBe(true);
    expect(illisible.message).toMatch(/entrée illisible/);
    const sansVoix = await lancerFiche(fiche, { Voix: "nappe" }, { entrees: [harmonie, "basse x", null] });
    expect(sansVoix.message).toMatch(/pas de voix « nappe »/);
    const sections = await lancerFiche(fiche, { Voix: "basse" }, { entrees: [harmonie, "basse xx", null] });
    expect(sections.message).toMatch(/2 sections, l'harmonie 8/);
  });
});
