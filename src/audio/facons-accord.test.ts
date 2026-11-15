// audio/facons-accord.test.ts — Une table de la façon de jouer un accord, et chaque écriture d'avant se relit.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { registre } from "./adaptateur";
import { valeurCanoniqueChoix } from "../i18n";
import { normaliserModeVoix } from "./automate-cellulaire-reglages";
import { FACONS_ACCORD, LIBELLES_HERITES_FACONS, choixFaconOuMelodie, faconDe } from "./facons-accord";

const RACINE = resolve(__dirname, "..");

function sources(dossier: string, trouves: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) { sources(chemin, trouves); continue; }
    if ((nom.endsWith(".ts") || nom.endsWith(".tsx")) && !nom.includes(".test.")) trouves.push(chemin);
  }
  return trouves;
}

describe("la façon de jouer un accord", () => {
  it("chaque écriture se lit, et la mélodie n'est pas une façon", () => {
    FACONS_ACCORD.ids.forEach((id, i) => {
      expect(faconDe(id)).toBe(id);
      expect(faconDe(FACONS_ACCORD.fr[i])).toBe(id);
      expect(faconDe(FACONS_ACCORD.en[i])).toBe(id);
    });
    for (const [ecriture, id] of Object.entries(LIBELLES_HERITES_FACONS)) expect(faconDe(ecriture), ecriture).toBe(id);
    expect(faconDe("melodie")).toBeUndefined();
    expect(faconDe("Mélodie")).toBeUndefined();
  });

  it("« Mélodie » se pose au rang que le composant lui donnait", () => {
    expect(choixFaconOuMelodie(["plaque", "arpege"]).optionIds).toEqual(["melodie", "plaque", "arpege"]);
    expect(choixFaconOuMelodie(["plaque", "arpege"], 1).optionIds).toEqual(["plaque", "melodie", "arpege"]);
    expect(choixFaconOuMelodie(["plaque", "arpege"], 1).options).toEqual(["Plaqué", "Mélodie", "Arpégé"]);
  });

  it("UN PROJET ANCIEN ROUVRE SUR SA FAÇON, dans chacun des huit composants", () => {
    const cas: [string, string, string, string][] = [
      ["accords-joues", "Façon", "Struck", "plaque"],
      ["tonal-grille", "Mode", "block", "plaque"], ["tonal-grille", "Mode", "arpeggio", "arpege"],
      ["camelot", "Mode", "bloc", "plaque"], ["camelot", "Mode", "Arpège", "arpege"],
      ["sequenceur-accords", "Mode", "harmonie", "plaque"], ["sequenceur-accords", "Mode", "Harmony", "plaque"],
      ["palette-harmonique", "Mode", "harmonie", "plaque"], ["palette-harmonique", "Mode", "Mélodie", "melodie"],
      ["dessin-sonore", "Mode", "Harmonie", "plaque"], ["dessin-sonore", "Mode", "arpege", "arpege"],
      ["color-looper", "Mode", "arpeges", "arpege"], ["color-looper", "Mode", "Arpèges", "arpege"],
      ["automate-cellulaire", "Mode voix", "Polyphonie", "plaque"], ["automate-cellulaire", "Mode voix", "Mélodie", "melodie"],
      ["automate-cellulaire", "Mode voix", "Arpège", "arpege"],
    ];
    for (const [id, reglage, ancien, attendu] of cas) {
      const p = registre.trouverDef(id)?.parametres?.find((x) => x.nom === reglage);
      expect(p, `${id}·${reglage}`).toBeDefined();
      expect(valeurCanoniqueChoix(p!, ancien), `${id} · ${ancien}`).toBe(attendu);
    }
  });

  it("L'AUTOMATE LIT LES IDENTIFIANTS NEUFS : « melodie » sans accent n'est pas une polyphonie", () => {
    expect(normaliserModeVoix("plaque")).toBe("Polyphonie");
    expect(normaliserModeVoix("melodie")).toBe("Mélodie");
    expect(normaliserModeVoix("arpege")).toBe("Arpège");
    expect(normaliserModeVoix("Melody")).toBe("Mélodie");
  });

  it("AUCUN COMPOSANT NE RECONNAÎT PLUS UNE FAÇON À UN MORCEAU DE MOT", () => {
    // Trois composants reconnaissaient l'harmonie à « harm » : devenue `plaque`, elle les aurait fait
    // jouer une mélodie sans que rien ne le dise.
    const fautifs = sources(join(RACINE, "plugins"))
      .filter((c) => /\.includes\("(harm|arp)"\)/.test(readFileSync(c, "utf8")))
      .map((c) => c.slice(RACINE.length + 1));
    expect(fautifs, "lire la valeur par `faconDe` de `audio/facons-accord.ts`").toEqual([]);
  });
});
