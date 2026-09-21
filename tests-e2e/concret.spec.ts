// tests-e2e/concret.spec.ts — Vitesse variable, convolution de deux sons, résonateurs, dans l'application.
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

// Exécute un graphe, puis lit le WAV d'aperçu du nœud « x » : durée, canaux, et le signal lui-même.
async function executer(page: any, graphe: unknown) {
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 2, { timeout: 15000 });
  await page.keyboard.press(" ");
  await page.waitForFunction(() => !!(document.querySelector('.react-flow__node[data-id="x"] audio') as HTMLAudioElement | null)?.src,
    null, { timeout: 90000 });
  return page.evaluate(async () => {
    const lire = async (id: string) => {
      const a = document.querySelector(`.react-flow__node[data-id="${id}"] audio`) as HTMLAudioElement | null;
      if (!a?.src) return null;
      const ab = await (await fetch(a.src)).arrayBuffer();
      const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(ab);
      // La crête sur TOUS les canaux : c'est elle que les nœuds ramènent au niveau de l'entrée.
      let pic = 0;
      for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) pic = Math.max(pic, Math.abs(v));
      return { duree: b.duration, sr: b.sampleRate, pic };
    };
    const noeud = document.querySelector('.react-flow__node[data-id="x"]') as HTMLElement;
    return { x: await lire("x"), source: await lire("src"), texte: noeud.innerText, erreur: noeud.className.includes("erreur") };
  });
}

const n = (id: string, ficheId: string, x: number, y: number, parametres: Record<string, unknown> = {}) =>
  ({ id, position: { x, y }, data: { ficheId, parametres } });
const e = (source: string, target: string, port: number) =>
  ({ id: `${source}-${target}-${port}`, source, target, sourceHandle: "out:0", targetHandle: `in:${port}` });

test.describe("les outils de la musique concrète", () => {
  test("LA VITESSE VARIABLE : une octave plus bas, deux fois plus long", async ({ page }) => {
    test.setTimeout(120000);
    const r = await executer(page, {
      nodes: [n("src", "oscillateur", 0, 0), n("x", "vitesse-variable", 360, 0, { Transposition: -12 })],
      edges: [e("src", "x", 0)],
    });
    console.log("vitesse:", JSON.stringify(r));
    expect(r.erreur).toBe(false);
    // L'oscillateur n'a pas d'aperçu : la durée de la source se lit dans le message du nœud.
    const [avant, apres] = /([\d.]+) s → ([\d.]+) s/.exec(r.texte)!.slice(1).map(Number);
    expect(Math.abs(apres / avant - 2)).toBeLessThan(0.01);
    expect(Math.abs(r.x.duree - apres)).toBeLessThan(0.01);
  });

  test("LA VITESSE VARIABLE SOUS UNE COURBE : la durée tombe entre les deux extrêmes", async ({ page }) => {
    test.setTimeout(120000);
    const r = await executer(page, {
      nodes: [n("src", "oscillateur", 0, 0), n("c", "generateur-courbe", 0, 300), n("x", "vitesse-variable", 360, 0)],
      edges: [e("src", "x", 0), e("c", "x", 1)],
    });
    console.log("vitesse courbe:", JSON.stringify(r));
    expect(r.erreur).toBe(false);
    const [avant, apres] = /([\d.]+) s → ([\d.]+) s/.exec(r.texte)!.slice(1).map(Number);
    const rapport = apres / avant;
    // Entre +12 (moitié) et −12 (double), selon la forme de la courbe : jamais aux extrêmes eux-mêmes.
    expect(rapport).toBeGreaterThan(0.5);
    expect(rapport).toBeLessThan(2);
  });

  test("LA CONVOLUTION : deux sons, leurs durées s'additionnent, le niveau est celui du premier", async ({ page }) => {
    test.setTimeout(120000);
    const r = await executer(page, {
      nodes: [n("src", "generateur-bruit", 0, 0), n("b", "oscillateur", 0, 300), n("x", "convolution-deux-sons", 360, 0)],
      edges: [e("src", "x", 0), e("b", "x", 1)],
    });
    console.log("convolution:", JSON.stringify(r));
    expect(r.erreur).toBe(false);
    expect(r.x.duree).toBeGreaterThan(r.source.duree * 1.5);
    expect(Math.abs(r.x.pic - r.source.pic)).toBeLessThan(0.02);
  });

  test("LES RÉSONATEURS : un bruit devient un accord, et la queue laisse sonner la résonance", async ({ page }) => {
    test.setTimeout(120000);
    const r = await executer(page, {
      nodes: [n("src", "generateur-bruit", 0, 0), n("x", "resonateurs", 360, 0, { Structure: "accord", Intervalles: "0 4 7", "Résonance": 2 })],
      edges: [e("src", "x", 0)],
    });
    console.log("résonateurs:", JSON.stringify(r));
    expect(r.erreur).toBe(false);
    expect(Math.abs(r.x.duree - (r.source.duree + 2))).toBeLessThan(0.01);
    expect(r.texte).toMatch(/12 résonateurs|12 resonators/);
    expect(Math.abs(r.x.pic - r.source.pic)).toBeLessThan(0.02);
  });
});
