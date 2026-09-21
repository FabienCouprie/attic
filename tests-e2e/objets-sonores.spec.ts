// tests-e2e/objets-sonores.spec.ts — Découpage en objets, réordonnancement et montage, dans l'application.
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

// Exécute un graphe et rend, pour chaque nœud nommé, son message et la durée de son aperçu.
async function executer(page: any, graphe: { nodes: any[]; edges: any[] }, attendre: string) {
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction((n: number) => document.querySelectorAll(".react-flow__node").length >= n, graphe.nodes.length, { timeout: 15000 });
  await page.keyboard.press(" ");
  await page.waitForFunction((id: string) => !!(document.querySelector(`.react-flow__node[data-id="${id}"] audio`) as HTMLAudioElement | null)?.src,
    attendre, { timeout: 90000 });
  await page.waitForTimeout(500);
  return page.evaluate(async (ids: string[]) => {
    const r: Record<string, { texte: string; duree: number | null; erreur: boolean }> = {};
    for (const id of ids) {
      const n = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
      const a = n.querySelector("audio") as HTMLAudioElement | null;
      let duree: number | null = null;
      if (a?.src) {
        const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(a.src)).arrayBuffer());
        duree = b.duration;
      }
      r[id] = { texte: n.innerText, duree, erreur: n.className.includes("erreur") };
    }
    return r;
  }, graphe.nodes.map((x) => x.id));
}

const n = (id: string, ficheId: string, x: number, y: number, parametres: Record<string, unknown> = {}) =>
  ({ id, position: { x, y }, data: { ficheId, parametres } });
const e = (source: string, target: string, sortie: number, entree: number) =>
  ({ id: `${source}-${sortie}-${target}-${entree}`, source, target, sourceHandle: `out:${sortie}`, targetHandle: `in:${entree}` });

