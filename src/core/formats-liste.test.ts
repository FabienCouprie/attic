// core/formats-liste.test.ts — Une seule écriture du format d'une liste, et de la jointure qui l'applique.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { FORMATS_LISTE, choixFormatListe, joindreListe } from "./formats-liste";

const RACINE = resolve(__dirname, "..");
const MOI = join("core", "formats-liste.ts");

function sources(dossier: string, trouves: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) { sources(chemin, trouves); continue; }
    if ((nom.endsWith(".ts") || nom.endsWith(".tsx")) && !nom.includes(".test.")) trouves.push(chemin);
  }
  return trouves;
}

describe("le format d'une liste de noms", () => {
  it("rend les trois listes appariées", () => {
    const c = choixFormatListe();
    expect(c.optionIds).toEqual(["virgule", "retour-ligne", "puces"]);
    expect(c.options).toEqual(["Virgule", "Retour ligne", "Puces"]);
    expect(c.optionsEn).toEqual(["Comma", "Newline", "Bullets"]);
  });

  it("joint sous chaque écriture, l'identifiant comme les libellés d'avant", () => {
    const noms = ["Flûte", "Hautbois"];
    for (const ecriture of ["virgule", "Virgule", "Comma", "illisible"]) expect(joindreListe(noms, ecriture), ecriture).toBe("Flûte, Hautbois");
    for (const ecriture of ["retour-ligne", "Retour ligne", "Newline"]) expect(joindreListe(noms, ecriture), ecriture).toBe("Flûte\nHautbois");
    for (const ecriture of ["puces", "Puces", "Bullets"]) expect(joindreListe(noms, ecriture), ecriture).toBe("• Flûte\n• Hautbois");
  });

  it("AUCUN AUTRE FICHIER N'ÉCRIT LES FORMATS NI LEUR JOINTURE", () => {
    // Quatre composants portaient chacun la liste et la jointure, à la ligne près.
    const fautifs: string[] = [];
    for (const chemin of sources(RACINE)) {
      if (chemin.endsWith(MOI)) continue;
      const texte = readFileSync(chemin, "utf8");
      if (texte.includes(`"${FORMATS_LISTE.fr[1]}"`)) fautifs.push(`${chemin.slice(RACINE.length + 1)} : un libellé écrit`);
      if (/===\s*"(retour-ligne|puces)"/.test(texte)) fautifs.push(`${chemin.slice(RACINE.length + 1)} : une jointure recopiée`);
    }
    expect(fautifs, "prendre `choixFormatListe` et `joindreListe` de `core/formats-liste.ts`").toEqual([]);
  });
});
