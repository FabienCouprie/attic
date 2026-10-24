// tests-e2e/detacher-fichier.spec.ts — Le × du nom de fichier détache le projet sans toucher au canevas.
//
// Il n'y avait aucun moyen de repartir d'un « nouveau projet » en gardant le graphe :
// le seul bouton qui oubliait le fichier vidait aussi le canevas. Ce test tient les deux
// moitiés de la promesse — le nom s'en va, les nœuds restent — et l'annulation par Ctrl+Z.
import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5210);

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
