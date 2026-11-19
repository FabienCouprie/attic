// tests-e2e/configuration-dans-electron.spec.ts — Le fichier de configuration, lu par l'application
// elle-même, au démarrage.
//
// ═══ CE QUE CETTE ÉPREUVE TIENT, ET QU'AUCUN CAS UNITAIRE NE PEUT TENIR ═══
//
// Pièce C0 du plan du fichier de configuration (2026-11-19). `electron/configuration.cjs` est éprouvé
// seul, système injecté ; reste ce que seul Electron dit :
//   — `userData` répond AVANT que l'application soit prête, `--user-data-dir` compris : la lecture
//     se fait là, parce qu'une option de démarrage de Chromium ne se pose qu'avant. Le chemin que
//     l'interface reçoit doit donc être dans le profil de l'épreuve ;
//   — un fichier faux n'empêche pas l'application de démarrer, et son problème paraît, dans le
//     journal du processus principal comme dans ce que l'interface reçoit ;
//   — `config.propose.json` est écrit à côté, à chaque lancement.
//
// UN PROFIL JETABLE PAR LANCEMENT : un démarrage sur le profil de la personne y efface ce que son
// application installée a posé. L'interface vient de `dist/`, le processus principal est lu en direct.
//
// LE JOURNAL SE LIT SUR UN LANCEMENT À PART, par `demarrage-electron.ts` : le processus principal
// écrit ses problèmes au chargement de son module, avant que Playwright ne branche son écoute.
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { effacerProfil, journalDeDemarrage, profilAvec } from "./demarrage-electron";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const LIGNE = /\[attic\] configuration/;

interface Recue { fichier: string; chemin?: string; problemes: { code: string; cle?: string; ligne?: number }[] }

/** Lance l'application sur ce profil, et rend ce que l'interface reçoit et le fichier proposé. */
async function lancerAvec(config: string | null): Promise<{ recue: Recue; profil: string; propose: string | null }> {
  const profil = profilAvec(config);
  let app: ElectronApplication | null = null;
  try {
    app = await electron.launch({ args: [RACINE, `--user-data-dir=${profil}`], cwd: RACINE, env: { ...process.env, NODE_ENV: "" } });
    const page = await app.firstWindow();
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    const recue = await page.evaluate(() => (window as unknown as { api: { configuration: () => Promise<unknown> } }).api.configuration()) as Recue;
    const cheminPropose = join(profil, "config.propose.json");
    return { recue, profil, propose: existsSync(cheminPropose) ? readFileSync(cheminPropose, "utf8") : null };
  } finally {
    await app?.close();
    await effacerProfil(profil);
  }
}

test.describe("le fichier de configuration, dans Electron", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(300_000);

  test("SANS FICHIER, L'APPLICATION DÉMARRE, LIT DANS SON PROFIL, ET PROPOSE LE FICHIER DE CETTE MACHINE", async () => {
    const { recue, profil, propose } = await lancerAvec(null);
    expect(recue.fichier).toBe("absent");
    expect(recue.problemes).toEqual([]);
    expect(recue.chemin, "`userData` doit répondre avant que l'application soit prête, profil compris").toBe(join(profil, "config.json"));
    expect(propose, "config.propose.json doit être écrit à chaque lancement").not.toBeNull();
    const section = process.platform === "win32" ? "windows" : "linux";
    expect(Object.keys(JSON.parse(propose!))).toEqual([section]);
  });

  test("UN FICHIER FAUX N'EMPÊCHE PAS LE DÉMARRAGE, et son problème paraît, avec sa ligne", async () => {
    const faux = "{\n  \"uneCle\": 1,\n  \"autre\" 2\n}\n";
    const { recue } = await lancerAvec(faux);
    expect(recue.fichier).toBe("lu");
    expect(recue.problemes[0]).toMatchObject({ code: "syntaxe", ligne: 3 });
    expect(await journalDeDemarrage(RACINE, faux, LIGNE), "le journal du processus principal doit le dire")
      .toMatch(/\[attic\] configuration .*JSON valide \(ligne 3\)/);
  });

  test("UNE CLÉ INCONNUE EST NOMMÉE, et l'application démarre", async () => {
    const inconnue = JSON.stringify({ plafondPaquet: 2 });
    const { recue } = await lancerAvec(inconnue);
    expect(recue.problemes).toEqual([{ code: "inconnue", cle: "plafondPaquet", section: "commun" }]);
    expect(await journalDeDemarrage(RACINE, inconnue, LIGNE)).toMatch(/clé inconnue « plafondPaquet »/);
  });
});
