// tests-e2e/koch.spec.ts — L arpège flocon de Koch, dans l application.
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

async function rendre(page: any, parametres: Record<string, unknown>) {
  const graphe = { nodes: [{ id: "x", position: { x: 0, y: 0 }, data: { ficheId: "arpege-koch", parametres } }], edges: [] };
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 1, { timeout: 15000 });
  await page.keyboard.press(" ");
  await page.waitForFunction(() => !!(document.querySelector('.react-flow__node[data-id="x"] audio') as HTMLAudioElement | null)?.src, null, { timeout: 90000 });
  return page.evaluate(async () => {
    const a = document.querySelector('.react-flow__node[data-id="x"] audio') as HTMLAudioElement;
    const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(a.src)).arrayBuffer());
    const x = b.getChannelData(0);
    let e = 0; for (const v of x) e += v * v;
    const n = document.querySelector('.react-flow__node[data-id="x"]') as HTMLElement;
    return { duree: b.duration, rms: Math.sqrt(e / x.length), erreur: n.className.includes("erreur"), empreinte: Array.from(x.subarray(22050, 22150)) };
  });
}

test.describe("arpège flocon de Koch, dans l'application", () => {
  test("RÉGLAGES PAR DÉFAUT : un cycle de 64 doubles-croches à 100 BPM, plus la note d'arrivée", async ({ page }) => {
    test.setTimeout(120000);
    const r = await rendre(page, {});
    console.log(JSON.stringify({ duree: r.duree, rms: r.rms }));
    expect(r.erreur).toBe(false);
    // 64 doubles-croches à 100 BPM : 9,6 s ; puis la note d'arrivée de la voix lente, un pas de
    // 2,4 s joué à 85 % (l'articulation par défaut) : le son s'arrête à 9,6 + 2,04 = 11,64 s.
    expect(Math.abs(r.duree - 11.64)).toBeLessThan(0.02);
    expect(r.rms).toBeGreaterThan(0.01);
  });

  test("LE TIMBRE CHANGE LE SON", async ({ browser }) => {
    test.setTimeout(120000);
    const douce = await rendre(await browser.newPage(), { Timbre: "douce" });
    const perc = await rendre(await browser.newPage(), { Timbre: "percutante" });
    const ecart = Math.max(...douce.empreinte.map((v: number, i: number) => Math.abs(v - perc.empreinte[i])));
    console.log("écart douce / percutante :", ecart);
    expect(ecart).toBeGreaterThan(0.01);
  });
});
