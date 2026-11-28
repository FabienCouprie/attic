// audio/soundhelix-generateurs.test.ts — Les trois générateurs de motifs.
//
// NIVEAU 1 POUR LE CRESCENDO, qui ne tire rien : ses deux occurrences de l'essai de batterie, écrites
// avec les réglages de l'XML, égalent ce que le programme a joué, tic, durée et vélocité, dans les
// tics qui précèdent l'entrée de la voix visée.
//
// NIVEAU 2 POUR LE HASARD ET LES FRAGMENTS, sur cent graines : chaque partie a sa longueur exacte ;
// une partie nommée deux fois se répète à l'identique ; une variante est une permutation de sa base
// et en diffère ; les tics joués, les vélocités et les décalages restent dans leurs bornes ; une
// liaison ne précède qu'une note ; une partie par fragments n'est faite que des fragments de sa lettre.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { creerAleatoire } from "../core";
import { FauteMotif, lireMotif, ticsDuMotif } from "./soundhelix-motifs";
import { lireFragments, lirePlan, motifAuHasard, motifEnCrescendo, motifParFragments } from "./soundhelix-generateurs";
import { lireReleveSoundHelix } from "./temoins-soundhelix";

const RELEVE = lireReleveSoundHelix(readFileSync(join(process.cwd(), "src", "audio", "temoins-soundhelix", "batterie.txt"), "utf8"));
const lire = (t: string) => lireMotif(t, { jokers: "+#*", velociteMax: 1000, ticsParTemps: 4 });

/** Les notes d'un motif, [tic, durée, vélocité], décalées d'un tic de départ. */
function notes(texte: string, depart: number): number[][] {
  let t = depart;
  return lire(texte).flatMap((e) => { const n = e.decalage !== null ? [[t, e.tics, e.velocite]] : []; t += e.tics; return n; });
}

/** Les notes d'une ligne du relevé entre deux tics. */
function noteDuReleve(rang: number, de: number, a: number): number[][] {
  return RELEVE.sequences.filter((s) => s.instrument === "batterie")[rang].entrees
    .filter((e) => e.hauteur !== null && e.tic >= de && e.tic < a).map((e) => [e.tic, e.tics, e.velocite]);
}

describe("le motif en crescendo, à réglages égaux avec SoundHelix", () => {
  it("le roulement de caisse claire avant l'entrée de la grosse caisse : seize notes, de 100 à 1000, exposant 2", () => {
    const texte = motifEnCrescendo({ tics: 16, velocite: { min: 100, max: 1000 }, exposant: 2, prefixe: "", motif: "0", suffixe: "" });
    expect(notes(texte, 176)).toEqual(noteDuReleve(1, 176, 192));
    expect(notes(texte, 624)).toEqual(noteDuReleve(1, 624, 640));
  });

  it("la grosse caisse avant l'entrée de la caisse claire : un préfixe, un motif répété, un suffixe", () => {
    const texte = motifEnCrescendo({ tics: 12, velocite: { min: 300, max: 900 }, exposant: 1, prefixe: "-/2", motif: "0/2", suffixe: "0,0" });
    expect(texte).toBe("-/2,0/2:409,0/2:518,0/2:627,0/2:736,0/1:845,0/1:900");
    expect(notes(texte, 116)).toEqual(noteDuReleve(0, 116, 128));
  });

  it("coupe le motif répété à la place qui reste, et refuse un préfixe trop long", () => {
    expect(ticsDuMotif(lire(motifEnCrescendo({ tics: 7, velocite: { min: 1, max: 1000 }, exposant: 1, prefixe: "", motif: "0/3", suffixe: "" })))).toBe(7);
    expect(() => motifEnCrescendo({ tics: 4, velocite: { min: 1, max: 1000 }, exposant: 1, prefixe: "-/3", motif: "0", suffixe: "0/2" })).toThrow(FauteMotif);
  });
});

const HASARD = {
  plan: "A1,A2,A1,B1,A3", tics: 16, probabiliteNote: 60, probabiliteLiaison: 30,
  velocite: { min: 400, max: 900 }, ticsJoues: { min: 6, max: 12 }, decalages: [0, 1, 2, 4],
  longueursNote: [1, 2], longueursSilence: [1, 2], correlation: 0.5, exposant: 1.5, partiesDistinctes: true,
};

