// tests-e2e/dossier-modeles-dans-electron.spec.ts — Le dossier des modèles, choisi par `config.json`,
// dans l'application elle-même.
//
// ═══ CE QUE CETTE ÉPREUVE TIENT, ET QU'AUCUN CAS UNITAIRE NE PEUT TENIR ═══
//
// Pièce C3 du plan du fichier de configuration (2026-11-19). `electron/configuration.test.ts` tient
// le défaut et la lecture, `electron/dossier-ressources.test.ts` la migration ; reste le fil entre les
// deux, dans `main.cjs`, que seul Electron fait courir. Ce que le gestionnaire de modèles reçoit
// (`modeles:etat`, son champ `dossier`) est le dossier que les nœuds lisent :
//   — sans fichier, c'est celui du profil, comme avant ;
//   — écrit, et absent, l'ancien y est renommé avec ce qu'il porte ;
//   — écrit, et déjà là, il sert, et l'ancien reste où il était.
//
// UN PROFIL JETABLE PAR LANCEMENT, et un dossier de modèles jetable sur le même disque : le renommage
// entre deux disques est refusé par le système, et `dossier-ressources.test.ts` tient ce cas.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effacerProfil, profilAvec } from "./demarrage-electron";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const TEMOIN = join("oonx", "temoin-c3.txt");

/** Lance l'application sur ce profil, et rend le dossier que le gestionnaire de modèles reçoit. */
async function dossierServi(profil: string): Promise<string> {
  const app = await electron.launch({ args: [RACINE, `--user-data-dir=${profil}`], cwd: RACINE, env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" } });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    return await page.evaluate(async () => (await (window as unknown as { api: { modelesEtat: () => Promise<{ dossier: string }> } }).api.modelesEtat()).dossier);
  } finally {
    await app.close().catch(() => {});
  }
}

/** Pose un fichier témoin dans un dossier de modèles. */
function poserTemoin(dossier: string, contenu: string) {
  mkdirSync(join(dossier, "oonx"), { recursive: true });
  writeFileSync(join(dossier, TEMOIN), contenu);
}

test.describe("le dossier des modèles, choisi par config.json, dans Electron", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(process.platform !== "win32", "Les chemins de l'épreuve sont ceux de Windows ; Linux n'a pas de construction.");
  test.setTimeout(300_000);

  test("SANS FICHIER, LE DOSSIER DU PROFIL, COMME AVANT, ET LE FICHIER PROPOSÉ LE MONTRE", async () => {
    const profil = profilAvec(null);
    try {
      const attendu = join(profil, "ressources");
      expect(await dossierServi(profil)).toBe(attendu);
      expect(JSON.parse(readFileSync(join(profil, "config.propose.json"), "utf8")).windows.dossierModeles).toBe(attendu);
    } finally {
      await effacerProfil(profil);
    }
  });

  test("ÉCRIT ET ABSENT, L'ANCIEN DOSSIER Y EST RENOMMÉ AVEC CE QU'IL PORTE", async () => {
    const ailleurs = mkdtempSync(join(tmpdir(), "attic-modeles-"));
    const voulu = join(ailleurs, "modeles");
    const profil = profilAvec(JSON.stringify({ windows: { dossierModeles: voulu.replace(/\\/g, "/") } }));
    try {
      poserTemoin(join(profil, "ressources"), "ancien");
      expect(await dossierServi(profil)).toBe(voulu);
      expect(readFileSync(join(voulu, TEMOIN), "utf8"), "le témoin doit avoir suivi le renommage").toBe("ancien");
      expect(existsSync(join(profil, "ressources")), "l'ancien dossier doit avoir été renommé").toBe(false);
    } finally {
      await effacerProfil(profil);
      await effacerProfil(ailleurs);
    }
  });

  test("ÉCRIT ET DÉJÀ LÀ, IL SERT, ET L'ANCIEN RESTE OÙ IL ÉTAIT", async () => {
    const ailleurs = mkdtempSync(join(tmpdir(), "attic-modeles-"));
    const profil = profilAvec(JSON.stringify({ windows: { dossierModeles: ailleurs } }));
    try {
      poserTemoin(join(profil, "ressources"), "ancien");
      poserTemoin(ailleurs, "nouveau");
      expect(await dossierServi(profil)).toBe(ailleurs);
      expect(readFileSync(join(ailleurs, TEMOIN), "utf8")).toBe("nouveau");
      expect(readFileSync(join(profil, "ressources", TEMOIN), "utf8"), "l'ancien ne doit pas être touché").toBe("ancien");
    } finally {
      await effacerProfil(profil);
      await effacerProfil(ailleurs);
    }
  });
});
