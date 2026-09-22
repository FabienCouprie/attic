// tests-e2e/explorateur-musique.spec.ts — Choisir une piste dans l'explorateur de musique.
//
// LE DÉFAUT SIGNALÉ PAR FABIEN : à la première sélection, le nœud rend une erreur, et la liste
// revient visuellement sur la première piste. Le nœud ne parle qu'au processus principal, qui
// n'existe pas dans un navigateur : on pose donc une fausse `window.api` — un dossier de trois
// pistes — et l'on choisit, comme on le ferait à la main.
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

/** Trois pistes sur le disque, et un WAV d'une seconde pour chacune. */
const FAUSSE_API = () => {
  const sr = 44100, n = sr;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 8000, true);
  const octets = new Uint8Array(buf);
  (window as any).__lectures = [];
  (window as any).api = {
    lireDossier: async () => [
      { nom: "une.wav", chemin: "music collection/une.wav" },
      { nom: "deux.wav", chemin: "music collection/deux.wav" },
      { nom: "trois.wav", chemin: "music collection/trois.wav" },
    ],
    lireFichierAudio: async (chemin: string) => {
      (window as any).__lectures.push(chemin);
      return { url: "", donnees: octets, nom: String(chemin).split("/").pop() };
    },
    choisirDossier: async () => null,
  };
};

const GRAPHE = { nodes: [{ id: "x", position: { x: 60, y: 40 }, width: 320, height: 380, data: { ficheId: "explorateur-musique", parametres: { Chemin: "music collection" } } }], edges: [] };

test.describe("explorateur de musique", () => {
  test("LA PREMIÈRE PISTE CHOISIE EST CELLE QU'ON GARDE, ET LE GRAPHE LA LIT", async ({ page }) => {
    test.setTimeout(180000);
    await page.addInitScript(FAUSSE_API);
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(GRAPHE)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    const noeud = page.locator('.react-flow__node[data-id="x"]');
    await expect(noeud).toBeVisible({ timeout: 15000 });

    // On ouvre le dossier, puis on choisit la PREMIÈRE piste — le cas qui échouait.
    await noeud.locator(".attic-node-fichier-btn").first().click();
    const liste = noeud.locator("select.attic-node-select");
    await expect(liste.locator("option")).toHaveCount(3, { timeout: 10000 });
    // Avant tout choix, AUCUNE piste ne doit paraître choisie : une ligne en surbrillance qu'on
    // n'a pas désignée fait croire que le nœud tient déjà un fichier.
    expect(await liste.evaluate((e: HTMLSelectElement) => e.selectedIndex)).toBe(-1);
    await liste.locator("option").first().click();

    // Elle reste choisie à l'écran…
    await expect(liste).toHaveValue("0", { timeout: 5000 });
    const lectures = await page.evaluate(() => (window as any).__lectures);
    console.log("LECTURES " + JSON.stringify(lectures));
    expect(lectures).toEqual(["music collection/une.wav"]);

    // …et le nœud la lit vraiment : l'exécution ne dit pas « aucun fichier ».
    await page.click(".attic-btn-lancer");
    await page.waitForFunction(() => {
      const n = document.querySelector('.react-flow__node[data-id="x"]');
      return !!n?.querySelector(".attic-node-statut-puce.termine, .attic-node-statut-puce.erreur");
    }, null, { timeout: 60000 });
    const r = await page.evaluate(() => {
      const n = document.querySelector('.react-flow__node[data-id="x"]') as HTMLElement;
      return { texte: n.innerText.replace(/\s+/g, " "), erreur: !!n.querySelector(".attic-node-statut-puce.erreur") };
    });
    console.log(JSON.stringify(r));
    expect(r.erreur).toBe(false);
    expect(r.texte).not.toMatch(/Aucun fichier|No file/);
  });

  test("CHOISIR UNE AUTRE PISTE LA GARDE AUSSI", async ({ page }) => {
    test.setTimeout(180000);
    await page.addInitScript(FAUSSE_API);
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(GRAPHE)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    const noeud = page.locator('.react-flow__node[data-id="x"]');
    await noeud.locator(".attic-node-fichier-btn").first().click();
    const liste = noeud.locator("select.attic-node-select");
    await expect(liste.locator("option")).toHaveCount(3, { timeout: 10000 });
    await liste.locator("option").nth(2).click();
    await expect(liste).toHaveValue("2", { timeout: 5000 });
    expect(await page.evaluate(() => (window as any).__lectures)).toEqual(["music collection/trois.wav"]);
  });
});
