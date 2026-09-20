// plugins/gestion-nodes-export.test.ts — Un node exporté en .zip emporte ses libellés anglais.
//
// Le manifeste d'export recopie les paramètres champ par champ. Chaque champ oublié
// est perdu à l'import, en silence : `uniteEn` et `defautEn` manquaient, si bien qu'un
// node réinstallé affichait de nouveau son unité française dans l'interface anglaise —
// le défaut même que le reste de l'i18n vient de corriger.
//
// Test STRUCTUREL : il lit la recopie dans le source. Une vérification à l'exécution
// demanderait d'écrire un .zip sur disque et un registre complet, alors que la faute
// tient à une liste de champs incomplète, qui se lit.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(__dirname, "gestion-nodes.ts"), "utf8");
const TYPES = readFileSync(join(__dirname, "..", "core", "types.ts"), "utf8");

describe("export d'un node en .zip", () => {
  it("recopie tous les champs anglais des paramètres décrits par le cœur", () => {
    const bloc = SOURCE.split("parametres: nodeDef.parametres.map")[1]?.slice(0, 400) ?? "";
    expect(bloc, "la recopie des paramètres est introuvable").not.toBe("");
    const champsAnglais = [...TYPES.split("export interface ParametreDef")[1].split("}")[0]
      .matchAll(/(\w+En)\?:/g)].map((m) => m[1]);
    expect(champsAnglais.length).toBeGreaterThanOrEqual(4);
    for (const champ of champsAnglais) {
      expect(bloc, `le manifeste d'export oublie « ${champ} »`).toContain(`${champ}: p.${champ}`);
    }
  });
});
