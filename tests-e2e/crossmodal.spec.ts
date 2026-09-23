// tests-e2e/crossmodal.spec.ts — Les deux générateurs visent-ils juste, dans l'application ?
//
// Les modules purs sont testés à part ; ce qui se vérifie ici est la chaîne entière dans le vrai
// moteur, avec le vrai synthétiseur : un point demandé, un motif rendu, et LA MESURE FAITE PAR UN
// AUTRE NŒUD — « Le goût d'un son » branché en aval, qui ne sait rien de ce qui a été demandé.
//
// Un port différent de celui de Fabien (5175), dont le serveur ne doit pas être touché.
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5192";

async function waitForServer(url: string, retries = 120): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch { /* pas encore la */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

test.beforeAll(async () => {
  if (process.env.DEV_URL) { await waitForServer(devUrl); return; }
  const port = 5192;
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

/** Les quatre parts lues sur les barres d'un nœud, goût par goût. */
const parts = (page: any, id: string) => page.evaluate((n: string) => {
  const lignes = [...document.querySelectorAll(`.react-flow__node[data-id="${n}"] .attic-gout-ligne`)];
  return Object.fromEntries(lignes.map((l) => [
    l.querySelector(".attic-gout-nom")?.textContent ?? "",
    parseInt(l.querySelector(".attic-gout-part")?.textContent ?? "0", 10),
  ])) as Record<string, number>;
}, id);

async function lancer(page: any, graphe: unknown, attendus: string[]) {
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.click(".attic-btn-lancer");
  await page.waitForFunction(
    (ids: string[]) => ids.every((id) => document.querySelectorAll(`.react-flow__node[data-id="${id}"] .attic-gout-ligne`).length === 4),
    attendus, { timeout: 180000 },
  );
}

const lien = (id: string, source: string, target: string) =>
  ({ id, source, target, sourceHandle: "out:0", targetHandle: "in:0" });

test.describe("accord mets-musique", () => {
  test("un profil qui n'a qu'un goût rend une musique que l'analyse range sous ce goût", async ({ page }) => {
    test.setTimeout(300000);
    const accord = (id: string, p: Record<string, number>) =>
      ({ id, position: { x: 0, y: 0 }, data: { ficheId: "accord-mets-musique", parametres: { "Sucré": 0, "Acide": 0, "Amer": 0, "Salé": 0, "Durée": 6, ...p } } });
    await lancer(page, {
      nodes: [
        { ...accord("sucre", { "Sucré": 100 }), position: { x: 0, y: 0 } },
        { id: "g-sucre", position: { x: 340, y: 0 }, data: { ficheId: "gout-du-son", parametres: {} } },
        { ...accord("amer", { "Amer": 100 }), position: { x: 0, y: 260 } },
        { id: "g-amer", position: { x: 340, y: 260 }, data: { ficheId: "gout-du-son", parametres: {} } },
      ],
      edges: [lien("a", "sucre", "g-sucre"), lien("b", "amer", "g-amer")],
    }, ["sucre", "amer", "g-sucre", "g-amer"]);

    const versSucre = await parts(page, "g-sucre");
    const versAmer = await parts(page, "g-amer");
    console.log("profil sucré seul :", JSON.stringify(versSucre));
    console.log("profil amer seul  :", JSON.stringify(versAmer));

    // Ce qui a été demandé domine l'analyse d'un autre nœud.
    const tete = (p: Record<string, number>) => Object.entries(p).sort((x, y) => y[1] - x[1])[0][0];
    expect(tete(versSucre)).toBe("sucré");
    expect(tete(versAmer)).toBe("amer");
    // Et les deux musiques ne se ressemblent pas.
    expect(versSucre["sucré"]).toBeGreaterThan(versAmer["sucré"]);
    expect(versAmer["amer"]).toBeGreaterThan(versSucre["amer"]);

    // Le générateur mesure son propre rendu : il doit dire la même chose que le nœud d'à côté.
    expect(await parts(page, "sucre")).toEqual(versSucre);
  });
});

test.describe("parfum → motif", () => {
  test("un agrume se mesure plus aigu et plus acide qu'un musc", async ({ page }) => {
    test.setTimeout(300000);
    const parfum = (id: string, mot: string, y: number) =>
      ({ id, position: { x: 0, y }, data: { ficheId: "parfum-motif", parametres: { "Parfum": mot, "Durée": 6 } } });
    await lancer(page, {
      nodes: [
        parfum("citron", "citron", 0),
        { id: "g-citron", position: { x: 340, y: 0 }, data: { ficheId: "gout-du-son", parametres: {} } },
        parfum("musc", "musc", 260),
        { id: "g-musc", position: { x: 340, y: 260 }, data: { ficheId: "gout-du-son", parametres: {} } },
      ],
      edges: [lien("a", "citron", "g-citron"), lien("b", "musc", "g-musc")],
    }, ["citron", "musc", "g-citron", "g-musc"]);

    const citron = await parts(page, "g-citron");
    const musc = await parts(page, "g-musc");
    console.log("citron :", JSON.stringify(citron));
    console.log("musc   :", JSON.stringify(musc));
    // L'axe que l'article établit : les agrumes vers l'aigu, le musc vers le grave — donc, dans
    // l'espace des goûts, l'un vers l'acide et l'autre vers l'amer.
    expect(citron["acide"]).toBeGreaterThan(musc["acide"]);
    expect(musc["amer"]).toBeGreaterThan(citron["amer"]);

    // Le registre visé et le registre mesuré figurent tous deux dans le rapport du nœud.
    const rapport = await page.textContent('.react-flow__node[data-id="citron"] .attic-node-message');
    expect(rapport).toContain("citron");
  });

  test("les onze parfums se prennent dans une liste déroulante", async ({ page }) => {
    test.setTimeout(120000);
    // Demandé par Fabien : un champ libre obligeait à connaître les noms de la table par cœur. La
    // liste est construite sur la table elle-même, et ce test le vérifie DANS l'inspecteur, seul
    // endroit où elle se voit.
    const graphe = {
      nodes: [{ id: "x", position: { x: 80, y: 60 }, data: { ficheId: "parfum-motif", parametres: {} } }],
      edges: [],
    };
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.click('.react-flow__node[data-id="x"] .attic-node-nom');

    const liste = await page.evaluate(() => {
      const selects = [...document.querySelectorAll(".inspecteur select")];
      for (const s of selects) {
        const opts = [...s.querySelectorAll("option")].map((o) => o.textContent?.trim() ?? "");
        if (opts.includes("citron")) return { options: opts, valeur: (s as HTMLSelectElement).value };
      }
      return null;
    });
    expect(liste, "la liste des parfums doit paraître dans l'inspecteur").not.toBeNull();
    expect(liste!.options).toEqual([
      "citron", "menthe", "orange confite", "iris", "fraise", "rose",
      "vanille", "chocolat noir", "café torréfié", "musc", "fumée",
    ]);
    expect(liste!.valeur).toBe("citron"); // le défaut, et non le premier venu
  });

  test("un identifiant que la table ne connaît pas ne produit rien, et le nœud dit ce qu'il connaît", async ({ page }) => {
    // La liste déroulante ne peut plus proposer d'odeur inconnue : ce qui se vérifie ici est le
    // repli, pour un fichier de projet qui porterait un identifiant absent de la table.
    test.setTimeout(180000);
    const graphe = {
      nodes: [{ id: "x", position: { x: 0, y: 0 }, data: { ficheId: "parfum-motif", parametres: { "Parfum": "azertyuiop", "Durée": 4 } } }],
      edges: [],
    };
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.click(".attic-btn-lancer");
    await page.waitForFunction(
      () => (document.querySelector('.react-flow__node[data-id="x"] .attic-node-message')?.textContent ?? "").length > 10,
      null, { timeout: 120000 },
    );
    const message = (await page.textContent('.react-flow__node[data-id="x"] .attic-node-message')) ?? "";
    console.log("message :", message);
    expect(message).toMatch(/inconnue|Unknown/);
    expect(message).toContain("citron"); // la liste de ce qu'il connaît
    // Et aucun son n'a été fabriqué sur un mot qu'on n'a pas compris.
    expect(await page.evaluate(() => document.querySelectorAll('.react-flow__node[data-id="x"] audio').length)).toBe(0);
  });
});
