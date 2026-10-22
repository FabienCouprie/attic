// core/octets.test.ts — Que « Mo » veuille dire un million d'octets, partout.
//
// LE DÉPÔT A PAYÉ CETTE CONFUSION DEUX FOIS sur la taille de l'installeur, et un faux chiffre y a
// été annoncé deux fois de suite. Le relevé du 2026-10-22 en a trouvé **seize endroits** qui
// divisaient par une puissance de deux en écrivant « Mo » : neuf dans l'application et sept dans
// les scripts, dont un écrit `2 ** 20`, que la recherche du nombre 1048576 ne voyait pas.
//
// D'OÙ UN GARDE QUI CHERCHE LA FORME, et non un nombre : toute DIVISION par une magnitude binaire,
// dans un fichier qui écrit par ailleurs « Ko », « Mo » ou « Go ». Une taille de tampon reste
// permise, parce qu'elle MULTIPLIE — `maxBuffer: 64 * 1024 * 1024` — et qu'un tampon ne porte
// aucune unité devant l'utilisateur.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { OCTETS_PAR_GO, OCTETS_PAR_KO, OCTETS_PAR_MO, enMo, formaterOctets } from "./octets";

const RACINE = join(__dirname, "..", "..");
const DOSSIERS = ["src", "scripts", "electron"];

/** Toutes les sources du dépôt, hors tests : ce sont elles qui parlent à l'utilisateur. */
function sources(racine: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(racine)) {
    if (entree === "node_modules" || entree === "dist") continue;
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) { out.push(...sources(chemin)); continue; }
    if (/\.(tsx?|cjs|mjs)$/.test(entree) && !/\.test\.(tsx?|cjs|mjs)$/.test(entree)) out.push(chemin);
  }
  return out;
}

/** Une division par une magnitude binaire, dans toutes ses écritures. */
const DIVISION_BINAIRE = /\/\s*\(?\s*(?:1048576|1073741824|1024\s*\*\s*1024|2\s*\*\*\s*(?:10|20|30)|1024)\b/;
/** Un libellé d'unité décimale, tel qu'il est écrit à l'écran. */
const LIBELLE_DECIMAL = /["'`][^"'`]*\b[KMG]o\b/;

describe("les unités de taille", () => {
  it("un mégaoctet vaut un million d'octets, et non 1 048 576", () => {
    expect(OCTETS_PAR_KO).toBe(1000);
    expect(OCTETS_PAR_MO).toBe(1_000_000);
    expect(OCTETS_PAR_GO).toBe(1_000_000_000);
    expect(enMo(758_293_216)).toBeCloseTo(758.293216, 6);
  });

  it("une taille s'écrit dans l'unité qui lui va", () => {
    expect(formaterOctets(200)).toBe("1 Ko");
    expect(formaterOctets(12_000)).toBe("12 Ko");
    expect(formaterOctets(1_000_000)).toBe("1 Mo");
    expect(formaterOctets(758_293_216)).toBe("758 Mo");
    expect(formaterOctets(1_129_969_856)).toBe("1,1 Go");
  });

  it("LE PLANCHER EST LE KILOOCTET, et jamais zéro", () => {
    // Un fichier de deux cents octets annoncé « 0 Ko » passerait pour absent.
    expect(formaterOctets(1)).toBe("1 Ko");
    expect(formaterOctets(0)).toBe("1 Ko");
  });

  it("le séparateur décimal est la virgule, comme partout dans l'interface", () => {
    expect(formaterOctets(2_500_000_000)).toBe("2,5 Go");
    expect(formaterOctets(2_500_000_000)).not.toContain(".");
  });
});

describe("aucune source ne divise par une puissance de deux en écrivant « Mo »", () => {
  const fichiers = DOSSIERS.flatMap((d) => sources(join(RACINE, d)));

  it("le relevé n'est pas vide : sans quoi ce garde ne dirait rien", () => {
    expect(fichiers.length).toBeGreaterThan(200);
  });

  it("LES DEUX NE SE RENCONTRENT PLUS DANS UN MÊME FICHIER", () => {
    // Une taille de tampon MULTIPLIE et ne porte pas d'unité : elle passe. C'est la division qui
    // trahit un calcul d'affichage, et le libellé qui dit laquelle on annonce.
    const fautifs: string[] = [];
    for (const fichier of fichiers) {
      const source = readFileSync(fichier, "utf8");
      if (!LIBELLE_DECIMAL.test(source)) continue;
      const lignes = source.split(/\r?\n/);
      for (let i = 0; i < lignes.length; i++) {
        if (!DIVISION_BINAIRE.test(lignes[i])) continue;
        // Un commentaire qui RACONTE la faute n'est pas la faute.
        if (/^\s*(\/\/|\*|\/\*)/.test(lignes[i])) continue;
        fautifs.push(`${fichier.replace(RACINE, "")}:${i + 1}  ${lignes[i].trim().slice(0, 80)}`);
      }
    }
    expect(fautifs, [
      "« Mo » désigne un million d'octets ; diviser par 1 048 576 annonce des mébioctets,",
      "soit 4,9 % sous la vérité. Passer par « enMo » ou « formaterOctets » de core/octets.ts.",
    ].join("\n")).toEqual([]);
  });
});
