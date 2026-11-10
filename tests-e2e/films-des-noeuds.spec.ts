// tests-e2e/films-des-noeuds.spec.ts — Un film rendu par un nœud se révoque quand un autre le
// remplace, et un Ctrl+Z ne revient jamais sur un film mort : dans l'application.
//
// ═══ POURQUOI CETTE ÉPREUVE ═══
//
// Point A6 de la revue d'architecture du 2026-10-31, pièce 4. Deux films étaient posés sur le nœud
// et révoqués par celui qui les posait, au run suivant, alors qu'une entrée d'annulation pouvait les
// tenir encore. Et les films du canal d'affichage, eux, ne se révoquaient pas du tout quand un run
// les remplaçait : l'exécuteur cherchait le précédent dans ses données, où il ne vit plus.
//
// ═══ LE CRITÈRE, ET POURQUOI IL EST DÉCIDABLE ═══
//
// Une adresse `blob:` révoquée ne se lit plus : `fetch` échoue. Une adresse tenue se lit.
//
// ═══ LE FILM D'ESSAI ═══
//
// Le « Générateur vidéo » au plus court : deux secondes, douze images par seconde, 960 × 540, soit
// vingt-quatre images à encoder. Il ne se met jamais en cache : chaque run en rend un neuf, et ce
// qui est branché derrière lui se relance aussi.
import { test, expect, type Page } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5282);

// Le presse-papiers, pour couper et coller un nœud.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const cercle = (id: string, y: number) => ({
  id, type: "atelier", position: { x: 0, y },
  data: { ficheId: "cercle-film", parametres: { "Durée": 2, "Cadence": 12, "Définition": "960 × 540", "Particules": 0 } },
});
const separer = (id: string, y: number) => ({
  id, type: "atelier", position: { x: 520, y }, data: { ficheId: "separer-image-son", parametres: {} },
});
const entree = (id: string, y: number) => ({
  id, type: "atelier", position: { x: 0, y }, data: { ficheId: "entree-audio", parametres: { Chemin: "" } },
});
const arete = (source: string, target: string) =>
  ({ id: `${source}-${target}`, source, target, sourceHandle: "out:0", targetHandle: "in:0" });

/** Les nœuds à l'écran, par identifiant. */
const ids = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__node")].map((n) => n.getAttribute("data-id")!).sort());

/** La vue se recadre encore après l'arrivée des nœuds : on attend qu'elle soit posée. */
async function cadrageStable(page: Page) {
  const transformation = () => page.evaluate(() =>
    (document.querySelector(".react-flow__viewport") as HTMLElement | null)?.style.transform ?? "");
  let avant = "";
  await expect.poll(async () => {
    const maintenant = await transformation();
    const stable = maintenant !== "" && maintenant === avant;
    avant = maintenant;
    return stable;
  }, { timeout: 15000, intervals: [400] }).toBe(true);
}

async function ouvrir(page: Page, noeuds: unknown[], aretes: unknown[] = []) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify({ nodes: noeuds, edges: aretes })]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await expect.poll(() => ids(page), { timeout: 15000 }).toHaveLength(noeuds.length);
  await cadrageStable(page);
}

/** Presse Lancer et attend que chaque nœud qui calcule ait fini. */
async function lancer(page: Page, calculent: string[]) {
  await page.click(".attic-btn-lancer");
  await page.waitForFunction((attendus) => attendus.every((id) => {
    const n = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    return !!n?.querySelector(".attic-node-statut-puce.termine, .attic-node-statut-puce.erreur");
  }), calculent, { timeout: 120000 });
  for (const id of calculent) {
    await expect(page.locator(`.react-flow__node[data-id="${id}"] .attic-node-statut-puce`), `${id} a fini sans erreur`).toHaveClass(/termine/);
  }
}

/** Ce que rend une adresse : sa taille en octets, ou -1 si elle ne se lit plus. */
const lire = (page: Page, url: string) => page.evaluate(async (u) => {
  try { return (await (await fetch(u)).arrayBuffer()).byteLength; } catch { return -1; }
}, url);

/**
 * Les adresses des films qu'un nœud montre : son lecteur, et le lien qui l'enregistre hors
 * d'Electron. « Séparer image et son » n'a que le lien.
 */
