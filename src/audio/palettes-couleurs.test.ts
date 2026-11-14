// audio/palettes-couleurs.test.ts — Une écriture des six palettes, et chacune a ses teintes.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { registre } from "./adaptateur";
import { valeurCanoniqueChoix } from "../i18n";
import { PALETTES } from "./attracteurs-image-et-son";
import { PALETTES_COULEURS, choixPaletteCouleurs } from "./palettes-couleurs";

const RACINE = resolve(__dirname, "..");
const MOI = join("audio", "palettes-couleurs.ts");

function sources(dossier: string, trouves: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) { sources(chemin, trouves); continue; }
    if ((nom.endsWith(".ts") || nom.endsWith(".tsx")) && !nom.includes(".test.")) trouves.push(chemin);
  }
  return trouves;
}

describe("les palettes de couleurs", () => {
  it("rend les trois listes appariées", () => {
    const c = choixPaletteCouleurs();
    expect(c.optionIds).toEqual(PALETTES_COULEURS.ids);
    expect(c.options).toHaveLength(6);
    expect(c.optionsEn).toHaveLength(6);
  });

  it("CHAQUE PALETTE OFFERTE A SES TEINTES DANS L'ATTRACTEUR, sans quoi elle retomberait sur la classique", () => {
    expect(PALETTES_COULEURS.ids.filter((id) => !PALETTES[id])).toEqual([]);
  });

  it("un projet ancien rouvre sur sa palette, sous le nom qu'il avait enregistré", () => {
    for (const id of ["attracteur-ifs", "visualisation-songsee"]) {
      const p = registre.trouverDef(id)?.parametres?.find((x) => x.nom === "Palette");
      expect(p, id).toBeDefined();
      for (const nom of PALETTES_COULEURS.ids) expect(valeurCanoniqueChoix(p!, nom)).toBe(nom);
    }
  });

  it("AUCUN AUTRE FICHIER N'ÉCRIT LA LISTE", () => {
    const fautifs = sources(RACINE)
      .filter((c) => !c.endsWith(MOI) && readFileSync(c, "utf8").includes(`"classic", "magma"`))
      .map((c) => c.slice(RACINE.length + 1));
    expect(fautifs, "prendre `choixPaletteCouleurs` de `audio/palettes-couleurs.ts`").toEqual([]);
  });
});
