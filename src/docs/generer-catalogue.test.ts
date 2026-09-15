// docs/generer-catalogue.test.ts — COMPONENTS.md : sa régénération, et la
// vérification qu'il est à jour.
//
// Régénération : `npm run docs:components`, qui passe ECRIRE_CATALOGUE=1. Un
// fichier de test et non un script, parce que l'ancien script passait par
// vite-node, qui n'est pas une dépendance du projet — la commande échouait sur
// toute machine où npx ne l'avait pas en cache. Vitest, lui, est installé.
//
// Vérification : le catalogue est versionné. Il avait pris 15 composants de
// retard quand il ne l'était pas, et le README renvoyait vers un fichier absent
// du dépôt. Ajouter ou modifier un nœud sans régénérer fait désormais échouer la
// suite, avec la commande à lancer.
import "node-web-audio-api/polyfill.js";
import { it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toutesLesFiches } from "../plugins/index";
import "../audio/adaptateur";
import { genererCatalogueMarkdown } from "./catalogue-markdown";

const CHEMIN = join(process.cwd(), "COMPONENTS.md");
const ecrire = process.env.ECRIRE_CATALOGUE === "1";

it.skipIf(!ecrire)("écrit COMPONENTS.md", () => {
  const md = genererCatalogueMarkdown(toutesLesFiches as any);
  writeFileSync(CHEMIN, md);
  console.log(`COMPONENTS.md : ${toutesLesFiches.length} composants, ${md.split("\n").length} lignes.`);
});

it.skipIf(ecrire)("COMPONENTS.md correspond au registre", () => {
  expect(existsSync(CHEMIN), "COMPONENTS.md est absent : lancez « npm run docs:components »").toBe(true);
  // Git peut rendre le fichier avec des fins de ligne Windows : on compare le texte.
  const actuel = readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n").split("\n");
  const attendu = genererCatalogueMarkdown(toutesLesFiches as any).split("\n");
  // La première ligne qui diffère, et non les 350 ko des deux versions.
  const n = Math.max(actuel.length, attendu.length);
  let ecart: string | null = null;
  for (let k = 0; k < n; k++) {
    if (actuel[k] !== attendu[k]) {
      ecart = `ligne ${k + 1} — dans le fichier : ${(actuel[k] ?? "(fin)").slice(0, 120)} — attendu : ${(attendu[k] ?? "(fin)").slice(0, 120)}`;
      break;
    }
  }
  expect(ecart, "COMPONENTS.md n'est plus à jour : lancez « npm run docs:components » et versionnez le résultat").toBeNull();
});
