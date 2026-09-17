// tests-e2e/detacher-fichier.spec.ts — Le × du nom de fichier détache le projet sans toucher au canevas.
//
// Il n'y avait aucun moyen de repartir d'un « nouveau projet » en gardant le graphe :
// le seul bouton qui oubliait le fichier vidait aussi le canevas. Ce test tient les deux
// moitiés de la promesse — le nom s'en va, les nœuds restent — et l'annulation par Ctrl+Z.
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5179";

async function waitForServer(url: string, retries = 60): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

test.beforeAll(async () => {
  // Démarrer Vite dépasse largement le délai par défaut d'un hook (30 s).
  test.setTimeout(180_000);
  if (process.env.DEV_URL) {
    await waitForServer(devUrl);
    return;
  }
  const port = 5179;
  devUrl = `http://localhost:${port}`;
  devServer = spawn("cmd", ["/c", "npm", "run", "dev", "--", "--port", String(port)], { cwd: process.cwd(), stdio: "pipe" });
  let log = "";
  devServer.stdout?.on("data", (d) => { log += d.toString(); });
  devServer.stderr?.on("data", (d) => { log += d.toString(); });
  for (let i = 0; i < 80; i++) {
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

test.describe("détacher le projet de son fichier", () => {
  test("le × retire le nom du fichier, garde le canevas, et Ctrl+Z rattache", async ({ page }) => {
    const graphe = JSON.stringify({
      nodes: [
        { id: "n1", position: { x: 80, y: 80 }, data: { ficheId: "generateur-frequence", parametres: {} } },
        { id: "n2", position: { x: 420, y: 80 }, data: { ficheId: "sortie-audio", parametres: {} } },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    await page.addInitScript(([g, chemin]: string[]) => {
      localStorage.setItem("attic-encours", g);
      localStorage.setItem("attic-current-file-path", chemin);
    }, [graphe, "C:/projets/mon-morceau.json"]);

    await page.goto(devUrl);
    await page.waitForSelector('.react-flow__node[data-id="n1"]', { timeout: 15000 });
    await expect(page.locator(".attic-nom-fichier")).toContainText("mon-morceau.json");
    expect(await page.title()).toContain("mon-morceau.json");

    await page.click(".attic-nom-fichier-detacher");
    await expect(page.locator(".attic-nom-fichier")).toHaveCount(0);
    expect(await page.title()).toBe("Attic");
    // Le canevas n'a pas bougé : c'est toute la différence avec le ✕ de l'onglet.
    await expect(page.locator(".react-flow__node")).toHaveCount(2);

    await page.locator(".react-flow__pane").click({ position: { x: 40, y: 300 } });
    await page.keyboard.press("Control+z");
    await expect(page.locator(".attic-nom-fichier")).toContainText("mon-morceau.json");
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
  });

  test("le ✕ de l'onglet, lui, vide le canevas — et Ctrl+Z le rend", async ({ page }) => {
    const graphe = JSON.stringify({
      nodes: [{ id: "n1", position: { x: 80, y: 80 }, data: { ficheId: "generateur-frequence", parametres: {} } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    await page.addInitScript((g: string) => { localStorage.setItem("attic-encours", g); }, graphe);
    await page.goto(devUrl);
    await page.waitForSelector('.react-flow__node[data-id="n1"]', { timeout: 15000 });

    await page.click(".attic-onglet-fermer");
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    await page.locator(".react-flow__pane").click({ position: { x: 40, y: 300 } });
    await page.keyboard.press("Control+z");
    await expect(page.locator('.react-flow__node[data-id="n1"]')).toHaveCount(1);
  });
});
