// tests-e2e/sauvegarde-sous-sanction.spec.ts — Un projet qu'aucun dialogue n'a désigné s'enregistre encore.
//
// ═══ POURQUOI CETTE ÉPREUVE ═══
//
// La sanction par racines est armée depuis le 2026-10-27 : le pont refuse d'écrire hors des
// dossiers qu'un dialogue a désignés. Or un projet ouvert par DÉPÔT, par le sélecteur de fichiers,
// ou rouvert d'une session d'avant la version 5.1, tient son chemin d'ailleurs que d'un dialogue du
// processus principal. Avant ce lot, Ctrl+S y aurait écrit en vain, SANS RIEN DIRE : le retour du
// pont était ignoré.
//
// CE QUI EST TENU ICI, dans l'application construite et sanction armée : Ctrl+S sur un tel projet
// ouvre le dialogue d'enregistrement prérempli avec le même chemin, et l'accepter écrit le fichier.
// Le dialogue est remplacé par un témoin qui note ce qu'on lui propose et rend ce même chemin.
//
// RIEN N'EST ÉCRIT HORS D'UN PROFIL ET D'UN DOSSIER JETABLES.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");

test.describe("la sauvegarde, sanction armée", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(120000);

  test("CTRL+S HORS RACINE OUVRE LE DIALOGUE PRÉREMPLI, ET L'ACCEPTER ÉCRIT LE PROJET", async () => {
    const profil = mkdtempSync(join(tmpdir(), "attic-sauve-profil-"));
    const ailleurs = mkdtempSync(join(tmpdir(), "attic-sauve-ailleurs-"));
    const projet = join(ailleurs, "depose.json");
    const app = await electron.launch({
      args: [RACINE, `--user-data-dir=${profil}`],
      // LA SANCTION N'EST PAS POSÉE : elle est armée PAR DÉFAUT, et c'est ce qu'on éprouve.
      env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
    });
    try {
      // Le témoin du dialogue d'enregistrement : il note le chemin proposé et le rend tel quel.
      await app.evaluate(({ dialog }) => {
        const etat = globalThis as Record<string, unknown>;
        etat.__propose__ = [];
        (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async (x: unknown, y?: unknown) => {
          const o = (y ?? x) as { defaultPath?: string };
          (etat.__propose__ as string[]).push(String(o.defaultPath));
          return { canceled: false, filePath: o.defaultPath };
        };
      });
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      // UN PROJET « OUVERT PAR DÉPÔT » : son chemin est posé comme le fait l'ouverture, sans dialogue.
      await page.evaluate((chemin) => {
        localStorage.setItem("attic-current-file-path", chemin);
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [{ id: "g", position: { x: 0, y: 0 }, data: { ficheId: "generateur-frequence", parametres: {} } }],
          edges: [],
        }));
      }, projet);
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      await page.waitForSelector('.react-flow__node[data-id="g"]', { timeout: 30000 });

      // LE PONT REFUSE D'ABORD : c'est la condition du cas, et elle se vérifie avant de conclure.
      const directe = await page.evaluate(async (chemin) =>
        (globalThis as unknown as { api: { ecrireFichier: (c: string, d: string) => Promise<unknown> } }).api.ecrireFichier(chemin, "{}"),
      projet);
      expect(directe, "le pont a écrit hors racine : la sanction n'est pas armée, le cas ne prouverait rien").toBeNull();
      expect(existsSync(projet)).toBe(false);

      await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
      await page.keyboard.press("Control+s");
      await expect.poll(() => existsSync(projet), { timeout: 15000, message: "Ctrl+S n'a pas écrit le projet" }).toBe(true);
      const propose = await app.evaluate(() => (globalThis as Record<string, unknown>).__propose__ as string[]);
      expect(propose, "le dialogue n'a pas été proposé, ou pas avec le même chemin").toEqual([projet]);
      const ecrit = JSON.parse(readFileSync(projet, "utf8")) as { nodes: { id: string }[] };
      expect(ecrit.nodes.map((n) => n.id)).toContain("g");

      // ET LA RACINE EST ACCORDÉE : la sauvegarde suivante écrit directement, sans dialogue.
      const seconde = await page.evaluate(async (chemin) =>
        (globalThis as unknown as { api: { ecrireFichier: (c: string, d: string) => Promise<unknown> } }).api.ecrireFichier(chemin, "{}"),
      projet);
      expect(seconde, "le dialogue n'a pas accordé le dossier du projet").not.toBeNull();
    } finally {
      await app.close();
    }
  });
});
