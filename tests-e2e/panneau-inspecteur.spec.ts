// tests-e2e/panneau-inspecteur.spec.ts — L'inspecteur qu'on tire sur le canevas.
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

const GRAPHE = { nodes: [{ id: "mon", position: { x: 200, y: 100 }, data: { ficheId: "montage", parametres: {} } }], edges: [] };

async function ouvrir(page: any) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(GRAPHE)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 1, { timeout: 15000 });
  await page.evaluate(() => {
    const n = document.querySelector(".react-flow__node") as HTMLElement;
    const r = n.getBoundingClientRect();
    for (const type of ["mousedown", "mouseup", "click"]) n.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + 10 }));
  });
  await page.waitForSelector(".inspecteur-entete", { timeout: 5000 });
}

/**
 * ATTENDRE QUE LA VUE SE POSE, et c'est ce qui manquait au premier cas.
 *
 * React Flow cadre le graphe à l'ouverture, et ce cadrage est ANIMÉ : la transformation du canevas
 * change plusieurs fois dans les premières centaines de millisecondes. Mesuré sans toucher à rien,
 * à 1600 px : **trois changements en 121 ms, et le nœud dérive de 6,79 px tout seul** — de
 * `scale(1.55997)` à `scale(1.53571)`, qui est 43/28 exactement, la valeur posée.
 *
 * Le cas « tirer la poignée ne déplace pas le canevas » prenait son relevé d'avant PENDANT cette
 * animation, puis son relevé d'après une fois l'animation finie : il attribuait donc au geste une
 * dérive qui n'était pas la sienne, et la dérive variait d'un essai à l'autre — 1,24 px, 2,35 px,
 * 6,79 px — selon l'avancement de l'animation au moment du relevé. C'est le geste qui laissait à
 * l'animation le temps de finir, non le geste qui déplaçait quoi que ce soit.
 */
async function vueStabilisee(page: any): Promise<void> {
  await page.waitForFunction(() => {
    const vp = document.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!vp) return false;
    const w = window as any;
    const t = vp.style.transform;
    if (w.__transformPrec === t) return (w.__transformStable = (w.__transformStable ?? 0) + 1) >= 3;
    w.__transformPrec = t;
    w.__transformStable = 0;
    return false;
  }, { timeout: 10000, polling: 50 });
}

const mesure = (page: any) => page.evaluate(() => ({
  panneau: (document.querySelector(".inspecteur-panneau") as HTMLElement).getBoundingClientRect().width,
  colonne: (document.querySelector(".inspecteur-emplacement") as HTMLElement).getBoundingClientRect().width,
  canevas: (document.querySelector(".react-flow") as HTMLElement).getBoundingClientRect().width,
  noeud: (document.querySelector(".react-flow__node") as HTMLElement).getBoundingClientRect().x,
  titre: (document.querySelector(".inspecteur-entete h2") as HTMLElement).innerText,
}));

test.describe("l'inspecteur qu'on tire sur le canevas", () => {
  test("TIRER LA POIGNÉE ÉTEND LE PANNEAU PAR-DESSUS, SANS DÉPLACER LE CANEVAS", async ({ page }) => {
    await ouvrir(page);
    await vueStabilisee(page);
    const avant = await mesure(page);
    expect(avant.titre).toBe("Montage");
    expect(avant.panneau).toBe(280);

    const p = await page.locator(".inspecteur-poignee").boundingBox();
    await page.mouse.move(p!.x + 3, p!.y + 200);
    await page.mouse.down();
    await page.mouse.move(p!.x - 300, p!.y + 200, { steps: 8 });
    await page.mouse.move(p!.x - 500, p!.y + 200, { steps: 8 });
    await page.mouse.up();
    const apres = await mesure(page);
    console.log(JSON.stringify({ avant, apres }));

    // Saisie à +3, relâche à −500 : 503 px de course.
    expect(apres.panneau).toBe(783);
    // La colonne et le canevas n'ont pas bougé d'un pixel, ni le nœud dans le canevas.
    expect(apres.colonne).toBe(avant.colonne);
    expect(apres.canevas).toBe(avant.canevas);
    // À un demi-pixel près : la transformation CSS de React Flow laisse traîner des 10⁻⁵ de pixel.
    // LES DEUX RELEVÉS SONT PRIS VUE POSÉE, sans quoi cette ligne mesure la fin du cadrage
    // d'ouverture et non l'effet du geste — voir `vueStabilisee`.
    expect(Math.abs(apres.noeud - avant.noeud)).toBeLessThan(0.5);
    await page.screenshot({ path: "test-results/inspecteur-deploye.png" });
  });

  test("LA LARGEUR SURVIT AU RECHARGEMENT ; UN DOUBLE-CLIC REPLIE ; ELLE NE COUVRE JAMAIS LA PALETTE", async ({ page }) => {
    await ouvrir(page);
    const p = await page.locator(".inspecteur-poignee").boundingBox();
    await page.mouse.move(p!.x + 3, p!.y + 200);
    await page.mouse.down();
    await page.mouse.move(p!.x - 3000, p!.y + 200, { steps: 10 });
    await page.mouse.up();
    const max = await mesure(page);
    // 1600 − 260 de palette − 80 de canevas laissé visible.
    expect(max.panneau).toBe(1260);

    await page.reload();
    await page.waitForSelector(".attic-app");
    expect(await page.evaluate(() => (document.querySelector(".inspecteur-panneau") as HTMLElement).getBoundingClientRect().width)).toBe(1260);

    await page.locator(".inspecteur-poignee").dblclick();
    expect(await page.evaluate(() => (document.querySelector(".inspecteur-panneau") as HTMLElement).getBoundingClientRect().width)).toBe(280);
  });

  test("au clavier : flèche gauche élargit, Échap replie", async ({ page }) => {
    await ouvrir(page);
    await page.evaluate(() => { try { localStorage.removeItem("attic-inspecteur-largeur"); } catch { /* */ } });
    await page.locator(".inspecteur-poignee").focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    expect((await mesure(page)).panneau).toBe(360);
    await page.keyboard.press("Escape");
    expect((await mesure(page)).panneau).toBe(280);
  });

  test("REPLIÉ, LE PANNEAU NE COUVRE PAS LE BOUTON « LANCER », même sur une fenêtre étroite", async ({ page }) => {
    // RELEVÉ PAR LES TESTS D'ARRÊT, et la cause n'était pas celle qu'on croyait. Ce cas a d'abord
    // été écrit contre un panneau toujours au premier plan, qui interceptait le clic. Ce panneau a
    // été réparé, et le cas échouait encore : à 1280 px, « Lancer » était à x = 1290 — ENTIÈREMENT
    // hors de la fenêtre. La pile d'éléments en son centre était VIDE ; rien ne le couvrait, il
    // n'était plus là. La barre d'outils vivait dans la colonne du canevas, trop étroite pour son
    // contenu à toutes les largeurs ; elle prend désormais la largeur de l'application. Le cas
    // reste ici parce qu'il garde le même sens — « Lancer » se clique » — et `barre-stable.spec.ts`
    // tient l'invariant sur toute l'étendue des largeurs permises.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    const libre = await page.evaluate(() => {
      const b = document.querySelector(".attic-btn-lancer") as HTMLElement;
      const r = b.getBoundingClientRect();
      const dessus = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!dessus && (dessus === b || b.contains(dessus));
    });
    expect(libre).toBe(true);
    await page.locator(".attic-btn-lancer").click({ timeout: 5000 });
  });
});
