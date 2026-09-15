// docs/generer-catalogue.test.ts — Régénère COMPONENTS.md. Lancé par
// `npm run docs:components`, et ignoré par la suite de tests ordinaire.
//
// Pourquoi un fichier de test et non un script : l'ancien script passait par
// vite-node, qui n'est pas une dépendance du projet — `npm run docs:components`
// échouait (« vite-node n'est pas reconnu ») sur toute machine où npx ne l'avait
// pas déjà en cache. Vitest, lui, est installé, et charge le registre exactement
// comme les tests des nœuds.
import "node-web-audio-api/polyfill.js";
import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toutesLesFiches } from "../plugins/index";
import "../audio/adaptateur";
import { genererCatalogueMarkdown } from "./catalogue-markdown";

it.skipIf(process.env.ECRIRE_CATALOGUE !== "1")("écrit COMPONENTS.md", () => {
  const racine = process.cwd();
  const { version } = JSON.parse(readFileSync(join(racine, "package.json"), "utf8"));
  const md = genererCatalogueMarkdown(toutesLesFiches as any, { version });
  writeFileSync(join(racine, "COMPONENTS.md"), md);
  console.log(`COMPONENTS.md : ${toutesLesFiches.length} composants, ${md.split("\n").length} lignes.`);
});
