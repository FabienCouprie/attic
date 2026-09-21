// tests-e2e/modulation-inspecteur.spec.ts — Un parametre pilote par une courbe, vu de l inspecteur.
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

// Deux graphes identiques a une arete pres : la courbe branchee sur la modulation du filtre, ou non.
const noeuds = [
  { id: "src", position: { x: 0, y: 0 }, data: { ficheId: "generateur-courbe", parametres: {} } },
  { id: "filtre", position: { x: 320, y: 0 }, data: { ficheId: "reponse-filtre", parametres: {} } },
];
const grapheBranche = {
  nodes: noeuds,
  edges: [{ id: "e1", source: "src", target: "filtre", sourceHandle: "out:0", targetHandle: "in:1" }],
};
const grapheDebranche = { nodes: noeuds, edges: [] };

async function ouvrir(page: any, graphe: unknown) {
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); },
    [JSON.stringify(graphe)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 2, { timeout: 15000 });
  // Selectionner le filtre pour que l inspecteur l affiche. React Flow ecoute la sequence
  // mousedown/mouseup, et non un `click` seul : un clic Playwright sur l en-tete ne selectionne pas.
  await page.evaluate(() => {
    const n = [...document.querySelectorAll(".react-flow__node")].find((x) => (x as HTMLElement).innerText.includes("Filtre"))!;
    const r = n.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + 10;
    for (const type of ["mousedown", "mouseup", "click"]) {
      n.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
    }
  });
  await page.waitForTimeout(600);
}

const etat = () => ({
  labels: [...document.querySelectorAll(".inspecteur-param label")].map((l) => (l as HTMLElement).innerText.trim()),
  plages: [...document.querySelectorAll(".inspecteur-plage-lecture")].map((l) => (l as HTMLElement).innerText.trim()),
  curseursDePlage: document.querySelectorAll(".inspecteur-plage-borne input[type=range]").length,
});

test.describe("inspecteur, parametre module", () => {
  test("SANS COURBE, LES BORNES DE MODULATION NE S AFFICHENT PAS", async ({ page }) => {
    await ouvrir(page, grapheDebranche);
    const r = await page.evaluate(etat);
    console.log("debranche:", JSON.stringify(r));

    // Le parametre pilote reste un reglage ordinaire.
    expect(r.labels).toContain("Fréquence de coupure");
    // Et les deux bornes, qui ne servent a rien sans courbe, ont disparu de l ecran.
    expect(r.labels).not.toContain("Modulation min");
    expect(r.labels).not.toContain("Modulation max");
    expect(r.plages).toHaveLength(0);
  });

  test("AVEC COURBE, LE PARAMETRE DEVIENT SA PLAGE, DANS SON UNITE", async ({ page }) => {
    await ouvrir(page, grapheBranche);
    const r = await page.evaluate(etat);
    console.log("branche:", JSON.stringify(r));

    // Le parametre est toujours la, a sa place, sous son nom.
    expect(r.labels).toContain("Fréquence de coupure");
    // Les bornes n apparaissent toujours pas comme des reglages separes.
    expect(r.labels).not.toContain("Modulation min");
    expect(r.labels).not.toContain("Modulation max");
    // Mais une plage est rendue, avec ses deux curseurs et sa lecture en hertz.
    expect(r.curseursDePlage).toBe(2);
    expect(r.plages).toHaveLength(1);
    expect(r.plages[0]).toMatch(/Hz/);
    expect(r.plages[0]).toMatch(/→/);
    // Les valeurs par defaut de la fiche : 200 a 6000 Hz.
    expect(r.plages[0]).toContain("200");
    expect(r.plages[0]).toContain("6000");
  });

  test("DEUX COURBES PILOTENT DEUX PARAMETRES DU MEME NOEUD", async ({ page }) => {
    // La limite de la premiere version : un port, donc un seul parametre. Un vrai wah deplace sa
    // coupure ET sa resonance, et deux filtres en serie ne le reproduisent pas.
    await ouvrir(page, {
      nodes: [
        { id: "c1", position: { x: 0, y: 0 }, data: { ficheId: "generateur-courbe", parametres: {} } },
        { id: "c2", position: { x: 0, y: 260 }, data: { ficheId: "generateur-courbe", parametres: {} } },
        { id: "filtre", position: { x: 340, y: 0 }, data: { ficheId: "reponse-filtre", parametres: {} } },
      ],
      edges: [
        { id: "e1", source: "c1", target: "filtre", sourceHandle: "out:0", targetHandle: "in:1" },
        { id: "e2", source: "c2", target: "filtre", sourceHandle: "out:0", targetHandle: "in:2" },
      ],
    });
    const r = await page.evaluate(etat);
    console.log("deux courbes:", JSON.stringify(r));

    // Deux plages, quatre curseurs : la coupure en hertz et la resonance en Q.
    expect(r.plages).toHaveLength(2);
    expect(r.curseursDePlage).toBe(4);
    expect(r.plages[0]).toMatch(/Hz/);
    expect(r.plages[1]).toMatch(/Q/);
    // Les bornes ne s affichent jamais comme des reglages separes.
    expect(r.labels).not.toContain("Modulation min");
    expect(r.labels).not.toContain("Résonance min");
  });

  test("UNE SEULE DES DEUX BRANCHEE : une seule plage", async ({ page }) => {
    await ouvrir(page, grapheBranche);
    const r = await page.evaluate(etat);
    expect(r.plages).toHaveLength(1);
    expect(r.plages[0]).toMatch(/Hz/);
    // La resonance reste un curseur ordinaire, puisque rien ne la pilote.
    expect(r.labels).toContain("Résonance");
  });
});
