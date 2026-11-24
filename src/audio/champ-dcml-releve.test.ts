// audio/champ-dcml-releve.test.ts — Le relevé de l'apprentissage sur les chorals livrés : son coût par passe,
// et ce que le modèle prédit sur les chorals qu'il n'a pas vus.
//
// GARDÉ PAR `CORPUS_LIVRE`, le chemin du corpus livré :
//   CORPUS_LIVRE=public/oonx/corpus-chorals-bach-dcml-3.json npx vitest run src/audio/champ-dcml-releve.test.ts
// Le plan du chantier avait estimé, sans la mesurer, une passe entre 0,06 et 0,6 s ; ce relevé le dit.
// Depuis le 2026-11-24 il relève les cinq modes du corpus livré, les trois modes anciens n'ayant que
// leurs propres chorals (décision D9).

import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { corpusDepuisJson } from "./corpus-fichier";
import { apprendreSurCorpus } from "./champ-apprentissage";
import { MODES_CHORAL } from "./choral-regles";

const CHEMIN = process.env.CORPUS_LIVRE;

describe.skipIf(!CHEMIN)("l'apprentissage sur les chorals livrés", () => {
  it("relève le coût d'une passe et la prédiction en validation, dans chaque mode", () => {
    const { corpus } = corpusDepuisJson(readFileSync(CHEMIN!, "utf8"));
    const lignes: string[] = [];
    for (const mode of MODES_CHORAL) {
      for (const passes of [1, 50]) {
        const t0 = performance.now();
        const r = apprendreSurCorpus({
          corpus, mode, pas: 1, voisinages: { vertical: true, horizontal: true, diagonal: true },
          penalite: 0.0005, passes, partValidation: 0.1, graine: 1,
        });
        const duree = performance.now() - t0;
        lignes.push(`${mode} · ${passes} passes · ${(duree / 1000).toFixed(2)} s · ${r.modele?.colonnes} colonnes · `
          + `apprentissage ${r.apprentissage.logPV.toFixed(3)} et ${(100 * r.apprentissage.justes).toFixed(1)} % · `
          + `validation ${r.validation?.logPV.toFixed(3)} et ${(100 * (r.validation?.justes ?? 0)).toFixed(1)} % · `
          + `${r.nonNuls} non nuls sur ${r.modele?.theta.length} · ${r.piecesGardees} pièces dont ${r.piecesValidation} de côté · ${r.colonnesPerdues} colonnes perdues`);
      }
    }
    // LE RELEVÉ S'ÉCRIT HORS DU DÉPÔT, dans `work/`, que git ignore : ses chiffres vont au CHANGELOG.
    mkdirSync("work", { recursive: true });
    writeFileSync("work/releve-apprentissage.md", ["# Apprentissage sur les chorals livrés", "", ...lignes.map((l) => `- ${l}`), ""].join("\n"), "utf8");
    expect(lignes).toHaveLength(2 * MODES_CHORAL.length);
  }, 3_600_000);
});