test.describe("objets sonores et montage", () => {
  test("HUIT CLICS, HUIT OBJETS ; réordonnés, ils redonnent un son de même durée", async ({ page }) => {
    test.setTimeout(120000);
    const r = await executer(page, {
      nodes: [
        n("src", "metronome", 0, 0, { Tempo: 120, "Durée": 4 }),
        n("dec", "decoupage-objets", 340, 0, { "Critère": "attaques" }),
        n("ord", "reordonner-objets", 700, 0, { Ordre: "sonie", Espace: 0 }),
      ],
      edges: [e("src", "dec", 0, 0), e("dec", "ord", 0, 0), e("dec", "ord", 1, 1)],
    }, "ord");
    console.log(JSON.stringify(r, null, 1));
    expect(r.dec.erreur).toBe(false);
    expect(r.dec.texte).toMatch(/8\sobjets/);
    expect(r.ord.erreur).toBe(false);
    expect(r.ord.texte).toMatch(/8\sobjets/);
    // Les objets vont d'une attaque à la suivante : sans espace, ils recouvrent le son depuis la
    // première attaque — à la durée du début muet près.
    expect(Math.abs(r.ord.duree! - r.dec.duree!)).toBeLessThan(0.1);
  });

  test("LE MONTAGE POSE CHAQUE PISTE À SON INSTANT", async ({ page }) => {
    test.setTimeout(120000);
    const r = await executer(page, {
      nodes: [
        n("a", "metronome", 0, 0, { "Durée": 2 }),
        n("b", "metronome", 0, 300, { "Durée": 3 }),
        n("mon", "montage", 360, 0, { "Début 1": 0, "Début 2": 5.5 }),
      ],
      edges: [e("a", "mon", 0, 0), e("b", "mon", 0, 1)],
    }, "mon");
    console.log(JSON.stringify(r, null, 1));
    expect(r.mon.erreur).toBe(false);
    expect(r.mon.texte).toMatch(/2\spistes/);
    // La seconde piste commence à 5,5 s et dure 3 s : 8,5 s en tout.
    expect(Math.abs(r.mon.duree! - 8.5)).toBeLessThan(0.02);
  });

  test("LA LIGNE DE TEMPS MONTRE LES PISTES À LEUR PLACE, ET SE RÈGLE À LA SOURIS", async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.addInitScript(() => { try { localStorage.setItem("attic-inspecteur-largeur", "900"); } catch { /* */ } });
    await executer(page, {
      nodes: [
        n("a", "metronome", 0, 0, { "Durée": 2 }),
        n("b", "metronome", 0, 300, { "Durée": 3 }),
        n("mon", "montage", 360, 0, { "Début 1": 0, "Début 2": 5.5, "Fondu entrée 2": 200 }),
      ],
      edges: [e("a", "mon", 0, 0), e("b", "mon", 0, 1)],
    }, "mon");
    await page.evaluate(() => {
      const nd = document.querySelector('.react-flow__node[data-id="mon"]') as HTMLElement;
      const r = nd.getBoundingClientRect();
      for (const type of ["mousedown", "mouseup", "click"]) nd.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + 10 }));
    });
    await page.waitForSelector(".ligne-temps-barre", { timeout: 5000 });
    const etat = () => page.evaluate(() => ({
      barres: [...document.querySelectorAll(".ligne-temps-barre")].map((b) => ({ x: +(b.getAttribute("x") ?? 0), w: +(b.getAttribute("width") ?? 0) })),
      inconnues: document.querySelectorAll(".ligne-temps-inconnue").length,
      labels: [...document.querySelectorAll(".inspecteur-param label")].map((l) => (l as HTMLElement).innerText.trim()),
      valeurs: Object.fromEntries([...document.querySelectorAll(".inspecteur-param")].map((d) => [
        (d.querySelector("label") as HTMLElement)?.innerText.trim(),
        (d.querySelector('input[type="number"], input:not([type="range"])') as HTMLInputElement | null)?.value])),
    }));
    const avant = await etat();
    console.log("avant:", JSON.stringify(avant));
    expect(avant.barres).toHaveLength(2);
    expect(avant.inconnues).toBe(0);
    // Durées réelles, 2 s et 3 s : des largeurs dans le rapport 2/3 ; la seconde commence à 5,5 s.
    const pxParS = avant.barres[0].w / 2;
    expect(Math.abs(avant.barres[1].w / avant.barres[0].w - 1.5)).toBeLessThan(0.02);
    expect(Math.abs((avant.barres[1].x - avant.barres[0].x) / pxParS - 5.5)).toBeLessThan(0.02);
    // Les réglages des pistes vides sont cachés.
    expect(avant.labels).toContain("Début 2");
    expect(avant.labels).toContain("Fondu sortie 2");
    expect(avant.labels).not.toContain("Début 3");
    expect(avant.labels).not.toContain("Fondu");

    // Tirer la seconde barre de 100 px vers la gauche.
    const barre = page.locator(".ligne-temps-barre").nth(1);
    const b = (await barre.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 100, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
    // L'échelle se recalcule une fois le geste fini : on la relit avant le suivant.
    const milieu = await etat();
    const pxParS2 = milieu.barres[0].w / 2;
    // Tirer la poignée du fondu d'entrée de la seconde piste de 50 px vers la droite.
    const poignee = page.locator(".ligne-temps-poignee").nth(2);
    const q = (await poignee.boundingBox())!;
    await page.mouse.move(q.x + q.width / 2, q.y + q.height / 2);
    await page.mouse.down();
    await page.mouse.move(q.x + q.width / 2 + 50, q.y + q.height / 2, { steps: 6 });
    await page.mouse.up();
    const apres = await etat();
    console.log("après:", JSON.stringify(apres.valeurs));
    const debut2 = Number(String(apres.valeurs["Début 2"]).replace(",", "."));
    const fondu2 = Number(String(apres.valeurs["Fondu entrée 2"]).replace(",", "."));
    expect(Math.abs(debut2 - (5.5 - 100 / pxParS))).toBeLessThan(0.03);
    expect(Math.abs(fondu2 - (200 + 1000 * 50 / pxParS2))).toBeLessThan(30);
    await page.screenshot({ path: "test-results/ligne-de-temps.png" });
  });
});
