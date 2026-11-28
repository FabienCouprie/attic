// audio/soundhelix-harmonie.test.ts — L'harmonie égale celle de SoundHelix, accord par accord.
//
// NIVEAU 1, À ENTRÉES ÉGALES. Les trois essais déterministes du banc ne tirent rien dans leur
// harmonie : un seul motif, sans table. Lu dans leur XML, ce motif doit rendre, tic pour tic, les
// accords et les trois hauteurs que le programme a relevés, renversement au plus proche compris, et
// les mêmes débuts de section.
//
// NIVEAU 2, PAR LA LOI. Les tables au hasard ne se comparent pas note pour note, le hasard d'Attic
// n'étant pas celui de SoundHelix : on y vérifie, sur deux cents graines, ce que le tirage garantit.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { creerAleatoire } from "../core/hasard";
import { egauxNormalises, lireAccordSH } from "./soundhelix-accords";
import { calculerHarmonie, tirerMotifAccords } from "./soundhelix-harmonie";
import { lireReleveSoundHelix } from "./temoins-soundhelix";

const DOSSIER = join(process.cwd(), "src", "audio", "temoins-soundhelix");

/** Ce qu'un XML d'essai dit de l'harmonie, lu à la regex : ces XML sont les nôtres. */
function harmonieDuXml(nom: string) {
  const xml = readFileSync(join(DOSSIER, nom), "utf8");
  const champ = (balise: string) => new RegExp(`<${balise}>([^<]*)</${balise}>`).exec(xml)?.[1];
  const motifs = [...xml.matchAll(/<chordPattern[^>]*>([^<]*)<\/chordPattern>/g)].map((m) => m[1]);
  const tables = [...xml.matchAll(/<chordRandomTable>([^<]*)<\/chordRandomTable>/g)].map((m) => m[1].split(","));
  const ticsParTemps = Number(champ("ticksPerBeat"));
  return {
    motifs, tables, ticsParTemps,
    tics: Number(champ("bars")) * Number(champ("beatsPerBar")) * ticsParTemps,
    registre: Number(champ("crossoverPitch") ?? 3),
    rapprocher: (champ("minimizeChordDistance") ?? "true") === "true",
  };
}

describe("l'harmonie, à entrées égales avec SoundHelix", () => {
  it.each([
    ["essai-accords.xml", "accords"],
    ["essai-registre.xml", "registre"],
    ["essai-batterie.xml", "batterie"],
  ])("%s rend les accords relevés, tic pour tic", (xml, temoin) => {
    const h = harmonieDuXml(xml);
    expect(h.motifs.length).toBe(1);
    const harmonie = calculerHarmonie({ motif: h.motifs[0], ticsParTemps: h.ticsParTemps, tics: h.tics,
      registre: h.registre, rapprocher: h.rapprocher });
    const releve = lireReleveSoundHelix(readFileSync(join(DOSSIER, `${temoin}.txt`), "utf8"));
    expect(harmonie.tics).toBe(releve.tics);
    expect(harmonie.accords.map((a) => [a.tic, a.tics, [...a.hauteurs]]))
      .toEqual(releve.accords.map((a) => [a.tic, a.tics, [...a.hauteurs]]));
    expect(harmonie.sections).toEqual(releve.sections);
  });

  it("le rapprochement retiré, les accords gardent leur renversement nommé", () => {
    // Le témoin de l'essai d'accords a été rendu avec le rapprochement : sans lui, `E7` garde sa
    // position fondamentale, au registre 3, mi en dessous du do central.
    const h = harmonieDuXml("essai-accords.xml");
    const avec = calculerHarmonie({ motif: h.motifs[0], ticsParTemps: 4, tics: h.tics, registre: 3, rapprocher: true });
    const sans = calculerHarmonie({ motif: h.motifs[0], ticsParTemps: 4, tics: h.tics, registre: 3, rapprocher: false });
    expect(avec.accords[2].hauteurs).toEqual([-4, 2, 4]);
    expect(sans.accords[2].hauteurs).toEqual([-8, -4, 2]);
  });

  it("un motif qui ne divise pas le morceau est coupé à la fin, sa dernière section raccourcie", () => {
    const h = calculerHarmonie({ motif: "Am/3,+F/3", ticsParTemps: 4, tics: 40, registre: 3, rapprocher: false });
    expect(h.sections).toEqual([0, 12, 24, 36]);
    expect(h.accords.at(-1)).toEqual({ tic: 36, tics: 4, hauteurs: [-7, -3, 0] });
  });

  it("refuse ce qu'il ne sait pas lire, en le nommant", () => {
    expect(() => calculerHarmonie({ motif: "Am/4,Hm/4", ticsParTemps: 4, tics: 32, registre: 3, rapprocher: true }))
      .toThrow(/Hm/);
    expect(() => calculerHarmonie({ motif: "Am/0", ticsParTemps: 4, tics: 32, registre: 3, rapprocher: true }))
      .toThrow(/zéro/);
    expect(() => calculerHarmonie({ motif: "Am", ticsParTemps: 4, tics: 32, registre: 3, rapprocher: true }))
      .toThrow(/durée manquante/);
  });
});

