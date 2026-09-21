// tests-e2e/spectral-cdp.spec.ts — Les six nœuds spectraux et les peignes, dans l'application.
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

async function executer(page: any, graphe: { nodes: any[]; edges: any[] }) {
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction((n: number) => document.querySelectorAll(".react-flow__node").length >= n, graphe.nodes.length, { timeout: 15000 });
  await page.keyboard.press(" ");
  await page.waitForFunction(() => !!(document.querySelector('.react-flow__node[data-id="x"] audio') as HTMLAudioElement | null)?.src, null, { timeout: 90000 });
  return page.evaluate(async () => {
    const lire = async (id: string) => {
      const a = document.querySelector(`.react-flow__node[data-id="${id}"] audio`) as HTMLAudioElement | null;
      if (!a?.src) return null;
      const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(a.src)).arrayBuffer());
      let pic = 0;
      for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) pic = Math.max(pic, Math.abs(v));
      return { duree: b.duration, pic };
    };
    const nd = document.querySelector('.react-flow__node[data-id="x"]') as HTMLElement;
    return { x: await lire("x"), src: await lire("src"), erreur: nd.className.includes("erreur"), texte: nd.innerText };
  });
}

const n = (id: string, ficheId: string, x: number, y: number, parametres: Record<string, unknown> = {}) =>
  ({ id, position: { x, y }, data: { ficheId, parametres } });
const e = (source: string, target: string, entree: number) =>
  ({ id: `${source}-${target}-${entree}`, source, target, sourceHandle: "out:0", targetHandle: `in:${entree}` });

const CAS: { ficheId: string; source: string; second?: string; memeDuree: boolean }[] = [
  { ficheId: "etirement-spectre", source: "generateur-bruit", memeDuree: true },
  { ficheId: "arpege-spectral", source: "generateur-bruit", memeDuree: true },
  { ficheId: "melange-fenetres", source: "generateur-bruit", memeDuree: true },
  { ficheId: "crible-harmonique", source: "generateur-bruit", memeDuree: true },
  { ficheId: "filtrage-spectre", source: "generateur-bruit", second: "oscillateur", memeDuree: true },
  { ficheId: "peignes-accordes", source: "generateur-bruit", memeDuree: false },
];

test.describe("les nœuds spectraux, dans l'application", () => {
  for (const c of CAS) {
    test(`${c.ficheId} rend du son${c.memeDuree ? ", à la durée de la source" : ""}`, async ({ page }) => {
      test.setTimeout(120000);
      const nodes = [n("src", c.source, 0, 0), n("x", c.ficheId, 380, 0)];
      const edges = [e("src", "x", 0)];
      if (c.second) { nodes.push(n("b", c.second, 0, 300)); edges.push(e("b", "x", 1)); }
      const r = await executer(page, { nodes, edges });
      console.log(c.ficheId, JSON.stringify({ x: r.x, src: r.src }));
      expect(r.erreur).toBe(false);
      expect(r.x!.pic).toBeGreaterThan(0.001);
      if (c.memeDuree) expect(Math.abs(r.x!.duree - r.src!.duree)).toBeLessThan(0.01);
      // Les peignes laissent sonner leur résonance : 3 s de plus, par défaut.
      else expect(Math.abs(r.x!.duree - (r.src!.duree + 3))).toBeLessThan(0.01);
    });
  }
});
