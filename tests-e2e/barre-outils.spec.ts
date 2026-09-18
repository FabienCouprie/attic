// tests-e2e/barre-outils.spec.ts — La barre d'outils : des familles, et des étiquettes.
//
// Elle était une rangée d'icônes sans étiquette, rangées dans l'ordre où elles avaient
// été ajoutées, dont deux disques qu'on confondait — le thème et la mise à jour. Les
// règles de rangement et d'étiquetage sont testées à part
// (`src/ui/barre-outils-groupes.test.ts`) ; ce test-ci vérifie la barre telle qu'elle est
// rendue, ce que la suite unitaire ne couvre pas — elle n'inclut pas les `.tsx`.
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5182";

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
  test.setTimeout(180_000);
  if (process.env.DEV_URL) {
    await waitForServer(devUrl);
    return;
  }
  const port = 5182;
  devUrl = `http://localhost:${port}`;
  devServer = spawn("cmd", ["/c", "npm", "run", "dev", "--", "--port", String(port)], { cwd: process.cwd(), stdio: "pipe" });
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

const FAMILLES = ["fichier", "edition", "ressources", "affichage", "application", "execution"];

test.describe("barre d'outils", () => {
  // Une seule visite pour les trois vérifications : la barre ne change pas entre elles,
  // et rouvrir la page à chaque test faisait tomber le serveur de développement.
  test("range ses outils par famille, les étiquette pareil, et ne redonne pas la même icône", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-barre-outils", { timeout: 30_000 });

    // ── Les familles, dans l'ordre, séparées par un trait ──
    const groupes = page.locator(".attic-barre-outils .attic-groupe");
    await expect(groupes).toHaveCount(FAMILLES.length);
    expect(await groupes.evaluateAll((els) => els.map((e) => e.getAttribute("data-famille"))))
      .toEqual(FAMILLES);
    for (const f of FAMILLES) {
      const g = page.locator(`.attic-groupe[data-famille="${f}"]`);
      await expect(g).toHaveAttribute("aria-label", /.+/);
      expect(await g.locator("button, label").count(), f).toBeGreaterThan(0);
    }
    expect(await page.locator(".attic-barre-outils .attic-sep").count())
      .toBeGreaterThanOrEqual(FAMILLES.length - 1);

    // ── Les étiquettes, toutes bâties pareil et toutes distinctes ──
    const outils = await page.locator(".attic-groupe button, .attic-groupe label").evaluateAll((els) =>
      els
        .filter((e) => !e.classList.contains("attic-nom-fichier-detacher"))
        .map((e) => ({
          titre: e.getAttribute("title") ?? "",
          // Le nom accessible vient de l'`aria-label` pour une icône seule, et du texte
          // visible quand il y en a un — le bouton Lancer porte le sien en toutes
          // lettres, et un `aria-label` le masquerait au lieu de l'aider.
          nom: e.getAttribute("aria-label") || (e.textContent ?? "").trim(),
          famille: e.closest(".attic-groupe")?.getAttribute("data-famille") ?? "",
        })),
    );
    expect(outils.length).toBeGreaterThanOrEqual(14);
    for (const o of outils) {
      expect(o.titre, `${o.famille} : un outil sans étiquette`).not.toBe("");
      expect(o.nom, `${o.famille} : un outil sans nom accessible`).not.toBe("");
      // Verbe à l'infinitif en tête : la forme est la même partout.
      expect(o.titre.split(" ")[0], o.titre).toMatch(/(er|ir|re)$/);
    }
    // Deux outils ne portent jamais le même nom : c'est ce qui rendait le thème et la
    // mise à jour indiscernables, deux disques à quelques boutons d'écart.
    const noms = outils.map((o) => o.nom);
    expect(new Set(noms).size, `doublons : ${noms.join(" | ")}`).toBe(noms.length);

    // ── Les icônes, toutes différentes ──
    // La géométrie d'une icône : ses formes, dans l'ordre. Deux boutons qui la partagent
    // sont deux boutons qu'on ne peut pas distinguer du tout. Ce test ne juge pas la
    // ressemblance — deux cercles différents se ressemblent quand même —, il interdit
    // seulement l'identité ; le reste se regarde.
    const geometries = await page.locator(".attic-groupe button svg, .attic-groupe label svg").evaluateAll((els) =>
      els.map((svg) => [...svg.children]
        .map((f) => `${f.tagName}:${f.getAttribute("d") ?? `${f.getAttribute("cx")},${f.getAttribute("cy")},${f.getAttribute("r")}`}`)
        .join(" ")),
    );
    expect(geometries.length).toBeGreaterThanOrEqual(12);
    const doublons = geometries.filter((g, i) => geometries.indexOf(g) !== i);
    expect(doublons, `icônes identiques : ${doublons.join(" | ")}`).toEqual([]);

    // Et les deux qu'on confondait ne sont plus faites des mêmes formes.
    const theme = page.locator('.attic-groupe[data-famille="affichage"] button').first();
    const maj = page.locator('.attic-groupe[data-famille="application"] button').nth(1);
    const formes = async (l: typeof theme) => l.locator("svg > *").evaluateAll((els) => els.map((e) => e.tagName));
    expect(await formes(theme)).not.toEqual(await formes(maj));
  });
});
