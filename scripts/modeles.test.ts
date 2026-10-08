// scripts/modeles.test.ts — Ce que la table des modèles doit dire de chaque licence.
//
// L'audit du 2026-09-22 avait bloqué trois modèles : les poids de Demucs, donnés « pour un usage
// scientifique seulement », et un classeur de genre dont aucune licence n'a jamais été déclarée et
// dont le dépôt d'origine a disparu. Les trois sont passés rediffusables le 2026-10-08, par
// décision du propriétaire écrite dans leur entrée. Héberger un modèle restant le republier, la
// table doit porter pour chacun la licence et ce qu'elle autorise, et un refus doit s'expliquer.
//
// ET CE FICHIER TIENT DÉSORMAIS CE QUI MANQUAIT : que toute entrée du manifeste ait une adresse.
// Sans ce cas, un installeur sans modèles embarqués livrait des nœuds muets — le séparateur et le
// classeur de genre l'étaient — sans que rien ne le dise, l'interface se contentant d'un décompte
// de « modèles sans source publiée » que personne ne lisait.
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

  it("PLUS AUCUN MODÈLE N'EST INTERDIT DE REDIFFUSION, et le garde reste", () => {
    // Les trois que l'audit du 2026-09-22 avait bloqués sont passés rediffusables le 2026-10-08,
    // par décision écrite dans leur entrée. Ce cas ne disparaît pas pour autant : il dit l'état,
    // et il tombera le jour où un modèle arrivera avec une licence qui ne l'autorise pas, ce qui
    // est exactement le moment où l'on veut être arrêté.
    const interdits = entrees.filter(([, m]) => !m.licence!.rediffusable).map(([, m]) => m.id).sort();
    expect(interdits).toEqual([]);
  });

  it("ET UN MODÈLE REDIFFUSABLE NE GARDE PAS UNE RAISON DE REFUS", () => {
    // ANGLE MORT TROUVÉ EN LEVANT LES TROIS DRAPEAUX : le cas qui exige une raison saute les
    // modèles rediffusables, de sorte qu'une raison laissée en place après coup serait devenue
    // du texte mort que rien ne signale. Ce qu'un modèle rediffusable a à dire de ses conditions
    // se dit dans `note`, lue par personne d'autre que l'humain qui relit la table.
    for (const [fichier, m] of entrees) {
      if (!m.licence!.rediffusable) continue;
      expect(m.licence!.raison, `${fichier} est rediffusable et garde une raison de refus`)
        .toBeUndefined();
    }
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
describe("le manifeste engendré", () => {
  const manifeste = JSON.parse(readFileSync(new URL("./modeles-manifest.json", import.meta.url), "utf8")) as {
    modeles: { id: string; source: { url: string | null; sha256?: string } }[];
  };

  it("TOUTE ENTRÉE A UNE ADRESSE, sans quoi un nœud arrive muet et personne ne le sait", () => {
    const sans = manifeste.modeles.filter((m) => !m.source?.url).map((m) => m.id);
    expect(sans, "un modèle sans adresse n'est récupérable par aucun chemin de l'application")
      .toEqual([]);
  });

  it("et chacune porte une empreinte, qui est ce qui décide d'installer ou de jeter", () => {
    for (const m of manifeste.modeles) {
      expect(m.source.sha256, m.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("TOUTES LES ADRESSES SONT CELLES DU DÉPÔT, et il n'y a plus d'exception", () => {
    // Une adresse tierce qui change ou disparaît emporte le nœud avec elle : c'est arrivé au
    // classeur de genre, dont le dépôt rend 401 depuis le 2026-09-22. GTCRN était le dernier des
    // vingt à venir d'ailleurs ; il a été publié sur la release le 2026-10-08, et la liste des
    // amonts tolérés est vide. Une installation qui n'embarque plus aucun modèle ne peut pas
    // dépendre de ce qu'un tiers garde en ligne.
    for (const m of manifeste.modeles) {
      expect(m.source.url, m.id).toContain("/FabienCouprie/attic/releases/download/assets/");
    }
  });
});

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
