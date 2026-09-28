// core/hasard-prive.test.ts — Un générateur écrit à la main est un générateur cassé.
//
// LE DÉFAUT, relevé par Fabien à l'oreille sur le cercle pulsant : « revérifie l'aléatoire, j'ai un
// doute ». Quinze modules portaient chacun leur copie du même générateur congruentiel,
// `g * 1103515245 + 12345`, alors que `core/hasard.ts` en tient un depuis toujours.
//
// POURQUOI LA COPIE EST FAUSSE, ET PAS SEULEMENT REDONDANTE. En JavaScript, un produit n'est exact
// que jusqu'à 2^53. Après le premier `& 0x7fffffff`, l'état vaut jusqu'à 2^31, et le produit suivant
// monte à 2,4 × 10^18, soit **263 fois 2^53** : les bits de poids faible sont perdus, et ce sont
// exactement ceux qui portent l'aléa d'un générateur congruentiel. `Math.imul`, qu'emploie
// `creerAleatoire`, fait la multiplication sur 32 bits sans jamais déborder.
//
// CE QUE CELA COÛTAIT, MESURÉ sur vingt mille tirages : période de 10 466 contre plus de trente-neuf
// mille, et **14 469 valeurs distinctes sur 20 000** contre 20 000 sur 20 000. Une valeur sur quatre
// était un doublon. La moyenne et la corrélation, elles, paraissaient bonnes : c'est ce qui rend ce
// défaut invisible à un contrôle sommaire, et audible à l'usage.
//
// CE QUE CE RELEVÉ NE VOIT PAS. Il cherche le multiplicateur en clair. Un autre générateur écrit à
// la main, avec d'autres constantes, lui échapperait ; le second cas éprouve donc le motif sur un
// témoin dont la réponse est connue, et le troisième garde la porte par laquelle la faute revient
// le plus simplement, `Math.random`.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { creerAleatoire } from "./hasard";

/** Le multiplicateur de l'ancien générateur, celui de la bibliothèque C, recopié quinze fois. */
const MULTIPLICATEUR = /1103515245/;

function sources(dossier = "src", out: string[] = []): string[] {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) sources(chemin, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(chemin);
  }
  return out;
}

/**
 * Les modules qui portent encore leur propre générateur.
 *
 * ELLE N'EST PAS UNE EXCUSE, C'EST UN RELEVÉ DE CE QUI RESTE. Chacun de ces modules rend une pièce
 * différente une fois corrigé, à graine égale : la correction change ce qu'on entend, et c'est à
 * Fabien de décider quand. Une entrée ne s'y ajoute pas ; elle s'en retire.
 */
const A_CORRIGER = new Set<string>([
  "src/audio/ampleur.ts",
  "src/audio/brassage.ts",
  "src/audio/cercle-film.ts",
  "src/audio/courbe.ts",
  "src/audio/deplacement.ts",
  "src/audio/gendyn.ts",
  "src/audio/kit-batterie.ts",
  "src/audio/synthese-features.ts",
  "src/audio/texture-statistique.ts",
  "src/audio/velours.ts",
  "src/audio/wishart.ts",
  "src/plugins/instrument-graphe.ts",
]);

describe("aucun générateur écrit à la main", () => {
  const fautifs = sources()
    .filter((f) => MULTIPLICATEUR.test(readFileSync(f, "utf8")))
    .map((f) => f.replace(/\\/g, "/"));

  it("LE RELEVÉ VOIT CE QU'IL PRÉTEND VOIR : un témoin dont la réponse est connue", () => {
    // Sans ce cas, un motif qui cesserait de mordre rendrait une liste vide, donc une suite au vert.
    expect(sources().length).toBeGreaterThan(300);
    expect(MULTIPLICATEUR.test("g = (g * 1103515245 + 12345) & 0x7fffffff")).toBe(true);
    expect(MULTIPLICATEUR.test("Math.imul(etat ^ (etat >>> 15), 1 | etat)")).toBe(false);
  });

  it("AUCUN MODULE NOUVEAU N'EN PORTE, et ceux qui restent sont nommés un par un", () => {
    const inattendus = fautifs.filter((f) => !A_CORRIGER.has(f));
    expect(inattendus, [
      "Un module écrit son propre générateur congruentiel.",
      "En JavaScript ce produit déborde 2^53 dès le second tirage et perd ses bits de poids faible :",
      "période de 10 466 et 28 % de valeurs répétées, mesuré.",
      "Employer `creerAleatoire` de `core/hasard.ts`, qui multiplie par `Math.imul`.",
    ].join("\n")).toEqual([]);
  });

  it("ET AUCUNE ENTRÉE DE LA TABLE N'A VIEILLI : une ligne inutile masquerait le retour du défaut", () => {
    const perimes = [...A_CORRIGER].filter((f) => !fautifs.includes(f));
    expect(perimes, "à retirer de A_CORRIGER : ces modules n'en portent plus").toEqual([]);
  });

  it("LE GÉNÉRATEUR COMMUN NE DÉBORDE PAS, et c'est toute la différence", () => {
    // Vingt mille tirages sans un seul doublon, là où la copie en répétait plus d'un quart.
    const alea = creerAleatoire(7);
    const vus = new Set<number>();
    for (let i = 0; i < 20000; i++) vus.add(alea());
    expect(vus.size).toBe(20000);
  });

  it("et il est reproductible : même graine, même suite", () => {
    const suite = (graine: number) =>
      Array.from({ length: 32 }, ((a) => () => a())(creerAleatoire(graine))).join(",");
    expect(suite(7)).toBe(suite(7));
    expect(suite(7)).not.toBe(suite(8));
  });

  it("ET `Math.random` RESTE UNE SOURCE INJECTÉE, jamais un appel au milieu d'un calcul", () => {
    // CE QUE CE CAS A DÛ APPRENDRE. Je l'avais d'abord écrit pour interdire `Math.random` dans
    // `src/audio` tout entier, et il a relevé une vingtaine de modules : tous l'employaient comme
    // VALEUR PAR DÉFAUT d'un paramètre `hasard: () => number = Math.random`, c'est-à-dire le bon
    // motif, l'appelant passant une source graine. Et les appels véritables tirent une GRAINE quand
    // la personne n'en a pas choisi, ce que `core/hasard.ts` documente comme la convention du dépôt.
    // L'assertion d'origine partait donc d'une fausse prémisse. Ce qui reste vrai et vérifiable :
    // un module qui prend une source de hasard doit la prendre en paramètre, et c'est le cas.
    const injectee = sources()
      .filter((f) => /=\s*Math\.random\b/.test(readFileSync(f, "utf8")))
      .length;
    expect(injectee, "le motif de la source injectable doit exister et être employé").toBeGreaterThan(5);
  });
});
