// plugins/lire-partition.test.ts — « Lire une partition », par son exécuteur, sur le vrai Verovio.
//
// Ce que la notice promet, éprouvé chacun : l'extrait par défaut rend quatre voix, une par couche ;
// l'entrée « Notation » l'emporte sur le réglage ; une table du DCML se lit à 100 à la noire ; le
// Humdrum passe par le module qui le lit ; un texte qu'aucun format ne reconnaît est refusé, nommé.

import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import type { Sequence } from "../audio/sequence";

const fiche = registre.trouverDef("lire-partition") as unknown as FicheLancable;
const lire = (reglages: Record<string, string | number>, entree: unknown = null) => lancerFiche(fiche, reglages, { entrees: [entree] });
const parVoix = (s: Sequence) => [0, 1, 2, 3].map((v) => s.notes.filter((n) => n.voix === v).map((n) => n.note));

const KERN = ["**kern\t**kern\t**kern\t**kern", "*M4/4\t*M4/4\t*M4/4\t*M4/4", "=1-\t=1-\t=1-\t=1-",
  "4C\t4c\t4e\t4g", "4G\t4B\t4d\t4g", "==\t==\t==\t==", "*-\t*-\t*-\t*-"].join("\n");

describe("Lire une partition", () => {
  it("lit l'extrait par défaut en quatre voix, une par couche de portée", async () => {
    const r = await lire({});
    expect(r.levee).toBe(null);
    const s = r.valeurs[0] as Sequence;
    expect(parVoix(s)).toEqual([[76, 74, 72], [67, 67, 64], [60, 59, 55], [48, 43, 48]]);
    expect(r.message).toMatch(/^MusicXML · 4 voix · 12 notes$|^MusicXML · 4 voices · 12 notes$/);
  }, 60_000);

  it("prend l'entrée « Notation » avant le réglage, et lit le Humdrum", async () => {
    const r = await lire({}, KERN);
    const s = r.valeurs[0] as Sequence;
    expect(parVoix(s)).toEqual([[67, 67], [64, 62], [60, 59], [48, 55]]);
    expect(String(r.valeurs[1])).toMatch(/^Humdrum/);
  }, 60_000);

  it("lit une table du DCML à 100 à la noire quand « Tempo » vaut zéro", async () => {
    const table = ["quarterbeats\tduration_qb\tstaff\tvoice\tmidi\ttied", "0\t1.0\t1\t1\t67\t", "1\t1.0\t1\t1\t69\t"].join("\n");
    const r = await lire({}, table);
    const s = r.valeurs[0] as Sequence;
    expect(s.tempo).toBe(100);
    expect(s.notes.map((n) => [n.note, n.debut])).toEqual([[67, 0], [69, 0.6]]);
  });

  it("applique « Tempo » aux secondes", async () => {
    const r = await lire({ Tempo: 60 });
    const s = r.valeurs[0] as Sequence;
    expect(s.tempo).toBe(60);
    expect(s.notes.find((n) => n.voix === 0 && n.note === 72)?.debut).toBe(2);
  }, 60_000);

  it("refuse en le disant un texte qu'aucun format ne reconnaît", async () => {
    const r = await lire({}, "ceci n'est pas une partition");
    expect(r.erreurRendue).toBe(true);
    expect(r.valeurs[0]).toBe(null);
    expect(r.message).toMatch(/Notation (non reconnue|not recognised)/);
  });
});
