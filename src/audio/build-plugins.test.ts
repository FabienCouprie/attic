// audio/build-plugins.test.ts — Ce que Vite recopie dans `dist/` et que le paquetage jette aussitôt.
//
// POURQUOI CE TEST EXISTE. Relevé par Fabien en regardant le poids : la banque SoundFont existait en
// trois exemplaires de 141,5 Mo sur le disque — `public/`, `dist/`, et le paquet construit. La
// première et la troisième sont justifiées : c'est la source, fournie par lui, et le produit livré.
// La deuxième ne l'est pas. Vite recopie tout `public/` dans `dist/`, puis electron-builder écarte
// ces dossiers de l'archive, puisqu'ils sont livrés autrement.
//
// LE PLUGIN QUI S'EN CHARGEAIT NE FAISAIT PRESQUE RIEN. Il ne supprimait que les fichiers `.onnx`
// posés à la racine de `dist/oonx`, alors que les modèles vivent dans des sous-dossiers, et il
// ignorait `sf2` et `sfz`. Son commentaire annonçait 450 Mo épargnés. Mesuré sur cet arbre :
// `dist/` pesait 1699 Mo, dont 1478 pour les trois dossiers que le paquet jette.
//
// CE QUE LE TEST TIENT. La règle de déduction, et l'accord entre les deux listes : celle du plugin
// se lit dans `package.json`, de sorte qu'un `extraResources` ajouté demain soit couvert sans qu'on
// y pense. Un test qui recopierait la liste à la main rejouerait exactement la faute d'origine.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dossiersJetesParLePaquetage } from "./build-plugins";

describe("les dossiers que le paquetage jette", () => {
  it("se déduisent des motifs de négation, et d'eux seuls", () => {
    expect(dossiersJetesParLePaquetage([
      "dist/**/*",
      "!dist/oonx/**/*",
      "!dist/sf2/**/*",
      "!dist/sfz/**/*",
      "electron/*.cjs",
    ])).toEqual(["dist/oonx", "dist/sf2", "dist/sfz"]);
  });

  it("NE PREND PAS `dist/**/*` POUR UNE EXCLUSION, ce qui effacerait tout le bundle", () => {
    // Le motif d'inclusion et les motifs d'exclusion se ressemblent à un point d'exclamation près.
    expect(dossiersJetesParLePaquetage(["dist/**/*"])).toEqual([]);
    expect(dossiersJetesParLePaquetage(["!dist/**/*"])).toEqual([]);
  });

  it("ignore ce qui ne désigne pas un dossier de `dist`", () => {
    expect(dossiersJetesParLePaquetage([
      "!release*/**/*", "!build/**/*", "!**/*.map", "!node_modules/x/**/*", "!dist/a/b/**/*",
    ])).toEqual([]);
  });

  it("accepte les deux écritures du motif, avec et sans `/*` final", () => {
    expect(dossiersJetesParLePaquetage(["!dist/sf2/**", "!dist/sfz/**/*"]))
      .toEqual(["dist/sf2", "dist/sfz"]);
  });

  it("COUVRE CE QUE `package.json` DÉCLARE AUJOURD'HUI, sans que la liste soit recopiée ici", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    const dossiers = dossiersJetesParLePaquetage(pkg.build.files);
    // Trois aujourd'hui ; le nombre changera, et c'est voulu. Ce qui ne doit pas changer, c'est que
    // chaque dossier écarté du paquet soit bien reconnu, et qu'aucun autre ne le soit.
    expect(dossiers.length).toBeGreaterThan(0);
    for (const d of dossiers) {
      expect(d.startsWith("dist/"), d).toBe(true);
      expect(pkg.build.files).toContain(`!${d}/**/*`);
    }
  });
});
