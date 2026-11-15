// audio/sens-arpege.test.ts — Une table du sens d'un arpège, et chaque écriture d'avant se relit.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { registre } from "./adaptateur";
import { valeurCanoniqueChoix } from "../i18n";
import {
  LIBELLES_HERITES_SENS, SENS_ARPEGE, SENS_D_UN_BALAYAGE, SENS_SANS_ORDRE_DE_JEU, choixSensArpege, ordreUneFois, sensDe, sensParmi,
} from "./sens-arpege";
import { creerAleatoire } from "../core/hasard";

const RACINE = resolve(__dirname, "..");
const MOI = join("audio", "sens-arpege.ts");

function sources(dossier: string, trouves: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) { sources(chemin, trouves); continue; }
    if ((nom.endsWith(".ts") || nom.endsWith(".tsx")) && !nom.includes(".test.")) trouves.push(chemin);
  }
  return trouves;
}

describe("le sens d'un arpège", () => {
  it("rend les listes appariées, dans l'ordre de la table et non dans celui demandé", () => {
    const c = choixSensArpege(["aller-retour", "montant"]);
    expect(c.optionIds).toEqual(["montant", "aller-retour"]);
    expect(c.options).toEqual(["Montant", "Aller-retour"]);
    expect(c.optionsEn).toEqual(["Ascending", "Round trip"]);
    expect(() => choixSensArpege(["montant", "en-spirale" as never])).toThrow(/en-spirale/);
  });

  it("chaque écriture se lit : l'identifiant, les deux libellés, et les écritures d'avant", () => {
    SENS_ARPEGE.ids.forEach((id, i) => {
      expect(sensDe(id)).toBe(id);
      expect(sensDe(SENS_ARPEGE.fr[i])).toBe(id);
      expect(sensDe(SENS_ARPEGE.en[i])).toBe(id);
    });
    for (const [ecriture, id] of Object.entries(LIBELLES_HERITES_SENS)) expect(sensDe(ecriture), ecriture).toBe(id);
    expect(sensDe("en spirale")).toBeUndefined();
    expect(sensParmi("ordre-de-jeu", SENS_SANS_ORDRE_DE_JEU, "montant")).toBe("montant");
    expect(sensParmi("convergent", SENS_D_UN_BALAYAGE, "montant")).toBe("montant");
    expect(sensParmi("Descendante", SENS_SANS_ORDRE_DE_JEU, "montant")).toBe("descendant");
  });

  it("UN PARCOURS JOUÉ UNE FOIS : les trois sens d'avant à la note près, et les quatre neufs", () => {
    const m = [60, 64, 67, 72];
    const zero = () => 0;
    // Les trois d'avant, tels que les accords joués et la gamme jouée les rendaient.
    expect(ordreUneFois(m, "montant", zero)).toEqual(m);
    expect(ordreUneFois(m, "descendant", zero)).toEqual([72, 67, 64, 60]);
    expect(ordreUneFois(m, "aller-retour", zero)).toEqual([60, 64, 67, 72, 67, 64, 60]);
    // Les quatre neufs.
    expect(ordreUneFois(m, "retour-aller", zero)).toEqual([72, 67, 64, 60, 64, 67, 72]);
    expect(ordreUneFois(m, "convergent", zero)).toEqual([60, 72, 64, 67]);
    expect(ordreUneFois(m, "divergent", zero)).toEqual([67, 64, 72, 60]);
    const tire = ordreUneFois(m, "aleatoire", creerAleatoire(7));
    expect([...tire].sort((a, b) => a - b)).toEqual(m);
    expect(ordreUneFois(m, "aleatoire", creerAleatoire(7))).toEqual(tire);
    expect(ordreUneFois([...m, 76, 79], "aleatoire", creerAleatoire(8))).not.toEqual([...m, 76, 79]);
  });

  it("UN PROJET ANCIEN ROUVRE SUR SON SENS, dans chacun des quatre composants", () => {
    const cas: [string, string, string, string][] = [
      ["gamme-jouee", "Sens", "montante", "montant"], ["gamme-jouee", "Sens", "Descendante", "descendant"],
      ["arpege-spectral", "Sens", "Up", "montant"], ["arpege-spectral", "Sens", "Up and down", "aller-retour"],
      ["arpegiateur-midi", "Direction", "UpDown", "aller-retour"], ["accords-joues", "Sens", "Descendant", "descendant"],
    ];
    for (const [id, reglage, ancien, attendu] of cas) {
      const p = registre.trouverDef(id)?.parametres?.find((x) => x.nom === reglage);
      expect(p, `${id}·${reglage}`).toBeDefined();
      expect(valeurCanoniqueChoix(p!, ancien), `${id} · ${ancien}`).toBe(attendu);
    }
  });

  it("AUCUN AUTRE FICHIER N'ÉCRIT LA LISTE, au masculin ni au féminin", () => {
    // LA FORME CHERCHÉE EST CELLE D'UNE LISTE DE SENS, l'aller-retour compris : « Montante » et
    // « Descendante » seuls sont aussi la pente d'un passage par zéro, et « Montant » un mode de
    // Magenta parmi cinq, deux autres choses que ce garde n'a pas à voir.
    const forme = /\[\s*"Montante?",\s*"Descendante?",\s*"Aller-retour"/;
    const fautifs = sources(RACINE)
      .filter((c) => !c.endsWith(MOI) && forme.test(readFileSync(c, "utf8")))
      .map((c) => c.slice(RACINE.length + 1));
    expect(fautifs, "prendre `choixSensArpege` de `audio/sens-arpege.ts`").toEqual([]);
    expect(forme.test(`options: ["Montante", "Descendante", "Aller-retour"]`)).toBe(true);
  });
});
