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

async function ouvrir(page: any, graphe: unknown, nom = "Filtre") {
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); },
    [JSON.stringify(graphe)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 2, { timeout: 15000 });
  // Selectionner le filtre pour que l inspecteur l affiche. React Flow ecoute la sequence
  // mousedown/mouseup, et non un `click` seul : un clic Playwright sur l en-tete ne selectionne pas.
  await page.evaluate((nom: string) => {
    const n = [...document.querySelectorAll(".react-flow__node")].find((x) => (x as HTMLElement).innerText.includes(nom))!;
    const r = n.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + 10;
    for (const type of ["mousedown", "mouseup", "click"]) {
      n.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
    }
  }, nom);
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

// LE TRÉMOLO ET LE VIBRATO : LA FRÉQUENCE DU LFO DEVIENT PILOTABLE. Le graphe est complet — un son,
// deux courbes — et il est exécuté : l'inspecteur ne suffit pas, il faut que le nœud rende du son.
const grapheLfo = (ficheId: string, ports: number[]) => ({
  nodes: [
    { id: "osc", position: { x: 0, y: 0 }, data: { ficheId: "oscillateur", parametres: {} } },
    { id: "c1", position: { x: 0, y: 260 }, data: { ficheId: "generateur-courbe", parametres: {} } },
    { id: "c2", position: { x: 0, y: 520 }, data: { ficheId: "generateur-courbe", parametres: {} } },
    { id: "lfo", position: { x: 380, y: 0 }, data: { ficheId, parametres: {} } },
  ],
  edges: [
    { id: "e0", source: "osc", target: "lfo", sourceHandle: "out:0", targetHandle: "in:0" },
    ...ports.map((p, k) => ({ id: `e${p}`, source: `c${k + 1}`, target: "lfo", sourceHandle: "out:0", targetHandle: `in:${p}` })),
  ],
});

async function executerEtLire(page: any) {
  await page.keyboard.press(" ");
  await page.waitForFunction(() => !!(document.querySelector('.react-flow__node[data-id="lfo"] audio') as HTMLAudioElement | null)?.src,
    null, { timeout: 60000 });
  return page.evaluate(async () => {
    const a = document.querySelector('.react-flow__node[data-id="lfo"] audio') as HTMLAudioElement;
    const ab = await (await fetch(a.src)).arrayBuffer();
    return { octets: ab.byteLength, erreur: document.querySelector('.react-flow__node[data-id="lfo"]')?.className.includes("erreur") ?? false };
  });
}

test.describe("la fréquence du LFO, pilotée par une courbe", () => {
  test("LE TRÉMOLO : PROFONDEUR ET FRÉQUENCE, DEUX PLAGES, ET LE NŒUD REND DU SON", async ({ page }) => {
    test.setTimeout(90000);
    await ouvrir(page, grapheLfo("tremolo", [1, 2]), "Tremolo");
    const r = await page.evaluate(etat);
    console.log("tremolo:", JSON.stringify(r));
    expect(r.plages).toHaveLength(2);
    expect(r.curseursDePlage).toBe(4);
    expect(r.plages.some((p: string) => /%/.test(p))).toBe(true);
    const frequence = r.plages.find((p: string) => /Hz/.test(p))!;
    expect(frequence).toContain("1");
    expect(frequence).toContain("10");
    expect(r.labels).not.toContain("Fréquence min");
    expect(r.labels).not.toContain("Fréquence max");
    const son = await executerEtLire(page);
    console.log("tremolo son:", JSON.stringify(son));
    expect(son.erreur).toBe(false);
    expect(son.octets).toBeGreaterThan(10000);
  });

  test("LE VIBRATO : LA SEULE FRÉQUENCE BRANCHÉE, UNE PLAGE EN HERTZ", async ({ page }) => {
    test.setTimeout(90000);
    await ouvrir(page, grapheLfo("vibrato", [2]), "Vibrato");
    const r = await page.evaluate(etat);
    console.log("vibrato:", JSON.stringify(r));
    expect(r.plages).toHaveLength(1);
    expect(r.plages[0]).toMatch(/Hz/);
    expect(r.labels).toContain("Profondeur");
    const son = await executerEtLire(page);
    expect(son.erreur).toBe(false);
    expect(son.octets).toBeGreaterThan(10000);
  });

  test("sans courbe, le trémolo n'affiche aucune plage", async ({ page }) => {
    await ouvrir(page, grapheLfo("tremolo", []), "Tremolo");
    const r = await page.evaluate(etat);
    expect(r.plages).toHaveLength(0);
    expect(r.labels).toContain("Fréquence");
    expect(r.labels).not.toContain("Fréquence min");
  });
});

// LA CAMPAGNE ÉTENDUE : chaque nœud, avec sa courbe branchée, affiche sa plage dans son unité et rend
// du son dans un vrai graphe.
const CAMPAGNE: { ficheId: string; nom: string; ports: number[]; unites: RegExp[] }[] = [
  { ficheId: "auto-pan", nom: "Auto-pan", ports: [1], unites: [/Hz/] },
  { ficheId: "phaser", nom: "Phaser", ports: [1], unites: [/Hz/] },
  { ficheId: "chopper", nom: "Chopper", ports: [1], unites: [/Hz/] },
  { ficheId: "wahwah", nom: "Wah-wah", ports: [2], unites: [/Hz/] },
  { ficheId: "echo", nom: "Echo", ports: [1, 2], unites: [/ms/, /%/] },
  { ficheId: "echo-ping-pong", nom: "Echo Ping-Pong", ports: [1, 2], unites: [/ms/, /%/] },
];

test.describe("la campagne étendue", () => {
  for (const c of CAMPAGNE) {
    test(`${c.nom} : ${c.ports.length} plage(s) et du son`, async ({ page }) => {
      test.setTimeout(90000);
      await ouvrir(page, grapheLfo(c.ficheId, c.ports), c.nom);
      const r = await page.evaluate(etat);
      console.log(c.ficheId, JSON.stringify(r.plages));
      expect(r.plages).toHaveLength(c.ports.length);
      for (const u of c.unites) expect(r.plages.some((p: string) => u.test(p)), String(u)).toBe(true);
      const son = await executerEtLire(page);
      expect(son.erreur).toBe(false);
      expect(son.octets).toBeGreaterThan(10000);
    });
  }
});