/** Les parties d'un motif rendu, à raison de `tics` chacune. */
function parties(texte: string, tics: number): string[] {
  const out: string[] = [];
  let courante: string[] = [];
  let t = 0;
  for (const brut of texte.split(",")) {
    courante.push(brut);
    t += ticsDuMotif(lire(brut));
    if (t === tics) { out.push(courante.join(",")); courante = []; t = 0; }
  }
  expect(courante).toEqual([]);
  return out;
}

const multiensemble = (p: string) => [...p.split(",")].map((e) => e.replace("~", "")).sort().join(",");

describe("le motif au hasard, par la loi", () => {
  it("tient, sur cent graines, le plan, les longueurs, les bornes et les variantes", () => {
    for (let graine = 1; graine <= 100; graine++) {
      const texte = motifAuHasard({ ...HASARD, aleatoire: creerAleatoire(graine) });
      const [a1, a2, a1bis, b1, a3] = parties(texte, 16);
      expect(a1bis).toBe(a1);
      for (const v of [a2, a3]) {
        expect(multiensemble(v), `graine ${graine}`).toBe(multiensemble(a1));
        expect(v).not.toBe(a1);
      }
      expect(a3).not.toBe(a2);
      expect(b1).not.toBe(a1);
      const entrees = lire(texte);
      entrees.forEach((e, k) => {
        if (e.decalage === null) return;
        expect(HASARD.decalages).toContain(e.decalage);
        expect(e.velocite).toBeGreaterThanOrEqual(400);
        expect(e.velocite).toBeLessThanOrEqual(900);
        if (e.lie) expect(entrees[k + 1]?.decalage, `graine ${graine}, liaison vers un silence`).not.toBeNull();
      });
      for (const p of [a1, b1]) {
        const joues = lire(p).filter((e) => e.decalage !== null).reduce((s, e) => s + e.tics, 0);
        expect(joues).toBeGreaterThanOrEqual(6);
        expect(joues).toBeLessThanOrEqual(12);
      }
    }
  });

  it("à corrélation pleine, la vélocité suit la hauteur", () => {
    const texte = motifAuHasard({ ...HASARD, plan: "A1", correlation: 1, exposant: 1, aleatoire: creerAleatoire(3) });
    for (const e of lire(texte).filter((x) => x.decalage !== null)) expect(e.velocite).toBe(Math.round(400 + 500 * (e.decalage! / 4)));
  });

  it("dit l'impossible plutôt que de tourner sans fin", () => {
    expect(() => motifAuHasard({ ...HASARD, ticsJoues: { min: 20, max: 30 }, aleatoire: creerAleatoire(1) })).toThrow(/aucune partie/);
    expect(() => lirePlan("A1,AB")).toThrow(/illisible/);
  });
});

describe("le motif par fragments, par la loi", () => {
  const FRAGMENTS = lireFragments("A : 0,-,-,- | 0,-,0,- | 0/2,-/2\nB : 0/3,0/1 | -/2,2/2 | 1/4");

  it("ne fait chaque partie que des fragments de sa lettre, à la longueur exacte, sur cent graines", () => {
    for (let graine = 1; graine <= 100; graine++) {
      const texte = motifParFragments({ plan: "A1,A2,B1,A1", tics: 12, fragments: FRAGMENTS, partiesDistinctes: true, aleatoire: creerAleatoire(graine) });
      const [a1, a2, b1, a1bis] = parties(texte, 12);
      expect(a1bis).toBe(a1);
      expect(a2).not.toBe(a1);
      const faitDe = (p: string, groupe: readonly string[]): boolean => {
        if (p === "") return true;
        return groupe.some((f) => (p === f || p.startsWith(`${f},`)) && faitDe(p.slice(f.length + 1), groupe));
      };
      expect(faitDe(a1, FRAGMENTS.get("A")!), `graine ${graine} : ${a1}`).toBe(true);
      expect(faitDe(b1, FRAGMENTS.get("B")!), `graine ${graine} : ${b1}`).toBe(true);
    }
  });

  it("dit quand les fragments ne font pas la longueur, ou qu'une lettre n'en a pas", () => {
    const f = lireFragments("A : 0/3");
    expect(() => motifParFragments({ plan: "A1", tics: 4, fragments: f, partiesDistinctes: false, aleatoire: creerAleatoire(1) })).toThrow(/ne font pas 4 tics/);
    expect(() => motifParFragments({ plan: "B1", tics: 4, fragments: f, partiesDistinctes: false, aleatoire: creerAleatoire(1) })).toThrow(/aucun fragment/);
    expect(() => lireFragments("A 0,1")).toThrow(/illisible/);
  });
});
