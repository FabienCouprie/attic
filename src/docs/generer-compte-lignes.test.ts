// src/docs/generer-compte-lignes.test.ts — Le décompte versionné ne vieillit plus en silence.
//
// POURQUOI CE TEST. `LINE-COUNT.md` était le seul des cinq inventaires que rien ne tenait : aucun
// script ne le régénérait, aucun test ne le relisait. Il annonçait des fichiers disparus et
// ignorait les nouveaux. Un fichier engendré que rien ne régénère vaut moins qu'un fichier absent,
// parce qu'on le croit.
//
// DEUX GARDES, comme pour les autres tables. La première refuse un fichier périmé. La seconde
// éprouve le comptage lui-même, sur des cas construits : un fichier sans saut de ligne final compte
// quand même sa dernière ligne, et le tri met le plus lourd en tête.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SEUIL_LIGNES, compterLignes, tableEnTexte } from "./compte-lignes";

const RACINE = resolve(__dirname, "../..");
const CHEMIN = resolve(RACINE, "LINE-COUNT.md");
const ecrire = process.env.ECRIRE_LIGNES === "1";

describe("le comptage", () => {
  const comptes = compterLignes(RACINE);

  it("trouve les fichiers de `src/`, et rien d'autre", () => {
    expect(comptes.length).toBeGreaterThan(200);
    for (const c of comptes) {
      expect(c.fichier.startsWith("src/"), c.fichier).toBe(true);
      expect(/\.(ts|tsx|css)$/.test(c.fichier), c.fichier).toBe(true);
    }
  });

  it("range du plus lourd au plus léger", () => {
    for (let i = 1; i < comptes.length; i++) {
      expect(comptes[i - 1].lignes).toBeGreaterThanOrEqual(comptes[i].lignes);
    }
  });

  it("compte un fichier connu, pour que le chiffre veuille dire quelque chose", () => {
    // `audio/note.ts` ne porte que des types : son décompte se vérifie à la main sans peine.
    const note = comptes.find((c) => c.fichier === "src/audio/note.ts");
    expect(note, "src/audio/note.ts est introuvable").toBeDefined();
    const reel = readFileSync(resolve(RACINE, "src/audio/note.ts"), "utf8").split("\n").length;
    expect(note!.lignes).toBe(reel);
  });

  it("n'oublie aucune ligne dans le total annoncé", () => {
    // Le tableau ne liste que les gros fichiers ; le texte doit dire ce que pèsent les autres,
    // sans quoi la somme serait fausse et l'on croirait le dépôt plus petit qu'il n'est.
    const total = comptes.reduce((s, c) => s + c.lignes, 0);
    const texte = tableEnTexte(comptes);
    expect(texte).toContain(`${comptes.length} files, ${total} lines`);
    const gros = comptes.filter((c) => c.lignes >= SEUIL_LIGNES);
    const reste = total - gros.reduce((s, c) => s + c.lignes, 0);
    expect(texte).toContain(`${comptes.length - gros.length} account for ${reste} lines`);
  });
});

describe("la table versionnée", () => {
  it("elle est à jour", () => {
    const texte = tableEnTexte(compterLignes(RACINE));
    if (ecrire) {
      writeFileSync(CHEMIN, texte, "utf8");
      return;
    }
    expect(existsSync(CHEMIN),
      "LINE-COUNT.md est absent : lancez « npm run docs:lignes »").toBe(true);
    expect(readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n"), [
      "LINE-COUNT.md ne correspond plus à src/.",
      "C'est normal dès qu'un fichier grossit : lancez « npm run docs:lignes » et versionnez.",
      "Ne le corrigez pas à la main.",
    ].join("\n")).toBe(texte);
  });
});
