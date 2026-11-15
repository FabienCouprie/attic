// audio/mono-stereo.test.ts — Une seule écriture du choix mono ou stéréo, et les anciennes se relisent.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { registre } from "./adaptateur";
import { valeurCanoniqueChoix } from "../i18n";
import { LIBELLES_HERITES_MONO_STEREO, MONO_STEREO, canauxDe, choixMonoStereo } from "./mono-stereo";

const RACINE = resolve(__dirname, "..");
const MOI = join("audio", "mono-stereo.ts");

function sources(dossier: string, trouves: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) { sources(chemin, trouves); continue; }
    if ((nom.endsWith(".ts") || nom.endsWith(".tsx")) && !nom.includes(".test.")) trouves.push(chemin);
  }
  return trouves;
}

describe("le choix mono ou stéréo", () => {
  it("rend les trois listes appariées, mono d'abord", () => {
    const c = choixMonoStereo();
    expect(c.optionIds).toEqual(["mono", "stereo"]);
    expect(c.options).toEqual(["Mono", "Stéréo"]);
    expect(c.optionsEn).toEqual(["Mono", "Stereo"]);
  });

  it("le nombre de canaux se lit sous chaque écriture, et une inconnue prend ce que l'appelant dit", () => {
    for (const [ecriture, id] of Object.entries(LIBELLES_HERITES_MONO_STEREO)) {
      expect(canauxDe(ecriture), ecriture).toBe(id === "stereo" ? 2 : 1);
    }
    expect(canauxDe(2)).toBe(2);
    expect(canauxDe("illisible")).toBe(1);
    expect(canauxDe("illisible", 2)).toBe(2);
  });

  it("UN PROJET CSOUND ENREGISTRÉ EN `1` OU `2` ROUVRE SUR SON NOMBRE DE CANAUX", () => {
    // Les quatre « Canaux » de Csound enregistraient le nombre ; ils enregistrent désormais l'identifiant.
    for (const [id, reglage] of [["csound", "Canaux"], ["csound-instrument", "Canaux"], ["csound-effet", "Canaux"], ["orchestre-csound", "Canaux"]]) {
      const p = registre.trouverDef(id)?.parametres?.find((x) => x.nom === reglage);
      expect(p, `${id}·${reglage}`).toBeDefined();
      expect(valeurCanoniqueChoix(p!, "1")).toBe("mono");
      expect(valeurCanoniqueChoix(p!, "2")).toBe("stereo");
      expect(valeurCanoniqueChoix(p!, "Stéréo")).toBe("stereo");
    }
  });

  it("AUCUN AUTRE FICHIER N'ÉCRIT LA PAIRE, ni ne compare à « mono » ou à « stereo »", () => {
    // Douze réglages l'écrivaient à la main, sous deux vocabulaires ; une comparaison en clair se
    // désaccorderait de la table au premier identifiant changé, comme `parseInt("stereo")` l'aurait fait.
    const fautifs: string[] = [];
    for (const chemin of sources(RACINE)) {
      if (chemin.endsWith(MOI)) continue;
      const texte = readFileSync(chemin, "utf8");
      if (texte.includes(`"${MONO_STEREO.fr[0]}", "${MONO_STEREO.fr[1]}"`)) fautifs.push(`${chemin.slice(RACINE.length + 1)} : la paire écrite`);
      if (/===\s*"(mono|stereo)"/.test(texte)) fautifs.push(`${chemin.slice(RACINE.length + 1)} : une comparaison en clair`);
    }
    expect(fautifs, "prendre `choixMonoStereo` et `canauxDe` de `audio/mono-stereo.ts`").toEqual([]);
  });
});
