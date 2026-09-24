// src/docs/generer-modulables.test.ts — Le recensement ne se cite pas de mémoire.
//
// POURQUOI CE TEST. J'ai cité le total du recensement après que les exclusions convenues l'avaient
// déjà réduit. Un nombre répété sans être recalculé est faux dès la première avancée. Le fichier est
// donc engendré, et ce test refuse qu'il vieillisse : poser une entrée Modulation sur un composant
// le retire du recensement, et le fichier doit suivre dans le même commit.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { toutesLesFiches } from "../plugins";
import { ECARTES, cibles, dejaModulables, recensementEnTexte } from "./modulables";

const CHEMIN = resolve(__dirname, "../..", "MODULABLES.md");
const ecrire = process.env.ECRIRE_MODULABLES === "1";

describe("le recensement des effets à rendre modulables", () => {
  it("il est à jour", () => {
    const texte = recensementEnTexte(toutesLesFiches);
    if (ecrire) { writeFileSync(CHEMIN, texte, "utf8"); return; }
    expect(existsSync(CHEMIN),
      "MODULABLES.md est absent : lancez « npm run docs:modulables »").toBe(true);
    expect(readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n"), [
      "MODULABLES.md ne correspond plus au registre.",
      "Un composant a reçu son entrée Modulation, ou en a perdu une : c'est une bonne nouvelle.",
      "Lancez « npm run docs:modulables ». Ne corrigez pas le fichier à la main.",
    ].join("\n")).toBe(texte);
  });

  it("UN COMPOSANT QUI ACCEPTE DÉJÀ UNE COURBE N'EST PLUS À FAIRE", () => {
    const restants = new Set(cibles(toutesLesFiches).map((c) => c.id));
    for (const d of dejaModulables(toutesLesFiches)) {
      expect(restants.has(d.id), `${d.id} est modulable et figure pourtant à faire`).toBe(false);
    }
  });

  it("UN COMPOSANT ÉCARTÉ N'EST PLUS À FAIRE, et sa raison est écrite", () => {
    const restants = new Set(cibles(toutesLesFiches).map((c) => c.id));
    for (const [id, raison] of Object.entries(ECARTES)) {
      expect(restants.has(id), `${id} est écarté et figure pourtant à faire`).toBe(false);
      expect(raison.length, `${id} est écarté sans raison écrite`).toBeGreaterThan(20);
    }
  });

  it("chaque composant écarté existe encore dans le registre", () => {
    const ids = new Set(toutesLesFiches.map((f) => f.id));
    const disparus = Object.keys(ECARTES).filter((id) => !ids.has(id));
    expect(disparus, "une exclusion vise un composant qui n'existe plus").toEqual([]);
  });

  it("le recensement n'est pas vide, et ne couvre pas tout le catalogue", () => {
    const n = new Set(cibles(toutesLesFiches).map((c) => c.id)).size;
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(toutesLesFiches.length / 2);
  });
});
