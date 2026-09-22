// scripts/modeles.test.ts — Ce que la table des modèles doit dire de chaque licence.
//
// L'audit du 2026-09-22 a montré que deux modèles embarqués ne peuvent pas être rediffusés — les
// poids de Demucs, donnés « pour un usage scientifique seulement », et un classeur de genre dont
// aucune licence n'a jamais été déclarée et dont le dépôt d'origine a disparu. Héberger un modèle
// sur notre propre release, c'est le republier : la table doit donc porter, pour chacun, la licence
// et ce qu'elle autorise, et un refus doit s'expliquer.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import { readFileSync } from "fs";

const CONNUS = createRequire(import.meta.url)("./modeles.cjs").CONNUS as Record<string, {
  id: string;
  licence?: { nom: string; credit: string; rediffusable: boolean; raison?: string; note?: string };
}>;

const entrees = Object.entries(CONNUS);

describe("table des modèles téléchargeables", () => {
  it("chaque modèle déclare sa licence et ce qu'elle autorise", () => {
    const sansLicence = entrees.filter(([, m]) => !m.licence).map(([f]) => f);
    expect(sansLicence).toEqual([]);
    for (const [fichier, m] of entrees) {
      expect(typeof m.licence!.nom, fichier).toBe("string");
      expect(m.licence!.nom.length, fichier).toBeGreaterThan(0);
      expect(typeof m.licence!.credit, fichier).toBe("string");
      expect(typeof m.licence!.rediffusable, fichier).toBe("boolean");
    }
  });

  it("un modèle qu'on ne rediffuse pas dit POURQUOI, en une phrase qu'on peut citer", () => {
    for (const [fichier, m] of entrees) {
      if (m.licence!.rediffusable) continue;
      expect(m.licence!.raison, fichier).toBeTruthy();
      expect(m.licence!.raison!.length, fichier).toBeGreaterThan(40);
    }
  });

  it("les trois modèles de l'audit restent interdits de rediffusion", () => {
    const interdits = entrees.filter(([, m]) => !m.licence!.rediffusable).map(([, m]) => m.id).sort();
    expect(interdits).toEqual(["genre", "htdemucs-6s", "htdemucs-fp16"]);
  });

  it("et les autres portent un crédit, qui est ce que leur licence exige", () => {
    for (const [fichier, m] of entrees) {
      if (!m.licence!.rediffusable) continue;
      expect(m.licence!.credit.length, fichier).toBeGreaterThan(3);
    }
  });
});

// LE FICHIER DE LICENCES DIT CE QUE LA TABLE DIT. Il annonçait « MIT » pour les poids de Demucs,
// ce que leur auteur contredit, et créditait le classeur de genre à quelqu'un qui n'en est pas
// l'auteur. Ces deux phrases-là sont celles que quelqu'un lit avant de décider s'il peut employer
// Attic : elles se tiennent par un test.
describe("THIRD_PARTY.md", () => {
  const texte = readFileSync(new URL("../THIRD_PARTY.md", import.meta.url), "utf8");

  it("n'annonce pas les poids de Demucs sous licence MIT", () => {
    for (const ligne of texte.split("\n").filter((l) => l.startsWith("| `htdemucs"))) {
      expect(ligne, ligne).toMatch(/non-commercial/);
      expect(ligne.replace(/Code MIT/g, ""), ligne).not.toMatch(/\|\s*MIT\s*\|/);
    }
  });

  it("porte les trois attributions que ces poids demandent", () => {
    expect(texte).toContain("rouard2023hybrid");
    expect(texte).toContain("MUSDB18-HQ");
    expect(texte).toContain("Meta Platforms, Inc.");
  });

  it("ne crédite plus le classeur de genre au mauvais auteur, et dit son origine", () => {
    expect(texte).not.toContain("Nicklas Hansen");
    expect(texte).toContain("hubert-base-ls960");
  });
});
