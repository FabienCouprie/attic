// tests-e2e/montage-pistes.spec.ts — Le montage s'allonge et se raccourcit, dans l'application.
//
// CE QUI NE SE TESTE PAS HORS DE REACT : le nombre de pistes dessinées dépend des CÂBLES branchés,
// que seul le graphe connaît, et les deux boutons agissent sur les données du nœud. La règle pure
// est testée dans src/ui/ports-extensibles.test.ts ; ici on vérifie qu'elle tient à l'écran, et
// qu'un montage à cinq pistes rend bien le mélange des cinq.
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

/** Un graphe : deux sources branchées sur les pistes 1 et 5 d'un montage. */
const GRAPHE = {
  nodes: [
    { id: "m", position: { x: 700, y: 0 }, data: { ficheId: "montage", parametres: { "Début 1": 0, "Début 5": 1 } } },
    { id: "a", position: { x: 0, y: 0 }, data: { ficheId: "arpege-koch", parametres: {} } },
    { id: "b", position: { x: 0, y: 400 }, data: { ficheId: "generateur-fractal", parametres: {} } },
  ],
  edges: [
    { id: "e1", source: "a", target: "m", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e5", source: "b", target: "m", sourceHandle: "out:0", targetHandle: "in:4" },
  ],
};

const etat = `(() => {
  const n = document.querySelector('.react-flow__node[data-id="m"]');
  const b = [...n.querySelectorAll('.attic-node-ports-plus button')];
  return {
    pistes: n.querySelectorAll('.attic-node-ports-col:not(.right) .attic-node-port').length,
    compteur: n.querySelector('.attic-node-ports-plus span')?.textContent,
    moinsDesactive: b[0]?.disabled,
    plusDesactive: b[1]?.disabled,
    derniere: [...n.querySelectorAll('.attic-node-ports-col:not(.right) .attic-node-port-label')].pop()?.textContent,
  };
})()`;

test.describe("montage : des pistes à la demande", () => {
  test("QUATRE PISTES AU DÉPART, CINQ QUAND LA CINQUIÈME EST CÂBLÉE, SEIZE AU PLUS", async ({ page }) => {
    test.setTimeout(180000);
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(GRAPHE)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 3, { timeout: 15000 });

    // Le câble de la piste 5 impose cinq pistes, et interdit de raccourcir.
    const depart = await page.evaluate(etat);
    expect(depart).toMatchObject({ pistes: 5, compteur: "5", moinsDesactive: true, plusDesactive: false, derniere: "Piste 5" });
    expect(await page.evaluate(() => document.querySelectorAll(".react-flow__edges .react-flow__edge").length)).toBe(2);

    // Le « + » allonge le nœud jusqu'à seize, puis s'éteint.
    for (let i = 0; i < 20; i++) {
      const fini = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.react-flow__node[data-id="m"] .attic-node-ports-plus button')] as HTMLButtonElement[];
        if (b[1].disabled) return true;
        b[1].click();
        return false;
      });
      if (fini) break;
      await page.waitForTimeout(80);
    }
    expect(await page.evaluate(etat)).toMatchObject({ pistes: 16, compteur: "16", plusDesactive: true, derniere: "Piste 16" });

    // Le « − » le raccourcit, mais s'arrête à la dernière piste branchée.
    for (let i = 0; i < 20; i++) {
      const fini = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.react-flow__node[data-id="m"] .attic-node-ports-plus button')] as HTMLButtonElement[];
        if (b[0].disabled) return true;
        b[0].click();
        return false;
      });
      if (fini) break;
      await page.waitForTimeout(80);
    }
    expect(await page.evaluate(etat)).toMatchObject({ pistes: 5, compteur: "5", moinsDesactive: true });
    // Les deux câbles sont toujours là : rien n'a été débranché dans le dos.
    expect(await page.evaluate(() => document.querySelectorAll(".react-flow__edges .react-flow__edge").length)).toBe(2);

    // Et le montage mélange bien les deux pistes, celle du haut et la cinquième.
    await page.keyboard.press(" ");
    await page.waitForFunction(() => !!(document.querySelector('.react-flow__node[data-id="m"] audio') as HTMLAudioElement | null)?.src, null, { timeout: 120000 });
    const r = await page.evaluate(async () => {
      const el = document.querySelector('.react-flow__node[data-id="m"] audio') as HTMLAudioElement;
      const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(el.src)).arrayBuffer());
      const x = b.getChannelData(0);
      const crete = (a: number, z: number) => {
        let m = 0;
        for (let i = Math.floor(a * b.sampleRate); i < Math.min(x.length, Math.floor(z * b.sampleRate)); i++) m = Math.max(m, Math.abs(x[i]));
        return m;
      };
      const noeud = document.querySelector('.react-flow__node[data-id="m"]') as HTMLElement;
      return { duree: b.duration, avant: crete(0.1, 0.9), apres: crete(1.2, 2), message: noeud.innerText, erreur: noeud.className.includes("erreur") };
    });
    console.log(JSON.stringify(r));
    expect(r.erreur).toBe(false);
    expect(r.message).toContain("2");
    expect(r.avant).toBeGreaterThan(0.001); // la piste 1 commence à 0 s
    expect(r.apres).toBeGreaterThan(0.001); // la piste 5, elle, à 1 s
  });
});
