// tests-e2e/inference-onnx-dans-application.spec.ts — Les inférences ONNX de la page, dans
// l'application construite, sans réseau.
//
// CE QUE CETTE ÉPREUVE GARDE. « Débruitage IA » et le séparateur MDX-Net calculent par
// `workers/inference-onnx-worker.ts`, qui charge le wasm d'onnxruntime livré dans `dist/`. Le banc
// le prouve sur le serveur de développement ; il ne voit ni le build, ni le protocole de
// l'application, ni sa politique de sécurité, qui doivent tous trois laisser le worker charger ce
// wasm. Avant le 2026-11-06, ce wasm venait de jsdelivr : coupé du réseau, les deux composants
// échouaient sur « no available backend found ».
//
// TOUT CE QUI N'EST PAS LOCAL EST COUPÉ, et les adresses coupées sont relevées : le cas tombe si
// l'une d'elles est un fichier d'onnxruntime, ou si un des deux composants ne rend pas de son.
//
// LE SON VIENT D'UN MÉTRONOME, comme dans `convertir-voix-dans-application.spec.ts` : « Entrée
// audio » réclamerait un dialogue système que rien ne pilote ici. La qualité se mesure au banc.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MODELES = ["gtcrn.onnx", "modele-separation.onnx"].map((m) => join(RACINE, "public", "oonx", m));
const LOCAL = /^(https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/|data:|blob:|file:|devtools:|attic-)/;

test.describe("les inférences ONNX de la page, dans l'application", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!MODELES.every(existsSync), "Modèles absents de public/oonx : gtcrn et modele-separation.");
  test.setTimeout(300000);

  test("LE DÉBRUITAGE ET LE SÉPARATEUR MDX RENDENT DU SON, LE RÉSEAU COUPÉ", async () => {
    const profil = mkdtempSync(join(tmpdir(), "attic-onnx-"));
    const app = await electron.launch({
      args: [RACINE, `--user-data-dir=${profil}`],
      env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
    });
    const coupees: string[] = [];
    try {
      await app.context().route((url) => !LOCAL.test(url.href), (route) => {
        coupees.push(route.request().url());
        return route.abort("internetdisconnected");
      });
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(() => {
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [
            { id: "src", position: { x: 0, y: 0 },
              data: { ficheId: "metronome", parametres: { "Tempo": 120, "Durée": 4 } } },
            { id: "dbr", position: { x: 360, y: 0 },
              data: { ficheId: "debruitage-ia", parametres: {} } },
            { id: "sep", position: { x: 360, y: 260 },
              data: { ficheId: "separateur-ia", parametres: { "Modèle": "MDX-Net" } } },
          ],
          edges: [
            { id: "e1", source: "src", target: "dbr", sourceHandle: "out:0", targetHandle: "in:0" },
            { id: "e2", source: "src", target: "sep", sourceHandle: "out:0", targetHandle: "in:0" },
          ],
        }));
      });
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      await page.locator('[data-id="sep"]').waitFor({ timeout: 60000 });
      await page.getByRole("button", { name: /Lancer|Run/ }).click();

      // LA FIN SE LIT DANS LES RÉSULTATS DU MOTEUR, les deux nœuds y ayant chacun une entrée.
      await page.waitForFunction(() => {
        const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown> } })
          .__attic_execution__?.resultats;
        return r instanceof Map && r.has("dbr") && r.has("sep");
      }, undefined, { timeout: 240000 });
      const rendu = await page.evaluate(() => {
        const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown> } })
          .__attic_execution__!.resultats!;
        const duree = (v: unknown) => {
          const b = v as AudioBuffer | null;
          return b && typeof b.numberOfChannels === "number" ? b.duration : null;
        };
        const liste = (v: unknown) => (Array.isArray(v) ? v : [v]);
        const sep = liste(r.get("sep"));
        return { debruite: duree(liste(r.get("dbr"))[0]), voix: duree(sep[2]), autre: duree(sep[3]) };
      });
      const textes = {
        dbr: await page.locator('[data-id="dbr"]').innerText(),
        sep: await page.locator('[data-id="sep"]').innerText(),
      };
      console.log(`\nrendu : ${JSON.stringify(rendu)}\ncoupées (${coupees.length}) :${coupees.map((u) => `\n  ${u}`).join("")}\n`);

      expect(coupees.filter((u) => /onnxruntime|ort-wasm/.test(u)), "un fichier d'onnxruntime vient du réseau").toEqual([]);
      expect(rendu.debruite, `« Débruitage IA » n'a pas rendu de son : ${textes.dbr}`).not.toBe(null);
      expect(rendu.voix, `le séparateur n'a pas rendu la voix : ${textes.sep}`).not.toBe(null);
      expect(rendu.autre, `le séparateur n'a pas rendu le reste : ${textes.sep}`).not.toBe(null);
    } finally {
      await app.close();
    }
  });
});
