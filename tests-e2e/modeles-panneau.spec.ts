// tests-e2e/modeles-panneau.spec.ts — Le panneau des modèles IA, dans l'application.
//
// CE QUI NE SE TESTE PAS AILLEURS : l'icône ne parle qu'au processus principal, qui n'existe pas
// dans un navigateur. On pose donc une fausse `window.api` avant le démarrage — un inventaire
// figé —, et l'on vérifie ce que l'utilisateur voit et ce qu'un clic demande vraiment. La règle
// qui décide du contenu de la liste est testée à part (src/ui/etat-modeles.test.ts).
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5175";

async function waitForServer(url: string, retries = 120): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch { /* pas encore la */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

test.beforeAll(async () => {
  if (process.env.DEV_URL) { await waitForServer(devUrl); return; }
  const port = 5175;
  devUrl = `http://localhost:${port}`;
  devServer = spawn("cmd", ["/c", "npm", "run", "dev", "--", "--port", String(port)], { cwd: process.cwd(), stdio: "pipe" });
  let log = "";
  devServer.stdout?.on("data", (d) => { log += d.toString(); });
  devServer.stderr?.on("data", (d) => { log += d.toString(); });
  for (let i = 0; i < 160; i++) {
    if (log.includes(`http://localhost:${port}`)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await waitForServer(devUrl);
});

test.afterAll(async () => {
  if (devServer) {
    devServer.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1000));
    if (devServer.exitCode === null) devServer.kill("SIGKILL");
  }
});

/** Un inventaire où il manque les deux gros modèles, un petit à moitié, et un sans adresse. */
const FAUSSE_API = () => {
  (window as any).__appels = [];
  (window as any).api = {
    modelesEtat: async () => ({
      complets: 1, total: 5, octetsAPrendre: 1429146601,
      manquants: ["stable-audio-3", "sdxs-512", "separation-mdx"], sansAdresse: ["genre"],
      modeles: [
        { id: "stable-audio-3", nom: "Stable Audio 3 (musique)", octets: 719000000, complet: false, partiel: false, telechargeable: true },
        { id: "sdxs-512", nom: "Texte vers image", octets: 680441863, complet: false, partiel: false, telechargeable: true },
        { id: "separation-mdx", nom: "Separation voix/instrumental", octets: 29704738, complet: false, partiel: true, telechargeable: true },
        { id: "genre", nom: "Classement par genre", octets: 94843658, complet: false, partiel: false, telechargeable: false },
        { id: "gtcrn", nom: "Debruitage IA", octets: 352084, complet: true, partiel: false, telechargeable: true },
      ],
    }),
    modelesTelecharger: async (ids: string[] | undefined) => { (window as any).__appels.push(ids ?? "tout"); return { ok: true }; },
    modelesProgression: () => () => {},
    modelesAnnuler: async () => ({ ok: true }),
  };
};

test.describe("panneau des modèles IA", () => {
  test("LISTE CE QUI MANQUE, DU PLUS LOURD AU PLUS LÉGER, ET NE PREND QUE CE QU'ON DEMANDE", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(FAUSSE_API);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });

    // La pastille annonce les trois modèles à prendre.
    const icone = page.locator(".attic-barre-outils button", { has: page.locator("svg rect") }).filter({ hasText: "3" }).first();
    await expect(icone).toBeVisible({ timeout: 10000 });
    await icone.click();

    const lignes = page.locator(".attic-modeles-ligne .attic-modeles-nom");
    await expect(lignes).toHaveCount(3, { timeout: 5000 });
    expect(await lignes.allTextContents()).toEqual([
      "Stable Audio 3 (musique)", "Texte vers image", "Separation voix/instrumental",
    ]);
    // Les poids sont dits avant de cliquer, et celui qui n'a pas d'adresse est signalé à part.
    const poids = await page.locator(".attic-modeles-ligne .attic-modeles-poids").allTextContents();
    expect(poids[0]).toMatch(/686 (Mo|MB)/); // le poids est dit avant de cliquer
    await expect(page.locator(".attic-modeles-vide")).toContainText(/1/);
    await expect(page.locator(".attic-modeles-tout")).toContainText(/3/);

    // Un clic sur une ligne ne prend QUE ce modèle-là.
    await page.locator(".attic-modeles-ligne").nth(2).click();
    expect(await page.evaluate(() => (window as any).__appels)).toEqual([["separation-mdx"]]);
    await expect(page.locator(".attic-modeles-panneau")).toHaveCount(0);

    // Et « tout prendre » n'envoie aucun identifiant : le processus principal prend le reste.
    await icone.click();
    await page.locator(".attic-modeles-tout").click();
    expect(await page.evaluate(() => (window as any).__appels)).toEqual([["separation-mdx"], "tout"]);
  });
});
