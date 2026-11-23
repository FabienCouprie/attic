// plugins/verifier-choral.test.ts — « Vérifier un choral », avec et sans modèle, par son exécuteur.

import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { lireTableDcml } from "../audio/dcml-tsv";
import { TABLE_175 } from "../audio/choral-175-dcml";
import { modeleDEssai } from "../audio/valeurs-essai";

const fiche = registre.trouverDef("verifier-choral") as unknown as FicheLancable;
const choral175 = () => lireTableDcml(TABLE_175, 60).sequence;

describe("Vérifier un choral", () => {
  it("juge le choral 175 de Bach sans erreur, et sans modèle ne nomme aucun passage", async () => {
    const r = await lancerFiche(fiche, {}, { entrees: [choral175()] });
    expect(r.message).toMatch(/^0 erreurs · \d+ avis · 54 tranches$/);
    expect(String(r.valeurs[0])).not.toContain("passages les plus coûteux");
  });

  it("avec un modèle, nomme les passages qu'il trouve les plus coûteux, du plus coûteux au moins coûteux", async () => {
    const modele = modeleDEssai();
    const r = await lancerFiche(fiche, { "Arêtes rapportées": 3 }, { entrees: [choral175(), modele] });
    const lignes = String(r.valeurs[0]).split("\n");
    const debut = lignes.findIndex((l) => l.startsWith("passages les plus coûteux pour le modèle"));
    expect(lignes[debut]).toContain(`(corpus ${modele.empreinte})`);
    const passages = lignes.slice(debut + 1);
    expect(passages).toHaveLength(3);
    const couts = passages.map((l) => Number(/coût (-?[\d.]+)/.exec(l)![1]));
    expect([...couts].sort((a, b) => b - a)).toEqual(couts);
    expect(passages[0]).toMatch(/^mesure \d+, temps \d · coût -?[\d.]+ · (\S+ ){3}\S+ → (\S+ ){3}\S+$/);
    // Le jugement par les règles, lui, ne change pas.
    expect(r.message).toMatch(/^0 erreurs · /);
  });

  it("à zéro arête, ne nomme aucun passage, modèle branché", async () => {
    const r = await lancerFiche(fiche, { "Arêtes rapportées": 0 }, { entrees: [choral175(), modeleDEssai()] });
    expect(String(r.valeurs[0])).not.toContain("passages les plus coûteux");
  });
});
