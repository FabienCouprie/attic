// plugins/arpege-nappe.test.ts — « Arpège par durée d'accord » et « Nappe d'accords » : branchés sur
// l'harmonie du nœud du lot 1 et sur la matrice relevée, ils rendent dans leur fichier ce que
// SoundHelix a joué ; chaque réglage agit ; une faute se dit.
//
// Le moteur est éprouvé note pour note dans `audio/soundhelix-accompagnement.test.ts`. Ici on vérifie
// le CÂBLAGE de bout en bout, par le fichier de l'harmonie, le texte de la matrice et le fichier rendu.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { lancerFiche } from "../audio/lancer-fiche";
import { lireReleveSoundHelix } from "../audio/temoins-soundhelix";
import { joueAuTic } from "../audio/soundhelix-activite";
import { velociteMidi } from "../audio/soundhelix-midi";
import { fiches as fichesHarmonie } from "./harmonie-motifs";
import { fiches } from "./arpege-nappe";

const DOSSIER = join(process.cwd(), "src", "audio", "temoins-soundhelix");
const arpege = fiches.find((f) => f.id === "arpege-duree-accord")!;
const nappe = fiches.find((f) => f.id === "nappe-accords")!;
const ficheHarmonie = fichesHarmonie.find((f) => f.id === "harmonie-motifs")!;
const XML = readFileSync(join(DOSSIER, "essai-accords.xml"), "utf8");
const RELEVE = lireReleveSoundHelix(readFileSync(join(DOSSIER, "accords.txt"), "utf8"));

async function harmonieDEssai(): Promise<File> {
  const motif = /<chordPattern>([^<]*)<\/chordPattern>/.exec(XML)![1];
  return (await lancerFiche(ficheHarmonie, { "Motifs d'accords": motif, Mesures: 32, "Tics par temps": "4" }, { entrees: [] })).valeurs[0] as File;
}

function ligneDuReleve(voix: string): string {
  const segments = RELEVE.voix.get(voix)!;
  const signes = RELEVE.sections.map((debut, k) =>
    joueAuTic(segments, Math.floor((debut + (RELEVE.sections[k + 1] ?? RELEVE.tics)) / 2)) ? "x" : ".");
  return `${voix}  ${signes.join("")}`;
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

const attendues = (instrument: string) => RELEVE.sequences.filter((s) => s.instrument === instrument)
  .flatMap((s) => s.entrees.filter((e) => e.hauteur !== null).map((e) => [e.tic, 60 + e.hauteur!, velociteMidi(e.velocite), e.tics]))
  .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

const motifsDe = (instrument: string) => {
  const bloc = [...XML.matchAll(/<track>[\s\S]*?<\/track>/g)].map((m) => m[0]).find((b) => b.includes(`<instrument>${instrument}</instrument>`))!;
  return [...bloc.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]).join("\n");
};

