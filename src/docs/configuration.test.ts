// src/docs/configuration.test.ts — Chaque clé du fichier de configuration a sa ligne, son lecteur,
// et un défaut qui se relit sur les deux systèmes.
//
// POURQUOI CE GARDE. Pièce C0 du plan du fichier de configuration (2026-11-19). Le dépôt a payé deux
// fois le réglage déclaré que personne ne lit (`AGENTS.md` §3, contrat de composant) : une clé du
// fichier qui ne serait lue nulle part laisserait croire qu'elle agit. Et une clé non documentée ne
// se trouve pas. Le schéma vit dans `electron/configuration.cjs`, le mode d'emploi dans
// `CONFIGURATION.md`, et ce garde tient les trois ensemble.
//
// CE QU'IL TIENT, pour chaque clé du schéma :
//   - une ligne dans la table « Les clés » de `CONFIGURATION.md`, et aucune ligne sans clé ;
//   - un lecteur hors de `configuration.cjs` et des tests, par la FORME `valeurs.cle` ou
//     `valeurs["cle"]`, et non par le nom seul, que le schéma et ce garde portent eux-mêmes ;
//   - un défaut qui se relit sans un problème, sous Windows et sous Linux : le fichier proposé en
//     est fait, et un défaut hors de ses propres bornes y serait refusé à la relecture.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(__dirname, "../..");
const require_ = createRequire(import.meta.url);
const { SCHEMA, lireConfiguration, proposition } = require_(join(RACINE, "electron", "configuration.cjs"));

/** Les clés que la table « Les clés » de `CONFIGURATION.md` documente, par leur première colonne. */
function clesDocumentees(): string[] {
  const doc = readFileSync(join(RACINE, "CONFIGURATION.md"), "utf8");
  const section = doc.split(/^## Les clés$/m)[1]?.split(/^## /m)[0] ?? "";
  return [...section.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
}

/** Les sources où un lecteur peut vivre : le processus principal et l'interface, tests exclus. */
function sources(): string[] {
  const electron = readdirSync(join(RACINE, "electron"))
    .filter((f) => f.endsWith(".cjs") && f !== "configuration.cjs")
    .map((f) => readFileSync(join(RACINE, "electron", f), "utf8"));
  const src = (readdirSync(join(RACINE, "src"), { recursive: true }) as string[])
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => readFileSync(join(RACINE, "src", f), "utf8"));
  return [...electron, ...src];
}

const MACHINES = [
  { plateforme: "win32", home: "C:\\Users\\f", userData: "C:\\Users\\f\\AppData\\Roaming\\attic", ressources: "C:\\Users\\f\\AppData\\Local\\Programs\\attic\\resources" },
  { plateforme: "linux", home: "/home/f", userData: "/home/f/.config/attic", ressources: "/tmp/.mount_attic/resources" },
];

describe("les clés du fichier de configuration", () => {
  it("CHAQUE CLÉ A SA LIGNE DANS « CONFIGURATION.md », et aucune ligne n'est sans clé", () => {
    const schema = Object.keys(SCHEMA).sort();
    const doc = clesDocumentees().sort();
    expect(schema.filter((c) => !doc.includes(c)), "ces clés du schéma ne sont pas documentées").toEqual([]);
    expect(doc.filter((c) => !schema.includes(c)), "ces lignes documentent une clé qui n'existe plus").toEqual([]);
  });

  it("CHAQUE CLÉ A UN LECTEUR DANS LE CODE, par la forme `valeurs.cle`", () => {
    const code = sources().join("\n");
    const sansLecteur = Object.keys(SCHEMA).filter((cle) =>
      !new RegExp(`valeurs(?:\\.${cle}\\b|\\[["']${cle}["']\\])`).test(code));
    expect(sansLecteur, "une clé que personne ne lit laisse croire qu'elle agit").toEqual([]);
  });

  it("LES DÉFAUTS SE RELISENT SANS UN PROBLÈME, sous Windows et sous Linux", () => {
    for (const machine of MACHINES) {
      const defauts = lireConfiguration({ ...machine, schema: SCHEMA });
      expect(defauts.problemes, machine.plateforme).toEqual([]);
      const relu = lireConfiguration({ ...machine, schema: SCHEMA, texte: JSON.stringify(proposition({ valeurs: defauts.valeurs, plateforme: machine.plateforme, schema: SCHEMA })) });
      expect(relu.problemes, `le fichier proposé sous ${machine.plateforme} doit se relire`).toEqual([]);
      expect(relu.valeurs).toEqual(defauts.valeurs);
    }
  });
});
