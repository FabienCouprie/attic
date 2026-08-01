import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5174";

async function waitForServer(url: string, retries = 60): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

test.beforeAll(async () => {
  if (process.env.DEV_URL) {
    await waitForServer(devUrl);
    return;
  }
  const port = 5174;
  devUrl = `http://localhost:${port}`;
  devServer = spawn("cmd", ["/c", "npm", "run", "dev", "--", "--port", String(port)], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  let log = "";
  devServer.stdout?.on("data", (d) => { log += d.toString(); });
  devServer.stderr?.on("data", (d) => { log += d.toString(); });
  for (let i = 0; i < 80; i++) {
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

test.describe("Meta ungroup", () => {
  test("ungroup places inner nodes under the meta node", async ({ page }) => {
    const meta = {
      id: "meta-test",
      nom: "Test Meta",
      entrees: [],
      sorties: [],
      mapEntrees: [],
      mapSorties: [],
      sousNoeuds: [
        { id: "n1", position: { x: 100, y: 100 }, width: 230, height: 200, data: { ficheId: "entree-audio", parametres: {} } },
        { id: "n2", position: { x: 200, y: 200 }, width: 230, height: 200, data: { ficheId: "sortie-audio", parametres: {} } },
      ],
      sousAretes: [],
    };
    const graph = {
      nodes: [{ id: "nm", position: { x: 300, y: 300 }, width: 230, height: 200, data: { ficheId: "meta-test", parametres: {} } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    await page.addInitScript((payload: string) => {
      const { meta, graph } = JSON.parse(payload);
      localStorage.setItem("attic-metas", JSON.stringify([meta]));
      localStorage.setItem("attic-encours", JSON.stringify(graph));
    }, JSON.stringify({ meta, graph }));

    await page.goto(devUrl);
    await page.waitForSelector('.react-flow__node[data-id="nm"]', { timeout: 10000 });

    // Select the meta node and click the "Dégrouper" button (second button).
    await page.click('.react-flow__node[data-id="nm"]');
    await page.waitForSelector('.react-flow__node[data-id="nm"].selected', { timeout: 3000 });
    await page.click('.attic-meta-actions button:nth-child(2)');

    // Inner nodes should appear under the meta node, not at their original (100,100)/(200,200).
    await page.waitForSelector('.react-flow__node[data-id="nm::n1"]', { timeout: 3000 });
    await page.waitForSelector('.react-flow__node[data-id="nm::n2"]', { timeout: 3000 });

    const positions = await page.evaluate(() => {
      const getPos = (id: string) => {
        const el = document.querySelector(`.react-flow__node[data-id="${id}"]`);
        if (!el) return null;
        const transform = (el as HTMLElement).style.transform;
        const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
      };
      return { n1: getPos("nm::n1"), n2: getPos("nm::n2"), nm: getPos("nm") };
    });

    expect(positions.n1).not.toBeNull();
    expect(positions.n2).not.toBeNull();
    // Barycentre of (100,100) and (200,200) is (150,150); meta is at (300,300)
    // so the translated inner nodes should be at (250,250) and (350,350).
    expect(positions.n1!.x).toBeCloseTo(250, 0);
    expect(positions.n1!.y).toBeCloseTo(250, 0);
    expect(positions.n2!.x).toBeCloseTo(350, 0);
    expect(positions.n2!.y).toBeCloseTo(350, 0);
  });
});

test.describe("Copy / paste", () => {
  test("copies and pastes multiple selected nodes", async ({ page }) => {
    const graph = {
      nodes: [
        { id: "a", position: { x: 100, y: 100 }, width: 230, height: 200, data: { ficheId: "entree-audio", parametres: {} } },
        { id: "b", position: { x: 300, y: 100 }, width: 230, height: 200, data: { ficheId: "sortie-audio", parametres: {} } },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    await page.addInitScript((g: string) => {
      localStorage.setItem("attic-encours", g);
    }, JSON.stringify(graph));

    await page.goto(devUrl);
    await page.waitForSelector('.react-flow__node[data-id="a"]', { timeout: 10000 });
    await page.waitForSelector('.react-flow__node[data-id="b"]', { timeout: 10000 });

    // Select the first node, then Control-click the second to multi-select.
    await page.click('.react-flow__node[data-id="a"]');
    await page.click('.react-flow__node[data-id="b"]', { modifiers: ["Control"] });

    // Copy then paste.
    await page.keyboard.press("Control+c");
    await page.click('.react-flow__pane');
    await page.keyboard.press("Control+v");

    await page.waitForTimeout(300);

    // There should now be 4 nodes.
    const nodeIds = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.react-flow__node')).map((el) => el.getAttribute("data-id"))
    );
    expect(nodeIds.length).toBe(4);
    const pastedIds = nodeIds.filter((id) => id !== "a" && id !== "b");
    expect(pastedIds.length).toBe(2);

    // The pasted nodes should keep their relative spacing: (100,100) and (300,100)
    // are pasted at barycentre (200,100) + 40, so (240,140) and (440,140).
    const positions = await page.evaluate(() => {
      const getPos = (id: string) => {
        const el = document.querySelector(`.react-flow__node[data-id="${id}"]`);
        if (!el) return null;
        const transform = (el as HTMLElement).style.transform;
        const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
      };
      const ids = Array.from(document.querySelectorAll('.react-flow__node')).map((el) => el.getAttribute("data-id"));
      const pasted = ids.filter((id) => id !== "a" && id !== "b");
      return { pasted: pasted.map((id) => ({ id, pos: getPos(id) })) };
    });

    expect(positions.pasted.length).toBe(2);
    const xs = positions.pasted.map((p) => p.pos!.x).sort((a, b) => a - b);
    const ys = positions.pasted.map((p) => p.pos!.y);
    expect(xs[0]).toBeCloseTo(240, 0);
    expect(xs[1]).toBeCloseTo(440, 0);
    expect(ys[0]).toBeCloseTo(140, 0);
    expect(ys[1]).toBeCloseTo(140, 0);
  });
});
