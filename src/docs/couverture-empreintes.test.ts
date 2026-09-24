// src/docs/couverture-empreintes.test.ts — Un calcul déplacé sans empreinte surveillée est refusé.
//
// POURQUOI CE TEST, ET C'EST LE GARDE QUI COMPTE LE PLUS.
//
// La base d'empreintes ne protège que ce qu'elle contient. Une liste écrite à la main vieillit : je
// déplace un onzième composant, j'oublie de l'y inscrire, et la protection ne couvre plus le travail
// du jour. C'est précisément la forme de la faute que tout cet appareil existe pour empêcher — une
// modification incomplète dont rien ne signale l'incomplétude.
//
// LE LIEN MÉCANIQUE. Déplacer un calcul hors du fil crée un worker qui appelle `servirParCanal`.
// Ce test exige que chacun de ces workers soit RÉCLAMÉ par un composant de la liste surveillée. On ne
// peut donc pas déplacer un calcul sans étendre la surveillance : l'un force l'autre.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(__dirname, "../..");
const WORKERS = resolve(RACINE, "src", "workers");
const SPEC = resolve(RACINE, "tests-e2e", "empreintes.spec.ts");

/**
 * Les workers qui servent un calcul par canal, c'est-à-dire un calcul sorti du fil.
 *
 * LA DÉTECTION PORTE SUR L'IMPORT, et non sur le seul nom : `servir-par-canal.ts` DÉFINIT
 * `servirParCanal` sans être le worker d'aucun composant, et la première version de ce test le
 * signalait comme orphelin. Chercher le nom était un substitut ; l'import est la dépendance.
 */
function workersDeCalcul(): string[] {
  return readdirSync(WORKERS)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .filter((f) => readFileSync(resolve(WORKERS, f), "utf8").includes('from "./servir-par-canal"'))
    .sort();
}

describe("la couverture de la base d'empreintes", () => {
  it("CHAQUE WORKER DE CALCUL EST RÉCLAMÉ par un composant surveillé", () => {
    const spec = readFileSync(SPEC, "utf8");
    const orphelins = workersDeCalcul().filter((w) => !spec.includes(w));
    expect(orphelins, [
      "Un calcul a été déplacé hors du fil sans que son composant rejoigne la base d'empreintes.",
      "Ajoutez-le à SURVEILLES dans tests-e2e/empreintes.spec.ts, avec le nom de son worker,",
      "puis établissez son empreinte : ECRIRE_EMPREINTES=1 npx playwright test tests-e2e/empreintes.spec.ts",
    ].join("\n")).toEqual([]);
  });

  it("aucun composant surveillé ne réclame un worker qui n'existe pas", () => {
    const spec = readFileSync(SPEC, "utf8");
    const reclames = [...spec.matchAll(/worker:\s*"([^"]+)"/g)].map((m) => m[1]);
    const presents = new Set(readdirSync(WORKERS));
    expect(reclames.filter((w) => !presents.has(w)),
      "Un worker réclamé par la base d'empreintes a disparu.").toEqual([]);
  });

  it("la base d'empreintes existe et couvre tous les composants surveillés", () => {
    const spec = readFileSync(SPEC, "utf8");
    const ids = [...spec.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length, "SURVEILLES est vide ou illisible").toBeGreaterThan(10);
    const base = JSON.parse(readFileSync(resolve(RACINE, "tests-e2e", "empreintes.json"), "utf8"));
    const manquants = ids.filter((id) => !(id in base.composants));
    expect(manquants, [
      "Un composant surveillé n'a pas d'empreinte enregistrée.",
      "Lancez ECRIRE_EMPREINTES=1 npx playwright test tests-e2e/empreintes.spec.ts",
    ].join("\n")).toEqual([]);
  });
});