describe("le tirage des tables, par la loi", () => {
  const h = harmonieDuXml("essai-hasard.xml");
  const tirages = Array.from({ length: 200 }, (_, g) => tirerMotifAccords(h.motifs, h.tables, 3, creerAleatoire(g + 1)));

  it("les deux motifs de la banque sont tirés", () => {
    const rangs = new Set(tirages.map((t) => t.rang));
    expect([...rangs].sort()).toEqual([0, 1]);
  });

  it("aucun accord tiré n'égale le précédent, renversement près, et le dernier n'est pas le premier", () => {
    // Seuls les éléments TIRÉS sont refusés : un renvoi `$n` reprend son élément tel quel, même s'il
    // égale l'accord qui le précède.
    const tires = [[1, 2, 4, 5], [1, 2, 3, 6]];
    let comptes = 0;
    for (const t of tirages) {
      const accords = t.motif.split(",").map((e) => e.replace(/^\+/, "").split("/")[0]);
      for (const i of tires[t.rang]) {
        expect(egauxNormalises(lireAccordSH(accords[i], 3), lireAccordSH(accords[i - 1], 3)), t.motif).toBe(false);
        comptes++;
      }
      expect(accords.at(-1), t.motif).not.toBe(accords[0]);
    }
    expect(comptes).toBe(800);
  });

  it("un renvoi `$n` reprend l'élément n, et `1!0` diffère de l'élément 0", () => {
    for (const t of tirages) {
      const accords = t.motif.split(",").map((e) => e.replace(/^\+/, "").split("/")[0]);
      if (t.rang === 0) {
        // 0/8,1/4,1!0/4,+$0/8,1/4,2/4
        expect(accords[3]).toBe(accords[0]);
        expect(egauxNormalises(lireAccordSH(accords[2], 3), lireAccordSH(accords[0], 3))).toBe(false);
        expect(t.motif.split(",")[3].startsWith("+")).toBe(true);
      } else {
        // 0/4,1/4,1/4,1!1/4,+$0/4,$1/4,2/8
        expect(accords[4]).toBe(accords[0]);
        expect(accords[5]).toBe(accords[1]);
      }
    }
  });

  it("des tables qui ne permettent rien lèvent au lieu de tourner sans fin", () => {
    expect(() => tirerMotifAccords(["0/4,0/4"], [["Am", "Am6"]], 3, creerAleatoire(7))).toThrow(/ne permettent/);
  });

  it("à graine égale, le même tirage ; à graine différente, des tirages qui diffèrent", () => {
    const a = tirerMotifAccords(h.motifs, h.tables, 3, creerAleatoire(42));
    const b = tirerMotifAccords(h.motifs, h.tables, 3, creerAleatoire(42));
    expect(a).toEqual(b);
    expect(new Set(tirages.map((t) => t.motif)).size).toBeGreaterThan(50);
  });
});