describe("le nœud Arpège par durée d'accord", () => {
  it("rend, sur l'harmonie du lot 1 et la matrice relevée, l'arpège que SoundHelix a joué", async () => {
    const r = await lancerFiche(arpege, { Motif: motifsDe("arpege"), Voix: "arpege", "Position fondamentale": 0, "Couper à la section": 1 },
      { entrees: [await harmonieDEssai(), ligneDuReleve("arpege"), null] });
    expect(r.levee).toBeNull();
    expect(r.erreurRendue).toBe(false);
    const ref = attendues("arpege");
    expect(ref.length).toBeGreaterThan(100);
    expect(await notes(r.valeurs[0])).toEqual(ref);
    expect(r.message).toMatch(/notes · voix « arpege »/);
  });

  it("sur une harmonie à sections, « Position fondamentale » et « Couper à la section » agissent, ce que le banc ne peut voir", async () => {
    // Le deuxième accord de l'essai, au tic 16, est ré mineur avec la à la basse : 0 lit la, ou ré.
    const h = await harmonieDEssai();
    const auTic16 = async (position: number) => (await notes((await lancerFiche(arpege, { Motif: "0/8", "Position fondamentale": position },
      { entrees: [h, null, null] })).valeurs[0])).find((n) => n[0] === 16)?.[1];
    expect(await auTic16(0)).toBe(57);
    expect(await auTic16(1)).toBe(62);
    // Quatre la mineur égaux se fondent en un accord de 64 tics par-dessus quatre sections : sans
    // coupe, il prend le motif de 64 ; coupé, chaque section prend celui de 16.
    const fondu = (await lancerFiche(ficheHarmonie, { "Motifs d'accords": "Am/4,+Am/4,+Am/4,+Am/4", Mesures: 4, "Tics par temps": "4" },
      { entrees: [] })).valeurs[0];
    const jouer = async (couper: number) => (await notes((await lancerFiche(arpege, { Motif: "0/16\n1/64", "Couper à la section": couper,
      "Position fondamentale": 0 }, { entrees: [fondu, null, null] })).valeurs[0])).map((n) => [n[0], n[3]]);
    expect(await jouer(0)).toEqual([[0, 64]]);
    expect(await jouer(1)).toEqual([[0, 16], [16, 16], [32, 16], [48, 16]]);
  });

  it("l'entrée « Motif » remplace le réglage, et un motif illisible se dit", async () => {
    const h = await harmonieDEssai();
    const r = await lancerFiche(arpege, {}, { entrees: [h, null, "0/16"] });
    expect((await notes(r.valeurs[0])).slice(0, 2).map((n) => n[0])).toEqual([0, 16]);
    const faute = await lancerFiche(arpege, { Motif: "0,x" }, { entrees: [h, null, null] });
    expect(faute.erreurRendue).toBe(true);
    expect(faute.message).toMatch(/illisible/);
  });
});

describe("le nœud Nappe d'accords", () => {
  it("rend, sur l'harmonie du lot 1 et la matrice relevée, la nappe tenue que SoundHelix a jouée", async () => {
    const r = await lancerFiche(nappe, { Notes: "0,1,2", Voix: "nappe", "Rejouer chaque accord": 0, "Position fondamentale": 0, "Vélocité": 70 },
      { entrees: [await harmonieDEssai(), ligneDuReleve("nappe")] });
    expect(r.erreurRendue).toBe(false);
    expect(await notes(r.valeurs[0])).toEqual(attendues("nappe"));
    expect(r.message).toMatch(/notes · 3 lignes · voix « nappe »/);
  });

  it("rend la nappe élargie, normalisée et rejouée de l'essai, transposée d'une octave", async () => {
    const r = await lancerFiche(nappe, { Notes: "-1,0,1,2,3", Voix: "nappe_normale", "Rejouer chaque accord": 1,
      "Position fondamentale": 1, "Couper à la section": 1, "Vélocité": 50, Transposition: 12 },
    { entrees: [await harmonieDEssai(), ligneDuReleve("nappe_normale")] });
    // Le relevé porte déjà la transposition de la piste : le fichier lui ajoute seulement le do central.
    expect(await notes(r.valeurs[0])).toEqual(attendues("nappe_normale"));
  });

  it("tenir ou rejouer change le fichier, et des notes illisibles se disent", async () => {
    const h = await harmonieDEssai();
    const tenue = await notes((await lancerFiche(nappe, { "Rejouer chaque accord": 0 }, { entrees: [h, null] })).valeurs[0]);
    const rejouee = await notes((await lancerFiche(nappe, { "Rejouer chaque accord": 1 }, { entrees: [h, null] })).valeurs[0]);
    expect(rejouee.length).toBeGreaterThan(tenue.length);
    const faute = await lancerFiche(nappe, { Notes: "0,a" }, { entrees: [h, null] });
    expect(faute.erreurRendue).toBe(true);
    expect(faute.message).toMatch(/notes illisibles/);
  });
});
