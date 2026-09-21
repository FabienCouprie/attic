// tests-e2e/automate-2d.spec.ts — L automate cellulaire en 2D, dans l application.
//
// CE QUI EST VERIFIE NE SE TESTE PAS HORS DE REACT : le rendu depend de l etat du GRAPHE — une
// arete branchee ou non sur un port de type courbe —, pas des seules donnees du noeud. Les deux
// cas sont donc joues dans l application, avec le meme graphe a une arete pres.
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

test.describe("automate cellulaire 2D, dans l'application", () => {
  for (const topologie of ["2D Conway", "2D Highlife"]) {
    test(`${topologie} : une séquence qui dure 32 pas et bouge`, async ({ page }) => {
      test.setTimeout(120000);
      const graphe = { nodes: [{ id: "x", position: { x: 0, y: 0 }, data: { ficheId: "automate-cellulaire", parametres: { Topologie: topologie } } }], edges: [] };
      await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
      await page.goto(devUrl);
      await page.waitForSelector(".attic-app", { timeout: 20000 });
      await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 1, { timeout: 15000 });
      await page.keyboard.press(" ");
      await page.waitForFunction(() => !!(document.querySelector('.react-flow__node[data-id="x"] audio') as HTMLAudioElement | null)?.src, null, { timeout: 90000 });
      const r = await page.evaluate(async () => {
        const a = document.querySelector('.react-flow__node[data-id="x"] audio') as HTMLAudioElement;
        const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(a.src)).arrayBuffer());
        // Combien de fenêtres de 250 ms contiennent du son : une seule note n'en remplirait qu'une ou deux.
        const x = b.getChannelData(0), pas = Math.round(0.25 * b.sampleRate);
        let actives = 0;
        for (let d = 0; d + pas <= x.length; d += pas) { let e = 0; for (let i = d; i < d + pas; i++) e += x[i] * x[i]; if (e / pas > 1e-6) actives++; }
        const n = document.querySelector('.react-flow__node[data-id="x"]') as HTMLElement;
        return { duree: b.duration, actives, erreur: n.className.includes("erreur") };
      });
      console.log(topologie, JSON.stringify(r));
      expect(r.erreur).toBe(false);
      // 32 pas de 0,2 s par défaut : 6,4 s, et du son dans presque toutes les fenêtres — une seule
      // note, le défaut signalé, n'en remplissait qu'une.
      expect(Math.abs(r.duree - 6.4)).toBeLessThan(0.3);
      expect(r.actives / Math.floor(r.duree / 0.25)).toBeGreaterThan(0.85);
    });
  }
});
