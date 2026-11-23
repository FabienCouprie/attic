// plugins/apprendre-corpus.test.ts — « Apprendre sur un corpus », par son exécuteur, dans le fil.
//
// Le banc de node n'a pas de constructeur `Worker` : le calcul y tourne dans le fil, par le repli de
// `parUneFois`. L'épreuve `tests-e2e/apprendre-corpus-dans-application.spec.ts` compare les deux.

import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { corpusDEssaiParLesRegles } from "../audio/choral-corpus-essai";
import { estModeleHarmonique, type ModeleHarmonique } from "../audio/modele-harmonique";

const fiche = registre.trouverDef("apprendre-corpus") as unknown as FicheLancable;

describe("Apprendre sur un corpus", async () => {
  const corpus = await corpusDEssaiParLesRegles(12, 4);
  const lancer = (reglages: Record<string, string | number>, entree: unknown = corpus) => lancerFiche(fiche, reglages, { entrees: [entree] });

  it("rend un modèle, le message de ses colonnes et le rapport de son apprentissage", async () => {
    const r = await lancer({ Passes: 30 });
    expect(r.levee).toBe(null);
    const m = r.valeurs[0] as ModeleHarmonique;
    expect(estModeleHarmonique(m)).toBe(true);
    expect(m.mode).toBe("majeur");
    expect(r.message).toMatch(/^\d+ colonnes · [\d.]+ % en tête · [\d.]+ % en validation$/);
    const rapport = String(r.valeurs[1]);
    expect(rapport).toMatch(/^11 pièces apprises · 1 mises de côté · 0 écartées/);
    expect(rapport).toMatch(/\nvalidation : \d+ notes · /);
  });

  it("lit ses voisinages : sans diagonales, le modèle n'en a aucune", async () => {
    const avec = (await lancer({ Passes: 5 })).valeurs[0] as ModeleHarmonique;
    const sans = (await lancer({ Passes: 5, Diagonaux: 0 })).valeurs[0] as ModeleHarmonique;
    expect(sans.voisinages.diagonal).toBe(false);
    expect(sans.theta.length).toBeLessThan(avec.theta.length);
  });

  it("à une part de validation nulle, ne met rien de côté et ne nomme aucune graine", async () => {
    const r = await lancer({ Passes: 5, "Part de validation": 0 });
    expect(String(r.valeurs[1])).toMatch(/^12 pièces apprises · 0 mises de côté/);
    expect(r.message).not.toMatch(/validation|graine/);
  });

  it("attend la dernière pièce d'un corpus en fabrication, sans rien apprendre", async () => {
    const r = await lancer({}, { ...corpus, enCours: { piece: 3, pieces: 12 } });
    expect(r.erreurRendue).toBe(false);
    expect(r.valeurs[0]).toBe(null);
    expect(r.message).toBe("corpus en fabrication, pièce 3/12 : l'apprentissage attend la dernière");
  });

  it("refuse sans corpus, et dit un corpus du mauvais mode", async () => {
    expect((await lancer({}, null)).message).toBe("Aucun corpus sur l'entrée Corpus.");
    const r = await lancer({ Gamme: "mineur", Passes: 5 });
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toBe("Aucune colonne à apprendre.");
    expect(String(r.valeurs[1])).toContain("écartée : essai-1 · majeur");
  });
});
