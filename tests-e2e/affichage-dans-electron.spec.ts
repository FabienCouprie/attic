// tests-e2e/affichage-dans-electron.spec.ts — La clé `affichage`, propre à Linux, ne touche pas
// l'application sous Windows.
//
// ═══ CE QUE CETTE ÉPREUVE TIENT, ET CE QU'ELLE NE PEUT PAS TENIR ═══
//
// Pièce C6 du plan du fichier de configuration (2026-11-19). Sous Linux, la clé pose `--ozone-platform`
// avant que l'application soit prête ; aucune construction Linux n'existe, et ce chemin n'est pas
// vérifié (`electron/affichage-linux.cjs`). Ce qui se vérifie ici, sur la vraie ligne de commande de
// Chromium : un fichier recopié d'une machine Linux, qui demande X11, ne pose aucune option sous
// Windows, et l'application démarre.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effacerProfil, profilAvec } from "./demarrage-electron";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");

test.describe("l'affichage sous Linux, vu de Windows", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(process.platform !== "win32", "L'épreuve tient le côté Windows ; Linux n'a pas de construction.");
  test.setTimeout(300_000);

  test("UNE SECTION LINUX QUI DEMANDE X11 NE POSE AUCUNE OPTION SOUS WINDOWS", async () => {
    const profil = profilAvec(JSON.stringify({ linux: { affichage: "x11" } }));
    const app = await electron.launch({ args: [RACINE, `--user-data-dir=${profil}`], cwd: RACINE, env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" } });
    try {
      const page = await app.firstWindow();
      await page.waitForSelector(".attic-app", { timeout: 60_000 });
      expect(await app.evaluate(({ app: a }) => a.commandLine.hasSwitch("ozone-platform"))).toBe(false);
      const recue = await page.evaluate(() => (window as unknown as { api: { configuration: () => Promise<{ problemes: unknown[] }> } }).api.configuration());
      expect(recue.problemes, "la section de l'autre système est ignorée sans message").toEqual([]);
    } finally {
      await app.close().catch(() => {});
      await effacerProfil(profil);
    }
  });
});
