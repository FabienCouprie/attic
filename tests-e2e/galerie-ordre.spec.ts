// tests-e2e/galerie-ordre.spec.ts — La galerie s'accroche-t-elle dans l'ordre des coordonnées ?
//
// Le tri est testé à part, sur des listes ; ce qui se vérifie ici est la chaîne entière dans le vrai
// moteur : des coordonnées entrent par le port, et l'ordre des pistes CHANGE DANS LE HTML ÉCRIT.
// C'est le seul endroit où le résultat se lit tel que l'utilisateur l'aura.
//
// Un port différent de celui de Fabien (5175), dont le serveur ne doit pas être touché.
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5192";

async function waitForServer(url: string, retries = 120): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch { /* pas encore la */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

test.beforeAll(async () => {
  if (process.env.DEV_URL) { await waitForServer(devUrl); return; }
  const port = 5192;
  devUrl = `http://localhost:${port}`;
  devServer = spawn("cmd", ["/c", "npm", "run", "dev", "--", "--port", String(port)], { cwd: process.cwd(), stdio: "pipe" });
  let log = "";
  devServer.stdout?.on("data", (d) => { log += d.toString(); });
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

/** Un faux Electron : trois MP3 dans un dossier, et ce qu'on écrit est retenu. */
const STUB = () => {
  (window as any).__ecrits = [];
  (window as any).api = {
    lireDossier: async () => [
      { nom: "charlie.mp3", chemin: "C:/mus/charlie.mp3" },
      { nom: "alpha.mp3", chemin: "C:/mus/alpha.mp3" },
      { nom: "bravo.mp3", chemin: "C:/mus/bravo.mp3" },
    ],
    ecrireFichier: async (chemin: string, contenu: string) => {
      (window as any).__ecrits.push({ chemin, contenu });
      return true;
    },
    copierFichier: async () => true,
  };
};

/** L'ordre d'apparition des pistes dans le HTML écrit. */
const ordreDuHtml = (html: string): string[] => {
  const vus: string[] = [];
  for (const m of html.matchAll(/mp3\/([a-z]+\.mp3)/g)) {
    if (!vus.includes(m[1])) vus.push(m[1]);
  }
  return vus;
};

function graphe(sens: string, coordonnees: string | null) {
  const nodes: any[] = [
    { id: "gal", position: { x: 400, y: 0 },
      data: { ficheId: "galerie-exposition", parametres: {
        "Titre": "Essai", "Répertoire MP3": "C:/mus", "Répertoire de sortie": "C:/sortie",
        "Ordre": sens, "Graine visuelle": 7 } } },
  ];
  const edges: any[] = [];
  if (coordonnees !== null) {
    nodes.push({ id: "src", position: { x: 0, y: 0 },
      data: { ficheId: "source-texte", parametres: { "Texte": coordonnees } } });
    edges.push({ id: "e", source: "src", target: "gal", sourceHandle: "out:0", targetHandle: "in:0" });
  }
  return { nodes, edges };
}

async function lancer(page: any, g: unknown) {
  await page.addInitScript(STUB);
  await page.addInitScript(([j]: string[]) => { localStorage.setItem("attic-encours", j); }, [JSON.stringify(g)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.click(".attic-btn-lancer");
  await page.waitForFunction(() => (window as any).__ecrits?.length >= 1, null, { timeout: 60000 });
  return page.evaluate(() => (window as any).__ecrits[0].contenu);
}

// Alpha au bout du plan, bravo au milieu, charlie \u00e0 l'origine : l'ordre par X est l'inverse de
// l'ordre du dossier, ce qui rend la diff\u00e9rence impossible \u00e0 confondre avec un tri alphab\u00e9tique.
const COORDS = JSON.stringify([
  { nom: "alpha.mp3", chemin: "C:/mus/alpha.mp3", x: 9, y: 0 },
  { nom: "bravo.mp3", chemin: "C:/mus/bravo.mp3", x: 5, y: 2 },
  { nom: "charlie.mp3", chemin: "C:/mus/charlie.mp3", x: 1, y: 8 },
]);

test.describe("galerie d'exposition : l'ordre d'accrochage", () => {
  test("sans coordonnées branchées, l'ordre du dossier est gardé", async ({ page }) => {
    test.setTimeout(180000);
    const html = await lancer(page, graphe("Coordonnées : X puis Y", null));
    expect(ordreDuHtml(html)).toEqual(["charlie.mp3", "alpha.mp3", "bravo.mp3"]);
  });

  test("avec des coordonnées, les pistes s'accrochent par X croissant", async ({ page }) => {
    test.setTimeout(180000);
    const html = await lancer(page, graphe("Coordonnées : X puis Y", COORDS));
    console.log("ordre X→Y : " + ordreDuHtml(html).join(", "));
    expect(ordreDuHtml(html)).toEqual(["charlie.mp3", "bravo.mp3", "alpha.mp3"]);
  });

  test("l'autre axe mène : par Y croissant, l'ordre s'inverse", async ({ page }) => {
    test.setTimeout(180000);
    const html = await lancer(page, graphe("Coordonnées : Y puis X", COORDS));
    console.log("ordre Y→X : " + ordreDuHtml(html).join(", "));
    expect(ordreDuHtml(html)).toEqual(["alpha.mp3", "bravo.mp3", "charlie.mp3"]);
  });

  test("« Du dossier » ignore les coordonnées branchées", async ({ page }) => {
    test.setTimeout(180000);
    const html = await lancer(page, graphe("Du dossier", COORDS));
    expect(ordreDuHtml(html)).toEqual(["charlie.mp3", "alpha.mp3", "bravo.mp3"]);
  });
});
