// docs/bruit-rose-unique.test.ts — Un seul bruit rose de Kellet dans tout le dépôt.
//
// POURQUOI CE TEST. Le filtre de Paul Kellet était écrit quatre fois, relevé le 2026-11-27 : le
// générateur de bruit, la corde pincée, le son d'essai de l'écart à la référence et le frottement du
// pointeur. Les quatre copies rendaient la même chose, et c'était une chance plutôt qu'une règle :
// un coefficient retouché dans l'une n'aurait bougé aucune des trois autres, et le « bruit rose »
// d'Attic aurait eu deux couleurs sans que rien le signale. Elles appellent désormais
// `core/bruit-rose.ts`.
//
// CE QUE CE GARDE CHERCHE EST UNE FORME, JAMAIS UN NOM, comme celui du générateur commun : une
// copie renommée passerait sous un garde qui chercherait `bruitRoseKellet`. Il cherche le PREMIER
// PÔLE du filtre, 0,99886, qu'aucune copie ne peut omettre sans cesser de rendre le même bruit.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const RACINES = ["src", "tests-e2e", "electron", "scripts"];
const EXTENSIONS = /\.(ts|tsx|cjs|mjs|js)$/;

/** Le premier pôle du filtre de Kellet, qui ne s'écrit pas autrement. */
const POLE = /0\.99886/;

/** Les fichiers qui ont le droit de le porter, et pourquoi. */
const PERMIS: Record<string, string> = {
  "src/core/bruit-rose.ts": "le module qui porte le filtre",
  "src/core/bruit-rose.test.ts": "le témoin, qui doit garder la copie historique pour la comparer",
  "src/docs/bruit-rose-unique.test.ts": "ce garde, qui doit nommer le pôle qu'il cherche",
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

describe("le bruit rose de Kellet", () => {
  it("N'EST ÉCRIT QU'UNE FOIS : aucune autre source ne porte son premier pôle", () => {
    const copies: string[] = [];
    let lus = 0;
    for (const racine of RACINES) {
      for (const f of fichiers(racine)) {
        const chemin = f.split("\\").join("/");
        lus++;
        if (PERMIS[chemin]) continue;
        readFileSync(f, "utf-8").split("\n").forEach((l, i) => {
          if (POLE.test(l)) copies.push(`${chemin}:${i + 1}`);
        });
      }
    }
    // Un garde qui ne lirait plus rien passerait au vert : il doit avoir parcouru le dépôt.
    expect(lus).toBeGreaterThan(1000);
    expect(copies, copies.length === 0 ? "" :
      `${copies.length} copie(s) du filtre de Kellet hors de core/bruit-rose.ts :\n  ${copies.join("\n  ")}`
      + "\n\nLe bruit rose se tire de `bruitRoseKellet`, qui prend la source blanche, le gain et le régime.")
      .toEqual([]);
  });

  it("LE MODULE QUI LE PORTE LE PORTE ENCORE : le garde ne cherche pas dans le vide", () => {
    expect(readFileSync(join("src", "core", "bruit-rose.ts"), "utf-8")).toMatch(POLE);
  });
});
