// scripts/download-vosk-models.test.ts — Où une entrée d'archive a le droit d'être écrite.
//
// POURQUOI CE FICHIER EXISTE. L'amorçage déplie un `.zip` reçu d'un tiers pour le réécrire en
// `.tar.gz`, et une entrée nommée « ../../.bashrc » y déciderait des fichiers qu'on écrit. Le
// premier jet cherchait « .. » par expression régulière dans le nom ; CodeQL l'a refusé, et le
// dépôt disait déjà pourquoi dans `electron/extraire-node-zip.cjs` : un motif sur le nom laisse
// passer les formes encodées ou mixtes. Les noms hostiles éprouvés ici sont ceux de
// `electron/extraire-node-zip.test.ts`, afin que les deux déplieurs du dépôt soient tenus par la
// même liste.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";

const require = createRequire(import.meta.url);
const { cibleSure } = require("./download-vosk-models.cjs") as {
  cibleSure: (base: string, nom: string) => string;
};

const BASE = resolve("/travail/vosk");

describe("où une entrée d'archive a le droit d'être écrite", () => {
  it("rend un chemin sous le dossier de travail pour une entrée ordinaire", () => {
    expect(cibleSure(BASE, "vosk-model-small-fr-0.22/am/final.mdl"))
      .toBe(resolve(BASE, "vosk-model-small-fr-0.22/am/final.mdl"));
  });

  it("REFUSE TOUTE ENTRÉE QUI SORT DU DOSSIER, sous chacune de ses formes", () => {
    for (const nom of [
      "..",
      "../vole.txt",
      "../../vole.txt",
      "assets/../../../vole.txt",
      "a/../..",
      "..\\vole.txt",
      "..\\..\\vole.txt",
      "/etc/passwd",
    ]) {
      expect(() => cibleSure(BASE, nom), nom).toThrow(/entrée refusée/);
    }
  });

  it("laisse passer un « .. » qui ne sort pas du dossier", () => {
    // La règle est la SORTIE du dossier, et non la présence des deux points : une entrée qui
    // remonte puis redescend à l'intérieur reste légitime.
    expect(cibleSure(BASE, "a/../b.txt")).toBe(resolve(BASE, "b.txt"));
  });

  it("refuse un nom qui ne fait que PRÉFIXER le dossier de travail", () => {
    // « /travail/voskmechant » commence par « /travail/vosk » sans être dedans : c'est pourquoi la
    // comparaison porte sur le séparateur, et non sur la seule chaîne.
    expect(() => cibleSure(BASE, `..${sep}voskmechant${sep}x`)).toThrow(/entrée refusée/);
  });

  it("lit un antislash comme un séparateur, où qu'on exécute", () => {
    // CE CAS N'EST OBSERVABLE QUE LÀ OÙ L'ANTISLASH N'EN EST PAS UN, c'est-à-dire sur l'intégration
    // continue et non sur une machine Windows : `path.resolve` y traite déjà les deux. Retirer la
    // normalisation ne fait donc rien tomber sous Windows, et le plantage y est resté muet.
    //
    // ET CE N'EST PAS UNE FAILLE pour autant, ce qu'il vaut mieux dire que masquer : sans la
    // normalisation, « ..\\..\\x » ne sort pas du dossier sous POSIX, il y devient un nom de
    // fichier unique. Ce que la normalisation tient est la STRUCTURE de ce qu'on déplie, non sa
    // sûreté, et c'est ce que ce cas vérifie.
    expect(cibleSure(BASE, "a\\b.txt")).toBe(cibleSure(BASE, "a/b.txt"));
  });
});
