// tests-e2e/racines-liens-dans-electron.spec.ts — Un lien posé dans une racine du pont ne mène plus
// au dehors, dans l'application elle-même.
//
// ═══ CE QUE CETTE ÉPREUVE TIENT ═══
//
// Décision de Fabien du 2026-11-19 (« Réparer d'abord »), avant d'ouvrir les racines à `config.json`.
// `electron/capacites-chemins.test.ts` tient la comparaison sur de vrais liens ; reste le pont lui-même,
// que le rendu appelle. Le profil jetable est une racine (`userData`), et une jonction y est posée vers
// un dossier qui n'en est pas une :
//   — écrire, copier et supprimer à travers elle sont refusés, et le dehors n'est pas touché ;
//   — écrire dans le profil lui-même passe toujours.
//
// UNE JONCTION, et non un lien symbolique : elle se pose sous Windows sans aucun droit, ce qui en
// fait le cas qu'un attaquant aurait sous la main. L'épreuve est donc propre à Windows.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effacerProfil, profilAvec } from "./demarrage-electron";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");

type Pont = {
  ecrireFichier: (c: string, b: string) => Promise<string | null>;
  copierFichier: (s: string, c: string) => Promise<unknown>;
  supprimerFichier: (c: string) => Promise<unknown>;
};

test.describe("un lien dans une racine du pont, dans Electron", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(process.platform !== "win32", "La jonction est propre à Windows ; les liens de Linux sont tenus par les cas unitaires.");
  test.setTimeout(300_000);

  test("ÉCRIRE, COPIER ET SUPPRIMER À TRAVERS UNE JONCTION SONT REFUSÉS, ET LE DEHORS N'EST PAS TOUCHÉ", async () => {
    const profil = profilAvec(null);
    const dehors = mkdtempSync(join(tmpdir(), "attic-dehors-"));
    const app = await electron.launch({ args: [RACINE, `--user-data-dir=${profil}`], cwd: RACINE, env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" } });
    try {
      const page = await app.firstWindow();
      await page.waitForSelector(".attic-app", { timeout: 60_000 });
      writeFileSync(join(dehors, "secret.txt"), "secret");
      mkdirSync(join(profil, "dedans"), { recursive: true });
      writeFileSync(join(profil, "dedans", "source.txt"), "source");
      symlinkSync(dehors, join(profil, "lien"), "junction");

      const r = await page.evaluate(async ({ profil }) => {
        const api = (window as unknown as { api: Pont }).api;
        const j = (...p: string[]) => p.join("\\");
        return {
          ecrireDehors: await api.ecrireFichier(j(profil, "lien", "fuite.txt"), "fuite"),
          ecrireSousDossierDehors: await api.ecrireFichier(j(profil, "lien", "neuf", "fuite.txt"), "fuite"),
          copierDehors: await api.copierFichier(j(profil, "dedans", "source.txt"), j(profil, "lien", "copie.txt")).catch((e) => String(e)),
          supprimerDehors: await api.supprimerFichier(j(profil, "lien", "secret.txt")).catch((e) => String(e)),
          ecrireDedans: await api.ecrireFichier(j(profil, "dedans", "vrai.txt"), "vrai"),
        };
      }, { profil });

      expect(r.ecrireDehors, "écrire à travers la jonction").toBeNull();
      expect(r.ecrireSousDossierDehors, "créer un dossier à travers la jonction").toBeNull();
      expect(existsSync(join(dehors, "fuite.txt"))).toBe(false);
      expect(existsSync(join(dehors, "neuf"))).toBe(false);
      expect(existsSync(join(dehors, "copie.txt")), `copier à travers la jonction (${JSON.stringify(r.copierDehors)})`).toBe(false);
      expect(readFileSync(join(dehors, "secret.txt"), "utf8"), `supprimer à travers la jonction (${JSON.stringify(r.supprimerDehors)})`).toBe("secret");
      // CE QUI EST VRAIMENT DANS LE PROFIL S'ÉCRIT TOUJOURS.
      expect(r.ecrireDedans).toBe(join(profil, "dedans", "vrai.txt"));
      expect(readFileSync(join(profil, "dedans", "vrai.txt"), "utf8")).toBe("vrai");
    } finally {
      await app.close().catch(() => {});
      await effacerProfil(profil);
      await effacerProfil(dehors);
    }
  });
});
