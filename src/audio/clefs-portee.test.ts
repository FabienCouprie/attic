// audio/clefs-portee.test.ts — Une écriture des clés de portée, traduite, et les anciennes valeurs se relisent.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { registre } from "./adaptateur";
import { valeurCanoniqueChoix } from "../i18n";
import { CLEFS_PORTEE, choixClefPortee } from "./clefs-portee";

const RACINE = resolve(__dirname, "..");
const MOI = join("audio", "clefs-portee.ts");

function sources(dossier: string, trouves: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) { sources(chemin, trouves); continue; }
    if ((nom.endsWith(".ts") || nom.endsWith(".tsx")) && !nom.includes(".test.")) trouves.push(chemin);
  }
  return trouves;
}

describe("les clés de portée", () => {
  it("rend les trois listes appariées, et le français n'affiche pas l'anglais", () => {
    const c = choixClefPortee();
    expect(c.optionIds).toEqual(["treble", "bass", "alto", "tenor"]);
    expect(c.options.filter((l) => c.optionIds.includes(l))).toEqual([]);
  });

  it("UN PROJET ANCIEN ROUVRE SUR SA CLÉ : il enregistrait le nom de VexFlow, qui est l'identifiant", () => {
    for (const id of ["vexflow-portee"]) {
      const p = registre.trouverDef(id)?.parametres?.find((x) => x.nom === "Clé");
      expect(p, id).toBeDefined();
      for (const clef of CLEFS_PORTEE.ids) expect(valeurCanoniqueChoix(p!, clef), `${id} · ${clef}`).toBe(clef);
      expect(valeurCanoniqueChoix(p!, String(p!.defaut))).toBe("treble");
    }
  });

  it("AUCUN AUTRE FICHIER N'ÉCRIT LA LISTE", () => {
    const fautifs = sources(RACINE)
      .filter((c) => !c.endsWith(MOI) && readFileSync(c, "utf8").includes(`"treble", "bass"`))
      .map((c) => c.slice(RACINE.length + 1));
    expect(fautifs, "prendre `choixClefPortee` de `audio/clefs-portee.ts`").toEqual([]);
  });
});
