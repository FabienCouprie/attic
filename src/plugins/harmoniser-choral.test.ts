// plugins/harmoniser-choral.test.ts — « Harmoniser à quatre voix », par son exécuteur.
//
// Ce que la notice promet de la fiche, éprouvé chacun : quatre voix nommées, le soprano rendu tel
// qu'il est reçu, la seule première voix lue, le jugement au message et au rapport, la graine nommée
// au-dessus de zéro, la tonalité lue par ses choix, et chaque refus dit. Le calcul lui-même est
// éprouvé dans `audio/choral-harmoniser.test.ts`.

import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { lireTableDcml } from "../audio/dcml-tsv";
import { TABLE_175 } from "../audio/choral-175-dcml";
import type { Sequence } from "../audio/sequence";

const fiche = registre.trouverDef("harmoniser-choral") as unknown as FicheLancable;
const lancer = (reglages: Record<string, string | number>, entree: unknown) => lancerFiche(fiche, reglages, { entrees: [entree] });

/** Le choral 175 de Bach, ses quatre voix. */
const choral175 = (): Sequence => lireTableDcml(TABLE_175, 60).sequence;
const soprano = (s: Sequence): Sequence => ({ ...s, notes: s.notes.filter((n) => n.voix === 0), voix: undefined });
const hauteurs = (s: Sequence, v: number) => s.notes.filter((n) => n.voix === v).map((n) => [n.note, n.debut, n.fin]);

describe("Harmoniser à quatre voix", () => {
  it("rend quatre voix nommées, le soprano tel qu'il est reçu, et le jugement au message", async () => {
    const recue = choral175();
    const r = await lancer({}, recue);
    expect(r.levee).toBe(null);
    const s = r.valeurs[0] as Sequence;
    expect(s.voix?.map((v) => v.nom)).toEqual(["soprano", "alto", "ténor", "basse"]);
    expect(hauteurs(s, 0)).toEqual(hauteurs(recue, 0));
    expect(r.message).toMatch(/^\d+ colonnes · 0 erreurs au jugement$/);
    expect(String(r.valeurs[1])).toMatch(/\njugement : 0 erreurs · \d+ avis/);
  });

  it("ne lit que la première voix reçue", async () => {
    const quatre = await lancer({}, choral175());
    const une = await lancer({}, soprano(choral175()));
    expect((quatre.valeurs[0] as Sequence).notes).toEqual((une.valeurs[0] as Sequence).notes);
  });

  it("lit la tonalité par ses choix : la mineur, la sensible à la dominante, sans erreur au jugement", async () => {
    const la = [69, 71, 72, 71, 69, 68, 69, 72, 71, 69, 68, 69];
    const melodie: Sequence = { notes: la.map((note, k) => ({ note, velocite: 80, debut: k, fin: k + 1, voix: 0 })), tempo: 60 };
    const r = await lancer({ Gamme: "mineur", Tonique: "9" }, melodie);
    expect(r.message).toMatch(/ · 0 erreurs au jugement$/);
    const accords = String(r.valeurs[1]).split("\n").find((l) => l.startsWith("accords"))!;
    expect(accords.split(" ").at(-1)).toBe("i");
  });

  it("nomme la graine quand la température est au-dessus de zéro, et la tient", async () => {
    const a = await lancer({ "Température": 0.6, Graine: 7 }, choral175());
    const b = await lancer({ "Température": 0.6, Graine: 7 }, choral175());
    expect(a.message).toMatch(/ · graine 7$/);
    expect((a.valeurs[0] as Sequence).notes).toEqual((b.valeurs[0] as Sequence).notes);
    expect((await lancer({}, choral175())).message).not.toMatch(/graine/);
  });

  it("avec un modèle : sa grille au message, son corpus au rapport, et rien de changé à part entière pour les règles", async () => {
    const { apprendreSurCorpus } = await import("../audio/champ-apprentissage");
    const { corpusDEssaiParLesRegles } = await import("../audio/choral-corpus-essai");
    const modele = apprendreSurCorpus({
      corpus: await corpusDEssaiParLesRegles(12, 4), mode: "majeur", pas: 1,
      voisinages: { vertical: true, horizontal: true, diagonal: true }, penalite: 0.0005, passes: 30, partValidation: 0, graine: 1,
    }).modele!;
    const avec = (reglages: Record<string, string | number>) => lancerFiche(fiche, reglages, { entrees: [choral175(), modele] });
    const melange = await avec({ "Part des règles": 0 });
    expect(melange.message).toMatch(/ · grille du modèle noire$/);
    expect(String(melange.valeurs[1])).toContain(`modèle : corpus ${modele.empreinte} · majeur`);
    const regles = await avec({ "Part des règles": 100 });
    expect((regles.valeurs[0] as Sequence).notes).toEqual(((await lancer({}, choral175())).valeurs[0] as Sequence).notes);
    expect((await avec({ Gamme: "mineur", Tonique: "9" })).message).toMatch(/ · modèle appris en majeur$/);
  });

  it("refuse sans mélodie, et nomme le soprano trop grave avec son instant", async () => {
    const vide = await lancer({}, null);
    expect(vide.erreurRendue).toBe(true);
    expect(vide.valeurs).toEqual([null, null, null]);
    const grave: Sequence = { notes: [{ note: 72, velocite: 80, debut: 0, fin: 1, voix: 0 }, { note: 48, velocite: 80, debut: 1, fin: 2, voix: 0 }], tempo: 60 };
    const r = await lancer({}, grave);
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toMatch(/^soprano trop grave pour qu'un alto tienne sous lui : \S+ \(2\.0\)$/);
  });
});
