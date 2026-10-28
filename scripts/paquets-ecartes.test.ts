// scripts/paquets-ecartes.test.ts — Un paquet retiré pour sa faille ne revient pas dans l'arbre.
//
// CE QUE CE FICHIER GARDE. Certains paquets ont quitté l'arbre parce qu'ils portent une faille sans
// version corrigée. Rien ne les empêche d'y revenir : une mise à jour de la dépendance qui les
// tirait, un `npm install` lancé depuis un verrou ancien, et l'installation réussit, la passe de
// tests reste verte. Seule l'alerte reviendrait, sur GitHub, après la fusion.
//
// LE PREMIER EST `deepmerge`, le 2026-10-28 (alerte Dependabot n° 122, GHSA-gcqx-w48m-w2h4) : sa
// fonction `mergeObject()` laisse polluer le prototype de ce qu'elle rend, jusqu'à 4.3.1 qui est sa
// dernière version. Il n'entrait que par meyda 5.6.3 → `@rollup/plugin-node-resolve` → `deepmerge`.
//
// D'OÙ meyda ÉPINGLÉ À 5.6.2 dans `package.json`, sans accent circonflexe, et c'est ici que la
// raison s'écrit puisque `package.json` ne porte pas de commentaire. La 5.6.3 ne diffère de la 5.6.2
// que par la façon dont elle est construite : elle copie `dct` et `fftjs` dans son propre code au
// lieu de les importer, et c'est pour cela qu'elle déclare le greffon Rollup, par erreur en
// dépendance ordinaire alors que seul son `rollup.config.mjs` l'emploie. Mesuré le 2026-10-28 sur
// les deux paquets publiés, le code de Node comme celui de la fenêtre : les 21 descripteurs de meyda,
// sur trois tailles de trame et trois signaux, rendent des résultats IDENTIQUES À L'OCTET, sauf
// `spectralFlux`, qui lève la même erreur dans les deux versions et qu'Attic n'emploie pas.
//
// DEUX ÉTATS SONT LUS, ET NON UN : le verrou, que lisent `npm audit` et Dependabot, et
// `node_modules/.package-lock.json`, que npm écrit pour ce qui est réellement installé. Un audit vert
// sur le verrou a déjà coexisté avec quatre versions vulnérables installées.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const RACINE = process.cwd();

/** Les paquets retirés de l'arbre, l'avis qui les a fait retirer, et ce qu'il faut faire s'ils reviennent. */
const ECARTES = [
  {
    nom: "deepmerge",
    avis: "GHSA-gcqx-w48m-w2h4",
    remede: "meyda 5.6.3 le tire par @rollup/plugin-node-resolve : garder meyda à 5.6.2, au code identique.",
  },
] as const;

type Verrou = { packages?: Record<string, { dependencies?: Record<string, string> }> };

const lire = (chemin: string): Verrou => JSON.parse(readFileSync(chemin, "utf8")) as Verrou;

/** Les chemins d'un verrou qui installent un paquet de ce nom, à quelque profondeur que ce soit. */
function installations(verrou: Verrou, nom: string): string[] {
  return Object.keys(verrou.packages ?? {})
    .filter((chemin) => chemin === `node_modules/${nom}` || chemin.endsWith(`/node_modules/${nom}`));
}

/** Les chemins d'un verrou dont le paquet déclare dépendre de ce nom : ce qui le tire. */
function tireurs(verrou: Verrou, nom: string): string[] {
  return Object.entries(verrou.packages ?? {})
    .filter(([, paquet]) => nom in (paquet.dependencies ?? {}))
    .map(([chemin]) => chemin || "(racine)");
}

const ETATS = [
  ["package-lock.json", join(RACINE, "package-lock.json")],
  ["node_modules/.package-lock.json", join(RACINE, "node_modules", ".package-lock.json")],
] as const;

describe("les paquets écartés pour une faille", () => {
  it("les deux états sont lisibles, et la lecture trouve ce qui y est", () => {
    // Sans ce cas, une lecture qui ne rendrait rien ferait passer les suivants sans rien vérifier.
    for (const [etat, chemin] of ETATS) {
      expect(existsSync(chemin), `${etat} manque : lancer npm install.`).toBe(true);
      expect(installations(lire(chemin), "meyda"), `La lecture de ${etat} ne trouve pas meyda.`).toEqual(["node_modules/meyda"]);
      expect(tireurs(lire(chemin), "dct"), `La lecture de ${etat} ne voit pas ce qui tire dct.`).toContain("node_modules/meyda");
    }
  });

  for (const { nom, avis, remede } of ECARTES) {
    for (const [etat, chemin] of ETATS) {
      it(`${nom} (${avis}) n'est pas dans ${etat}`, () => {
        const verrou = lire(chemin);
        expect(installations(verrou, nom), [
          `${etat} installe de nouveau ${nom}, retiré pour ${avis}.`,
          `Ce qui le tire : ${tireurs(verrou, nom).join(", ")}.`,
          remede,
        ].join("\n")).toEqual([]);
      });
    }
  }
});
