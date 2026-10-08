// src/audio/optimisation-exclue.test.ts — Ce qu'on a le droit d'attendre d'un module exclu de
// l'optimiseur de dépendances.
//
// LE DÉFAUT QUE CE CAS EMPÊCHE A COÛTÉ LA DICTÉE DANS L'APPLICATION INSTALLÉE, et il était
// invisible au développement — c'est ce qui le rend méritant d'un garde.
//
// `vosk-browser` est un paquet UMD. Son enveloppe choisit à l'exécution : s'il existe un `exports`
// et un `module`, elle y pose son API ; sinon elle pose `globalThis.Vosk`. Servi tel quel par le
// serveur de développement — il est dans `exclude` ci-dessous, et `build-plugins.ts` dit pourquoi —
// aucun des deux n'existe, donc c'est le global qui est posé. Le chargeur importait donc le module
// POUR SON EFFET DE BORD, jetait ce que l'import rendait, et lisait `globalThis.Vosk`.
//
// MAIS `optimizeDeps.exclude` NE VAUT QU'EN DÉVELOPPEMENT. Une construction de production
// l'empaquette, Rollup lui fournit un `exports` de synthèse, la première branche de l'enveloppe est
// prise, et le global n'est JAMAIS posé. Mesuré sur le bundle, bouton de dictée cliqué : « Dictée
// impossible : vosk-browser n'a pas posé son global », `typeof globalThis.Vosk` valant `undefined`.
// Les quatre composants Vosk tombaient avec elle, et seulement dans l'exe.
//
// LE GARDE CHERCHE LA FORME, et non ce paquet-ci : un `await import("…")` dont le résultat n'est
// lié à rien n'a de sens que si le module agit par effet de bord. Pour un module exclu de
// l'optimisation, cet effet de bord est précisément ce que la production ne reproduit pas. Lier le
// résultat ne coûte rien et oblige à regarder ce que le module rend vraiment.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { audioOptimizeDeps } from "./build-plugins";

const RACINE_SRC = join(__dirname, "..");

function fichiersSource(racine: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) { out.push(...fichiersSource(chemin)); continue; }
    if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) out.push(chemin);
  }
  return out;
}

/** Les paquets que `vite.config.ts` laisse hors de l'optimiseur, lus là où ils sont déclarés. */
const EXCLUS: string[] = (audioOptimizeDeps.exclude as string[])
  // `_audio_backup` n'est pas un paquet : c'est un dossier écarté de la recherche.
  .filter((nom) => !nom.startsWith("_"));

describe("les modules exclus de l'optimiseur de dépendances", () => {
  const fichiers = fichiersSource(RACINE_SRC);

  it("le relevé n'est pas vide : sans quoi ce garde ne dirait rien", () => {
    expect(EXCLUS.length).toBeGreaterThanOrEqual(4);
    expect(fichiers.length).toBeGreaterThan(100);
  });

  it("AUCUN N'EST IMPORTÉ POUR SON SEUL EFFET DE BORD, que la production ne reproduit pas", () => {
    const fautifs: string[] = [];
    for (const paquet of EXCLUS) {
      // Un `await import("x")` en tête d'instruction, suivi d'une fin d'instruction : son résultat
      // n'est lié à rien. Un `const … = await import("x")` ou un `(await import("x")).y` ne
      // correspond pas, le premier caractère qui suit n'étant alors ni `;` ni une fin de ligne.
      const motif = new RegExp(
        String.raw`(?:^|[;{}])\s*await\s+import\(\s*["']${paquet.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}["']\s*\)\s*(?:;|$)`,
        "m",
      );
      for (const fichier of fichiers) {
        if (motif.test(readFileSync(fichier, "utf8"))) {
          fautifs.push(`${paquet} dans ${fichier.replace(RACINE_SRC, "src")}`);
        }
      }
    }
    expect(fautifs, [
      "Un module exclu de l'optimiseur n'est servi tel quel QU'EN DÉVELOPPEMENT : la construction",
      "de production l'empaquette. Un import dont le résultat est jeté attend donc un effet de bord",
      "— un global posé, le plus souvent — que l'exe ne verra jamais. Liez ce que l'import rend, et",
      "lisez-le avant de vous rabattre sur le global.",
    ].join("\n")).toEqual([]);
  });
});
