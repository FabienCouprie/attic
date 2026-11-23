// audio/champ-apprentissage.test.ts — Apprendre le champ à paires : il monte, il se rejoue, il s'éteint
// sous la pénalité, et la graine ne tire que la validation.

import { describe, expect, it } from "vitest";
import { apprendreSurCorpus, type DemandeApprentissage } from "./champ-apprentissage";
import { corpusDEssaiParLesRegles } from "./choral-corpus-essai";
import { colonnesDeLaSequence, decalageVers } from "./champ-corpus";
import { corpusDEssai } from "./valeurs-essai";
import type { Corpus } from "./corpus";

const TOUS = { vertical: true, horizontal: true, diagonal: true };

describe("apprendre sur un corpus", async () => {
  const corpus: Corpus = await corpusDEssaiParLesRegles(24, 3);
  const demande = (o: Partial<DemandeApprentissage> = {}): DemandeApprentissage => ({
    corpus, mode: "majeur", pas: 1, voisinages: TOUS, penalite: 0.0005, passes: 60, partValidation: 0.25, graine: 5, ...o,
  });

  it("le corpus d'essai est fait de vingt-quatre chorals à quatre voix en do majeur", () => {
    expect(corpus.pieces).toHaveLength(24);
    expect(corpus.pieces.every((p) => p.tonalite?.tonique === 0 && p.tonalite.mode === "majeur")).toBe(true);
  });

  it("monte la pseudo-vraisemblance, en apprentissage comme en validation, au-dessus du modèle nul", () => {
    const nul = apprendreSurCorpus(demande({ passes: 1, penalite: 10 }));
    const r = apprendreSurCorpus(demande());
    expect(r.modele).not.toBe(null);
    expect(r.piecesValidation).toBe(6);
    expect(r.apprentissage.logPV).toBeGreaterThan(nul.apprentissage.logPV + 0.5);
    expect(r.validation!.logPV).toBeGreaterThan(nul.validation!.logPV + 0.3);
    expect(r.apprentissage.justes).toBeGreaterThan(0.5);
  });

  it("rend le même modèle à l'octet, deux fois", () => {
    const a = apprendreSurCorpus(demande()).modele!, b = apprendreSurCorpus(demande()).modele!;
    expect(Buffer.from(a.theta.buffer).equals(Buffer.from(b.theta.buffer))).toBe(true);
    expect(a.empreinte).toBe(b.empreinte);
  });

  it("éteint des paramètres sous la pénalité L1, et davantage sous une plus forte", () => {
    const faible = apprendreSurCorpus(demande({ penalite: 0.0001 })), forte = apprendreSurCorpus(demande({ penalite: 0.01 }));
    expect(forte.nonNuls).toBeLessThan(faible.nonNuls);
    expect(forte.nonNuls).toBeLessThan(forte.modele!.theta.length / 2);
  });

  it("la graine ne tire que les pièces de validation : sans validation, elle ne change rien", () => {
    const a = apprendreSurCorpus(demande({ graine: 5 })), b = apprendreSurCorpus(demande({ graine: 6 }));
    expect(Buffer.from(a.modele!.theta.buffer).equals(Buffer.from(b.modele!.theta.buffer))).toBe(false);
    const c = apprendreSurCorpus(demande({ partValidation: 0, graine: 5 })), e = apprendreSurCorpus(demande({ partValidation: 0, graine: 6 }));
    expect(c.validation).toBe(null);
    expect(Buffer.from(c.modele!.theta.buffer).equals(Buffer.from(e.modele!.theta.buffer))).toBe(true);
  });

  it("écarte en les nommant les pièces d'un autre mode, et ramène une pièce en do par le plus petit écart", () => {
    const r = apprendreSurCorpus({ ...demande(), corpus: corpusDEssai(), partValidation: 0 });
    expect(r.ecartees).toEqual(["essai-la-mineur · mineur"]);
    expect(decalageVers(2, 0)).toBe(-2);
    expect(decalageVers(7, 0)).toBe(5);
    expect(decalageVers(6, 0)).toBe(-6);
    const colonnes = colonnesDeLaSequence(corpusDEssai().pieces[0].sequence, 1, 0);
    expect(colonnes.map((c) => c.hauteurs?.[3])).toEqual([48, 53, 55, 48]);
  });
});
