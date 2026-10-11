// docs/hasard-commun.test.ts — Un seul générateur aléatoire dans tout le dépôt.
//
// POURQUOI CE TEST, ET CE QUE LE CHANTIER D'AVANT N'AVAIT PAS FINI. `core/hasard.ts` a été écrit
// pour remplacer cinq copies éparpillées du même générateur, et `core/hasard.test.ts` prouve qu'il
// rend bit à bit les mêmes suites qu'elles, sur deux mille tirages et cinq graines. Mais ce garde-là
// compare le générateur commun à une copie recollée DANS LE TEST : rien ne regardait le dépôt. Sept
// copies y vivaient encore, dont quatre en production, et chacune était un endroit de plus où une
// retouche pouvait changer le son d'un projet enregistré sans que rien ne le signale.
//
// CE QUE CE GARDE CHERCHE EST UNE FORME, JAMAIS UN NOM. Un garde qui chercherait la fonction
// `mulberry32` laisserait passer la même copie renommée `alea`, ce qui est arrivé au dépôt sur
// d'autres sujets. Ce qu'il cherche est la CONSTANTE du générateur, 0x6d2b79f5, qu'aucune copie ne
// peut omettre sans cesser de rendre la même suite. Elle est cherchée dans les deux écritures,
// hexadécimale et décimale.
//
// DEUX FICHIERS SONT EXEMPTÉS, ET POUR UNE RAISON QUI S'ÉCRIT. `core/hasard.ts` est le module qui
// porte le générateur : c'est là que la constante doit être. `core/hasard.test.ts` doit en garder la
// copie historique, puisque son travail est précisément de comparer l'un à l'autre ; lui retirer la
// copie reviendrait à supprimer le témoin.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const RACINES = ["src", "tests-e2e", "electron", "scripts"];
const EXTENSIONS = /\.(ts|tsx|cjs|mjs|js)$/;

/** La constante de mulberry32, dans ses deux écritures. */
const CONSTANTE = /0x6d2b79f5|1831565813/i;

/** Les fichiers qui ont le droit de la porter, et pourquoi. */
const PERMIS: Record<string, string> = {
  "src/core/hasard.ts": "le module qui porte le générateur commun",
  "src/core/hasard.test.ts": "le témoin, qui doit garder la copie historique pour la comparer",
  "src/docs/hasard-commun.test.ts": "ce garde, qui doit nommer la constante qu'il cherche",
};

/**
 * Les copies QUI NE PEUVENT PAS employer le module commun, listées nommément pour rester visibles.
 *
 * Le processus principal d'Electron est du CommonJS chargé tel quel, et il n'importe rien de `src` :
 * relevé à zéro occurrence. `core/hasard.ts` étant du TypeScript compilé avec le rendu, il n'est pas
 * atteignable de là sans donner au processus principal une étape de construction à lui, ce qui est
 * un sujet entier. Les écarter par leur RACINE les aurait fait disparaître du relevé ; nommées, elles
 * restent comptées, et le garde vérifie qu'elles sont toujours là plutôt que de les ignorer.
 */
const HORS_ATTEINTE: Record<string, string> = {
  "electron/sdxs-image.cjs": "processus principal, sans accès au TypeScript du rendu",
  "electron/stable-audio-3.cjs": "processus principal, sans accès au TypeScript du rendu",
};

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (nom === "node_modules" || nom === "dist") continue;
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin));
    else if (EXTENSIONS.test(nom)) out.push(chemin);
  }
  return out;
}

describe("le générateur commun", () => {
  it("EST LE SEUL DU DÉPÔT : aucune source ne porte la constante de mulberry32", () => {
    const copies: string[] = [];
    for (const racine of RACINES) {
      for (const f of fichiers(racine)) {
        const chemin = f.split("\\").join("/");
        if (PERMIS[chemin] || HORS_ATTEINTE[chemin]) continue;
        const lignes = readFileSync(f, "utf-8").split("\n");
        lignes.forEach((l, i) => {
          if (CONSTANTE.test(l)) copies.push(`${chemin}:${i + 1}`);
        });
      }
    }
    expect(copies, copies.length === 0 ? "" :
      `${copies.length} copie(s) du générateur hors de core/hasard.ts :\n  ${copies.join("\n  ")}`
      + "\n\nLe hasard se tire de `creerAleatoire` de core/hasard.ts, qui rend bit à bit la même"
      + " suite : un projet portant déjà une graine garde son son.")
      .toEqual([]);
  });

  it("ET LES DEUX FICHIERS HORS D'ATTEINTE LA PORTENT TOUJOURS, sinon l'exemption est périmée", () => {
    // Une exemption qui ne correspond plus à rien est pire qu'absente : elle fait croire qu'un
    // sujet reste ouvert alors qu'il est clos, ou l'inverse.
    for (const chemin of Object.keys(HORS_ATTEINTE)) {
      const lignes = readFileSync(chemin, "utf-8").split("\n");
      expect(lignes.some((l) => CONSTANTE.test(l)),
        `${chemin} n'en porte plus de copie : retirer son exemption`).toBe(true);
    }
  });

  it("ET CHAQUE EXEMPTION PORTE SA RAISON, pour qu'on n'allonge pas la liste sans le dire", () => {
    for (const [chemin, raison] of [...Object.entries(PERMIS), ...Object.entries(HORS_ATTEINTE)]) {
      expect(raison.length, `${chemin} doit dire pourquoi il est exempté`).toBeGreaterThan(20);
    }
    expect(Object.keys(PERMIS).length, "les fichiers qui portent le générateur sont trois")
      .toBe(3);
    expect(Object.keys(HORS_ATTEINTE).length, "la liste des hors d'atteinte ne s'allonge que sur décision")
      .toBe(2);
  });
});
