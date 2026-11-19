// tests-e2e/calcul-dans-electron.spec.ts — Le sens d'« Automatique », posé par `config.json` au
// démarrage de l'application elle-même.
//
// ═══ CE QUE CETTE ÉPREUVE TIENT ═══
//
// Pièce C5 du plan du fichier de configuration (2026-11-19). `electron/calcul-automatique.test.ts`
// tient la table et les douze sites qui la consultent ; reste le fil dans `main.cjs`, qui pose la
// préférence avant tout moteur. Aucun moteur n'est lancé ici : ils demandent des modèles de plusieurs
// gigaoctets. Le processus principal dit, dans son journal, ce que vaut « Automatique » quand la clé
// le change, et cette ligne est lue par l'aide de C0, qui lance le binaire d'Electron.
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { journalDeDemarrage } from "./demarrage-electron";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const LIGNE = /\[attic\] calcul : .*\n/;

test.describe("le sens d'« Automatique », dans Electron", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(process.platform !== "win32", "DirectML et la carte sont ceux de Windows ; Linux n'a pas de construction.");
  test.setTimeout(300_000);

  test("« PROCESSEUR » MET LE PROCESSEUR DANS LES DEUX VOCABULAIRES", async () => {
    const journal = await journalDeDemarrage(RACINE, JSON.stringify({ calcul: "processeur" }), LIGNE);
    expect(journal.match(LIGNE)?.[0]).toMatch(/« CPU » pour les moteurs du pont et « processeur » pour DirectML/);
  });

  test("« CARTE » LAISSE LE MOTEUR DU PONT CHOISIR, ET IMPOSE LA CARTE À DIRECTML", async () => {
    const journal = await journalDeDemarrage(RACINE, JSON.stringify({ calcul: "carte" }), LIGNE);
    expect(journal.match(LIGNE)?.[0]).toMatch(/« le choix du moteur » pour les moteurs du pont et « carte » pour DirectML/);
  });
});
