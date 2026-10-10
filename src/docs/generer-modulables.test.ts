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
import { FAMILLES_EFFETS } from "../plugins/familles-palette";
import { coeursParTrames } from "./coeurs-par-trames";
import { CATEGORIES_ECARTEES, ECARTES, cibles, dejaModulables, idsEcartes, recensementEnTexte } from "./modulables";

const RACINE = resolve(__dirname, "../..");
const CHEMIN = resolve(__dirname, "../..", "MODULABLES.md");
const ecrire = process.env.ECRIRE_MODULABLES === "1";

describe("le recensement des effets à rendre modulables", () => {
  it("il est à jour", () => {
    const texte = recensementEnTexte(
      toutesLesFiches, coeursParTrames(RACINE, toutesLesFiches.map((f) => f.id)));
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
    for (const [id, raison] of idsEcartes()) {
      expect(restants.has(id), `${id} est écarté et figure pourtant à faire`).toBe(false);
      expect(raison.length, `${id} est écarté sans raison écrite`).toBeGreaterThan(20);
    }
  });

  it("chaque composant écarté existe encore dans le registre", () => {
    const ids = new Set(toutesLesFiches.map((f) => f.id));
    const disparus = [...idsEcartes().keys()].filter((id) => !ids.has(id));
    expect(disparus, "une exclusion vise un composant qui n'existe plus").toEqual([]);
  });

  // UNE FAMILLE ÉCARTÉE PAR UN NOM QUI N'EXISTE PLUS N'ÉCARTE RIEN, en silence : la décision serait
  // perdue et les nœuds reviendraient à faire sans que personne l'ait demandé.
  it("chaque famille écartée en bloc existe dans la palette et n'est pas vide", () => {
    for (const famille of Object.keys(CATEGORIES_ECARTEES)) {
      expect(FAMILLES_EFFETS[famille], `la famille « ${famille} » est absente de la palette`).toBeDefined();
      expect((FAMILLES_EFFETS[famille] ?? []).length,
        `la famille « ${famille} » est écartée mais vide`).toBeGreaterThan(0);
    }
  });

  // Un identifiant nommé qui est déjà couvert par sa famille est une répétition qui vieillira mal.
  it("aucune exclusion nommée ne double une famille écartée", () => {
    const parFamille = new Set(
      Object.keys(CATEGORIES_ECARTEES).flatMap((f) => FAMILLES_EFFETS[f] ?? []),
    );
    const doubles = Object.keys(ECARTES).filter((id) => parFamille.has(id));
    expect(doubles, "ces exclusions sont déjà couvertes par leur famille").toEqual([]);
  });

  it("le recensement REGARDE le catalogue, sans prétendre le couvrir en entier", () => {
    // CE QUE CE CAS TIENT, ET CE QU'IL NE TIENT PLUS. Il exigeait « plus de dix composants restant
    // à faire », ce qui a fini par mordre sur le chantier lui-même : la famille « niveau » faite,
    // il en restait dix, et le contrôle tombait en annonçant un succès. Le nombre de composants
    // qui RESTENT est destiné à descendre jusqu'à zéro ; ce n'est donc pas une mesure de bonne
    // santé. Ce qui ne descend pas, c'est le nombre de composants que le recensement REGARDE,
    // c'est-à-dire ceux qu'il range quelque part : à faire, déjà modulables, ou écartés avec leur
    // raison. Un recensement qui ne range plus personne est cassé ; celui-ci range tout le monde.
    const aFaire = new Set(cibles(toutesLesFiches).map((c) => c.id));
    const deja = new Set(dejaModulables(toutesLesFiches).map((d) => d.id));
    const ecartes = new Set(idsEcartes().keys());
    const regardes = new Set([...aFaire, ...deja, ...ecartes]);
    expect(regardes.size, "le recensement ne range plus personne").toBeGreaterThan(80);
    expect(regardes.size, "le recensement prétend couvrir tout le catalogue")
      .toBeLessThan(toutesLesFiches.length / 2);
    // Et ce qui reste à faire ne grandit pas : un composant neuf entre modulable ou écarté.
    expect(aFaire.size, "la liste à faire a grandi").toBeLessThanOrEqual(13);
  });
});
