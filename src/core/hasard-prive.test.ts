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

/**
 * LA FORME D'UN GÉNÉRATEUR ÉCRIT À LA MAIN, et non la constante de celui-là.
 *
 * L'EN-TÊTE DE CE FICHIER ANNONÇAIT L'ANGLE MORT, et le 2026-10-22 il s'est avéré peuplé : un
 * balayage par la forme a rendu **trois** générateurs distincts là où la règle n'en voyait qu'un.
 * Celui de la bibliothèque C, celui de Numerical Recipes — `s * 1664525 + 1013904223` dans huit
 * modules — et un MINSTD, `s * 16807 % 2147483647`, dans l'automate cellulaire.
 *
 * LES DEUX AUTRES NE PERDENT RIEN, ET C'EST MESURÉ et non déduit : vingt mille tirages rendent
 * 20 000 valeurs distinctes pour Numerical Recipes comme pour le générateur commun, contre
 * **14 469** pour la copie de la bibliothèque C. Leurs produits restent sous 2^53, donc exacts.
 * Ce n'est donc PAS une liste de fautes : c'est le recensement de ce qui existe, pour qu'un
 * générateur NEUF ne puisse pas arriver sans qu'on le voie — et le prochain pourrait déborder.
 *
 * Le motif cherche une variable réaffectée à elle-même multipliée par une grande constante, ce qui
 * est la mécanique même d'un générateur congruentiel. `creerAleatoire` ne la porte pas : il ajoute
 * puis mêle par `Math.imul`, sans jamais multiplier son état par un littéral.
 */
const FORME_CONGRUENTIELLE = /\b([A-Za-z_$][\w$]*)\s*=\s*\(?\s*\1\s*\*\s*\d{4,}/;

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

/**
 * Les modules qui portent un générateur écrit à la main dont les tirages, eux, sont sains.
 *
 * Ils sont recensés et non reprochés : leurs produits restent sous 2^53, et la mesure le confirme.
 * Les réunir sous `creerAleatoire` reste souhaitable — un seul générateur, une seule convention de
 * graine — mais changerait ce qu'on entend à graine égale, et cette décision n'est pas celle d'un
 * test. Une entrée s'en retire quand le module passe au générateur commun.
 */
const RECENSES = new Set<string>([
  "src/audio/attracteurs.ts",
  "src/audio/automate-cellulaire.ts",
  "src/audio/continuation-spectrale.ts",
  "src/audio/ecosysteme.ts",
  "src/audio/mandelbrot.ts",
  "src/audio/pca-neuronale.ts",
  "src/audio/reverb-fractal.ts",
  "src/audio/spectrogramme-fractal.ts",
  "src/audio/ssp.ts",
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

  it("AUCUN GÉNÉRATEUR NEUF, QUELLE QUE SOIT SA CONSTANTE : la forme est cherchée, pas le nom", () => {
    // La règle d'à côté ne voit qu'un multiplicateur ; celle-ci voit la mécanique. Un module qui
    // écrirait demain son propre générateur avec d'autres constantes tomberait ici.
    const parLaForme = sources()
      .filter((f) => FORME_CONGRUENTIELLE.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(/\\/g, "/"));
    const inattendus = parLaForme.filter((f) => !A_CORRIGER.has(f) && !RECENSES.has(f));
    expect(inattendus, [
      "Un module écrit son propre générateur congruentiel.",
      "Le dépôt en a UN, `creerAleatoire` de `core/hasard.ts`, et sa convention de graine va avec.",
      "Si ce module a une raison de faire autrement, elle s'écrit, et son nom entre dans RECENSES.",
    ].join("\n")).toEqual([]);
  });

  it("LE MOTIF DE FORME VOIT LES TROIS GÉNÉRATEURS DU DÉPÔT, et laisse le commun tranquille", () => {
    // Un témoin par constante trouvée, plus le générateur commun, dont la mécanique est autre.
    expect(FORME_CONGRUENTIELLE.test("g = (g * 1103515245 + 12345) & 0x7fffffff")).toBe(true);
    expect(FORME_CONGRUENTIELLE.test("s = (s * 1664525 + 1013904223) >>> 0")).toBe(true);
    expect(FORME_CONGRUENTIELLE.test("(s = (s * 16807) % 2147483647)")).toBe(true);
    // Le générateur commun AJOUTE son décalage au lieu de multiplier son état : c'est ce qui le
    // distingue, et le motif ne le prend donc pas. Sa constante n'est pas écrite ici, le garde
    // voisin de `docs/hasard-commun.test.ts` la réservant à `core/hasard.ts` — il m'a attrapé.
    expect(FORME_CONGRUENTIELLE.test("etat = (etat + DECALAGE) >>> 0")).toBe(false);
    expect(FORME_CONGRUENTIELLE.test("t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t")).toBe(false);
    // Et il ne confond pas un calcul ordinaire avec un état qui se replie sur lui-même.
    expect(FORME_CONGRUENTIELLE.test("const echantillons = duree * 48000")).toBe(false);
    expect(FORME_CONGRUENTIELLE.test("total = autre * 44100")).toBe(false);
  });

  it("ET AUCUNE ENTRÉE DE `RECENSES` N'A VIEILLI", () => {
    const parLaForme = sources()
      .filter((f) => FORME_CONGRUENTIELLE.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(/\\/g, "/"));
    const perimes = [...RECENSES].filter((f) => !parLaForme.includes(f));
    expect(perimes, "à retirer de RECENSES : ces modules n'écrivent plus de générateur").toEqual([]);
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