const films = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`).evaluate((n) =>
  [...new Set([...n.querySelectorAll("video[src], a[href]")]
    .map((e) => e.getAttribute("src") ?? e.getAttribute("href") ?? "")
    .filter((s) => s.startsWith("blob:")))]);

/** Le film que le nœud montre : il doit y en avoir un, et un seul. */
async function filmDu(page: Page, id: string): Promise<string> {
  await expect.poll(() => films(page, id), { message: `${id} montre un film`, timeout: 10000 }).toHaveLength(1);
  return (await films(page, id))[0];
}

/** Le balayage du registre part un quart de seconde après le dernier changement des nœuds. */
const laisserBalayer = (page: Page) => page.waitForTimeout(1000);

/**
 * Sélectionne un nœud d'un clic sur un point que rien ne recouvre, ni champ ni bouton, et recommence
 * tant qu'il n'est pas seul sélectionné. RELEVÉ une fois sur six passes : le clic n'avait rien
 * sélectionné. La cause supposée, non mesurée : le nœud du générateur grandit quand son lecteur a lu
 * le film, entre le relevé du point et le clic.
 */
async function selectionner(page: Page, id: string) {
  await expect(async () => {
    await cliquerSur(page, id);
    expect(await page.evaluate(() =>
      [...document.querySelectorAll(".react-flow__node.selected")].map((n) => n.getAttribute("data-id")).join(","))).toBe(id);
  }, { message: `seul ${id} est sélectionné` }).toPass({ timeout: 10000, intervals: [300, 600, 1000] });
}

async function cliquerSur(page: Page, id: string) {
  const p = await page.evaluate((id) => {
    const noeud = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!noeud) return null;
    const r = noeud.getBoundingClientRect();
    for (let fy = 0.05; fy < 1; fy += 0.05) for (let fx = 0.03; fx < 1; fx += 0.05) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const el = document.elementFromPoint(x, y);
      if (el?.closest(".react-flow__node")?.getAttribute("data-id") === id
        && !el.closest("input,textarea,select,button,label,canvas,audio,video,.react-flow__handle,.nodrag")) return { x, y };
    }
    return null;
  }, id);
  expect(p, `aucun point libre sur ${id}`).not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
}

async function supprimer(page: Page, id: string) {
  await selectionner(page, id);
  await page.keyboard.press("Delete");
  await expect.poll(() => ids(page)).not.toContain(id);
}

test.describe("les films rendus par un nœud", () => {
  test("LE GÉNÉRATEUR VIDÉO : son film précédent se révoque au run suivant, et le nouveau se lit", async ({ page }) => {
    test.setTimeout(180000);
    await ouvrir(page, [cercle("c", 0)]);
    await lancer(page, ["c"]);
    const premier = await filmDu(page, "c");
    await lancer(page, ["c"]);
    const second = await filmDu(page, "c");
    expect(second, "le second run rend un autre film").not.toBe(premier);
    await expect.poll(() => lire(page, premier), { message: "le premier film est révoqué", timeout: 5000 }).toBe(-1);
    expect(await lire(page, second), "le second se lit").toBeGreaterThan(0);
  });

  test("LE GÉNÉRATEUR VIDÉO : un Ctrl+Z après deux runs ne montre jamais un film mort", async ({ page }) => {
    test.setTimeout(180000);
    await ouvrir(page, [cercle("c", 0), entree("z", 700)]);
    await lancer(page, ["c"]);
    await filmDu(page, "c");
    await supprimer(page, "z");
    await lancer(page, ["c"]);
    const second = await filmDu(page, "c");
    await page.keyboard.press("Control+z");
    await expect.poll(() => ids(page)).toEqual(["c", "z"]);
    await laisserBalayer(page);
    // UN FILM, ET IL SE LIT : sans film, la question ne se poserait pas. L'annulation n'oublie que
    // les résultats des nœuds qui ne reviennent pas, et le générateur revient : il garde le sien.
    const montre = await filmDu(page, "c");
    expect(await lire(page, montre), `le nœud rendu par Ctrl+Z montre ${montre}, qui doit se lire`).toBeGreaterThan(0);
    expect(montre, "c'est le film du dernier run").toBe(second);
  });

  test("SUPPRIMER LE GÉNÉRATEUR VIDÉO révoque son film", async ({ page }) => {
    test.setTimeout(180000);
    await ouvrir(page, [cercle("c", 0), entree("z", 700)]);
    await lancer(page, ["c"]);
    const film = await filmDu(page, "c");
    await supprimer(page, "c");
    await expect.poll(() => lire(page, film), { message: "le film du nœud supprimé est révoqué", timeout: 5000 }).toBe(-1);
  });

  test("UN CTRL+Z QUI ABANDONNE LE GÉNÉRATEUR révoque son film : l'oubli descend dans le canal", async ({ page }) => {
    test.setTimeout(180000);
    await ouvrir(page, [cercle("c", 0), entree("z", 700)]);
    await selectionner(page, "c");
    await page.keyboard.press("Control+x");
    await expect.poll(() => ids(page)).toEqual(["z"]);
    await page.keyboard.press("Control+v");
    await expect.poll(async () => (await ids(page)).length).toBe(2);
    const colle = (await ids(page)).find((id) => id !== "z")!;
    await lancer(page, [colle]);
    const film = await filmDu(page, colle);
    // Ctrl+Z rend le canevas d'avant le collage, où le nœud collé n'existe pas : son résultat
    // s'oublie, et rien d'autre ne tient son film.
    await page.keyboard.press("Control+z");
    await expect.poll(() => ids(page)).toEqual(["z"]);
    await expect.poll(() => lire(page, film), { message: "le film du nœud abandonné est révoqué", timeout: 5000 }).toBe(-1);
  });

  test("SÉPARER IMAGE ET SON, derrière lui : sa vidéo muette précédente se révoque au run suivant", async ({ page }) => {
    test.setTimeout(180000);
    await ouvrir(page, [cercle("c", 0), separer("s", 0)], [arete("c", "s")]);
    await lancer(page, ["c", "s"]);
    const premier = await filmDu(page, "s");
    await lancer(page, ["c", "s"]);
    const second = await filmDu(page, "s");
    expect(second, "le second run rend une autre vidéo muette").not.toBe(premier);
    await expect.poll(() => lire(page, premier), { message: "la première vidéo muette est révoquée", timeout: 5000 }).toBe(-1);
    expect(await lire(page, second), "la seconde se lit").toBeGreaterThan(0);
  });
});
