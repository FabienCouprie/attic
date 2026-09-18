// tests-e2e/catalogue-anglais.spec.ts — L'infobulle du catalogue suit la langue.
//
// Le défaut rapporté : en anglais, survoler un nœud de la palette montrait le résumé
// français. La projection `resumeEn ?? resume` était recopiée à chaque endroit qui
// affiche une fiche — nœud, inspecteur — et celui-là l'avait oubliée. Les règles de
// projection sont testées à part (`src/ui/libelles-fiche.test.ts`) ; ce test-ci vérifie
// le point d'appel, que la suite unitaire ne couvre pas — elle n'inclut pas les `.tsx`.
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5181";

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
  const port = 5181;
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

/** Déplie tout le catalogue et relève chaque nom d'entrée avec son infobulle. */
async function entreesDuCatalogue(page: import("@playwright/test").Page) {
  // Seuls les univers sont repliés au démarrage ; les familles sont déjà ouvertes, et
  // cliquer dessus les refermerait.
  for (const titre of await page.locator(".palette-univers-titre").all()) await titre.click();
  await expect(page.locator(".palette-composant").first()).toBeVisible();
  return page.locator(".palette-composant").evaluateAll((els) =>
    els.map((el) => ({
      nom: el.querySelector(".palette-composant-nom")?.textContent ?? "",
      // `title` a laissé la place à l'infobulle maison ; `aria-label` porte « nom —
      // résumé », ce qui se relève sans survoler les 261 entrées une à une. Le contenu
      // réellement affiché au survol est vérifié plus bas, sur un nœud.
      infobulle: (el.getAttribute("aria-label") ?? "").split(" — ").slice(1).join(" — "),
    })),
  );
}

// Lettres propres au français : le relevé du garde-fou `anglais-registre.test.ts`, qui
// montre que l'anglais technique de ces fiches n'en emploie pas — hormis quelques noms
// propres, dont le tréma reste le même en anglais, et qui sont retirés avant le test.
const TOLERES = /\b(?:möbius|rössler)\b/gi;
const ACCENTS = /[àâäçéèêëîïôöùûüÿœæ]/i;
const enFrancais = (texte: string) => ACCENTS.test(texte.replace(TOLERES, ""));

test.describe("catalogue en anglais", () => {
  test("l'infobulle d'un nœud est en anglais, pas en français", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => localStorage.setItem("attic-lang", "en"));
    await page.goto(devUrl);
    await page.waitForSelector(".palette-univers-titre", { timeout: 30_000 });

    const entrees = await entreesDuCatalogue(page);
    expect(entrees.length).toBeGreaterThan(100);

    // Un cas nommé, pour que l'échec dise quoi regarder.
    const machine = entrees.find((e) => e.nom === "Drum Machine");
    expect(machine, "le catalogue anglais doit contenir « Drum Machine »").toBeTruthy();
    expect(machine!.infobulle).toMatch(/^Generates a drum pattern/);

    // Et la règle sur tout le catalogue : aucune infobulle ne reste en français.
    const francaises = entrees.filter((e) => enFrancais(e.infobulle)).map((e) => `${e.nom} → ${e.infobulle}`);
    expect(francaises).toEqual([]);
    for (const e of entrees) expect(e.infobulle, e.nom).not.toBe("");
  });

  test("le survol ouvre l'infobulle maison : résumé et ports, en anglais", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => localStorage.setItem("attic-lang", "en"));
    await page.goto(devUrl);
    await page.waitForSelector(".palette-univers-titre", { timeout: 30_000 });
    for (const titre of await page.locator(".palette-univers-titre").all()) await titre.click();

    const entree = page.locator(".palette-composant", { has: page.locator("text=Drum Machine") }).first();
    // Amener l'entrée dans la vue AVANT de la survoler : le panneau se ferme au
    // défilement — la liste bouge sous le curseur —, et un survol qui fait défiler
    // lui-même refermerait ce qu'il vient d'ouvrir.
    await entree.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await entree.hover();

    const infobulle = page.locator(".attic-infobulle");
    // Elle paraît tout de suite — c'est tout l'objet du changement, `title` demandait
    // près d'une seconde.
    await expect(infobulle).toBeVisible({ timeout: 1000 });
    await expect(infobulle.locator(".attic-infobulle-nom")).toHaveText("Drum Machine");
    await expect(infobulle.locator(".attic-infobulle-resume")).toContainText("Generates a drum pattern");

    // Les ports, ce que `title` ne savait pas montrer.
    const sorties = infobulle.locator(".attic-infobulle-col.sorties .attic-infobulle-port-nom");
    await expect(sorties.first()).toHaveText("Audio");
    expect(await sorties.count()).toBeGreaterThan(0);
    await expect(infobulle.locator(".attic-infobulle-col.entrees")).toContainText("Inputs");
    // Un type de flux traduit, et non le libellé français du registre.
    await expect(infobulle.locator(".attic-infobulle-port-type").first()).not.toHaveText("Contrôle");

    // Le panneau tient dans la fenêtre.
    const boite = (await infobulle.boundingBox())!;
    const taille = page.viewportSize()!;
    expect(boite.x).toBeGreaterThanOrEqual(0);
    expect(boite.y).toBeGreaterThanOrEqual(0);
    expect(boite.x + boite.width).toBeLessThanOrEqual(taille.width);
    expect(boite.y + boite.height).toBeLessThanOrEqual(taille.height);

    // Et elle s'en va quand la souris quitte l'entrée.
    await page.locator(".palette-titre").hover();
    await expect(infobulle).toHaveCount(0);
  });

  test("et en français, elle reste en français", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => localStorage.setItem("attic-lang", "fr"));
    await page.goto(devUrl);
    await page.waitForSelector(".palette-univers-titre", { timeout: 30_000 });

    const entrees = await entreesDuCatalogue(page);
    const machine = entrees.find((e) => e.nom === "Boîte à rythmes");
    expect(machine, "le catalogue français doit contenir « Boîte à rythmes »").toBeTruthy();
    expect(machine!.infobulle).toMatch(/^Génère une piste rythmique/);
  });
});
