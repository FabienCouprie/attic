import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5230);

test.describe("UI states", () => {
  test("palette can be collapsed and expanded", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".palette", { timeout: 10000 });

    // Open palette shows title, search and collapse button
    await expect(page.locator(".palette-titre")).toContainText("Catalog");
    await expect(page.locator(".palette-toggle")).toHaveAttribute("title", "Replier la palette");

    // Collapse the palette
    await page.click(".palette-toggle");
    await page.waitForSelector(".palette--repliee", { timeout: 3000 });

    // The app grid should now reserve only 40px for the palette
    const grid = await page.evaluate(() => {
      const app = document.querySelector(".attic-app");
      return app ? getComputedStyle(app).gridTemplateColumns : "";
    });
    expect(grid.trim().startsWith("40px")).toBe(true);

    // Expand the palette again
    await page.click(".palette-toggle--repliee");
    await page.waitForSelector(".palette-titre", { timeout: 3000 });
    await expect(page.locator(".palette-titre")).toContainText("Catalog");
  });

  test("running node gets a pulsing outline", async ({ page }) => {
    // Seed a graph with one node before the page loads
    const graph = JSON.stringify({
      nodes: [{ id: "n1", position: { x: 100, y: 100 }, data: { ficheId: "entree-audio", parametres: {} } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    await page.addInitScript((g: string) => {
      localStorage.setItem("attic-encours", g);
    }, graph);

    await page.goto(devUrl);
    await page.waitForSelector('.react-flow__node[data-id="n1"]', { timeout: 10000 });

    // Replace the plugin execution with a slow, observable one
    await page.evaluate(async () => {
      const mod = await import("/src/audio/adaptateur.ts");
      const def = mod.registre.trouverDef("entree-audio");
      if (!def) throw new Error("entree-audio not found in registry");
      (def as any).executer = async (ctx: any) => {
        ctx.onProgress("Running for test…");
        await new Promise((r) => setTimeout(r, 2000));
        return { valeurs: [null] };
      };
    });

    // Click the "run this block" button on the node
    await page.click('.react-flow__node[data-id="n1"] .attic-node-btn-prio');

    // The node should now have the visual running class
    await page.waitForSelector('.react-flow__node[data-id="n1"] .attic-node.running', { timeout: 3000 });
    await expect(page.locator('.react-flow__node[data-id="n1"] .attic-node.running')).toBeVisible();
  });
});
