// tests-e2e/entree-audio-lecteur.spec.ts — Le lecteur de l'entrée audio ne paraît qu'après le run.
//
// Demandé par Fabien le 2026-09-22 : le lecteur s'affichait dès le fichier chargé, et aucune
// réinitialisation ne l'effaçait, si bien qu'il se confondait avec un résultat. Il suit désormais
// le statut du nœud, ce qui ne se teste que dans l'application : le statut vit dans le magasin de
// l'interface, pas dans les données du nœud.
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

const arete = (source: string, target: string, port = 0) =>
  ({ id: `${source}-${target}-${port}`, source, target, sourceHandle: "out:0", targetHandle: `in:${port}` });

/** Un WAV d'une seconde, chargé par le vrai champ fichier du nœud. */
const CHARGER = `
  const sr = 44100, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 8000, true);
  const f = new File([buf], "essai.wav", { type: "audio/wav" });
  const input = document.querySelector('.react-flow__node[data-id="in"] input[type=file]');
  const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
`;

test.describe("entrée audio : le lecteur suit le statut", () => {
  test("rien au chargement, un lecteur après le run, plus rien après la réinitialisation", async ({ page }) => {
    test.setTimeout(120000);
    const graphe = {
      nodes: [
        { id: "in", position: { x: 0, y: 0 }, data: { ficheId: "entree-audio", parametres: {} } },
        { id: "trem", position: { x: 350, y: 0 }, data: { ficheId: "tremolo", parametres: {} } },
      ],
      edges: [{ id: "e", source: "in", target: "trem", sourceHandle: "out:0", targetHandle: "in:0" }],
    };
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 2, { timeout: 15000 });

    const lecteurs = () => page.evaluate(() => ({
      entree: document.querySelectorAll('.react-flow__node[data-id="in"] audio').length,
      effet: document.querySelectorAll('.react-flow__node[data-id="trem"] audio').length,
      nomFichier: document.querySelector('.react-flow__node[data-id="in"] .attic-node-fichier-nom')?.textContent ?? "",
    }));

    await page.evaluate(CHARGER);
    await page.waitForFunction(() => !!document.querySelector('.react-flow__node[data-id="in"] .attic-node-fichier-nom'), null, { timeout: 10000 });
    const charge = await lecteurs();
    expect(charge.nomFichier).toBe("essai.wav"); // le fichier est bien là
    expect(charge.entree).toBe(0); // mais il ne s'écoute pas encore

    await page.click(".attic-btn-lancer");
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node[data-id="trem"] audio').length > 0, null, { timeout: 60000 });
    expect(await lecteurs()).toMatchObject({ entree: 1, effet: 1 });

    await page.click('button[title*="Réinitialiser"], button[title*="Reset"]');
    await page.waitForTimeout(1500);
    const apres = await lecteurs();
    expect(apres).toMatchObject({ entree: 0, effet: 0 });
    expect(apres.nomFichier).toBe("essai.wav"); // le fichier, lui, reste chargé
  });
});
