// tests-e2e/retablir-dans-application.spec.ts — Ctrl+Y rend ce que Ctrl+Z vient de retirer, dans
// l'application.
//
// ═══ POURQUOI CETTE ÉPREUVE ═══
//
// Demandé par Fabien le 2026-11-10, au point A6 de la revue d'architecture du 2026-10-31 : seul
// Ctrl+Z existait. La règle des deux piles vit dans `ui/historique.ts` et s'éprouve dans
// `ui/historique.test.ts` ; ce qui ne se voit que d'ici, c'est qu'elle soit BRANCHÉE : les touches
// lues par `hooks/useCopierColler.ts`, l'état courant photographié par `hooks/useHistorique.ts` au
// moment où Ctrl+Z le quitte, avec la navigation et le fichier quand l'entrée les porte.
//
// ═══ CE QU'ELLE TIENT ═══
//
// 1. Ctrl+Y et Ctrl+Maj+Z rendent le nœud supprimé que Ctrl+Z avait rendu, et rien au-delà.
// 2. Une action neuve après Ctrl+Z efface ce qui se rétablissait.
// 3. Le canevas vidé se rétablit avec son fichier détaché, et Ctrl+Z rend l'un et l'autre.
// 4. Dans un champ de saisie, Ctrl+Y reste au champ : les nœuds ne bougent pas, et le
//    rétablissement attend qu'on en sorte.
import { test, expect, type Page } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5280);

/**
 * Trois entrées audio sans fichier, sans câble entre elles : ce qui compte ici, c'est leur présence.
 * EN COLONNE, parce que le cadrage pris au chargement varie d'une passe à l'autre : posés en ligne,
 * ils passaient sous l'inspecteur au zoom ×2, et le clic tombait sur lui.
 */
const GRAPHE = {
  nodes: ["a", "b", "c"].map((id, i) => ({
    id, type: "atelier", position: { x: 0, y: i * 200 },
    data: { ficheId: "entree-audio", parametres: { Chemin: "" } },
  })),
  edges: [],
};

/** Les nœuds à l'écran, par identifiant. */
const ids = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__node")].map((n) => n.getAttribute("data-id")).sort());

/**
 * LE CADRAGE POSÉ, ET NON SEULEMENT LES NŒUDS. La vue se recadre encore après leur arrivée : un clic
 * visé pendant qu'elle bouge tombait à côté du nœud, sur l'inspecteur. On attend donc que la
 * transformation du canevas soit la même sur deux relevés espacés.
 */
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

/** L'atelier ouvert sur le graphe d'essai, repris comme une séance précédente. */
async function ouvrir(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(GRAPHE)]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await expect.poll(() => ids(page), { timeout: 15000 }).toEqual(["a", "b", "c"]);
  await cadrageStable(page);
}

/** Un point du nœud que rien ne recouvre, et qui n'est ni un champ ni un bouton. */
async function pointLibre(page: Page, id: string): Promise<{ x: number; y: number }> {
  const p = await page.evaluate((id) => {
    const noeud = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!noeud) return null;
    const r = noeud.getBoundingClientRect();
    for (let fy = 0.05; fy < 1; fy += 0.05) for (let fx = 0.03; fx < 1; fx += 0.05) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const el = document.elementFromPoint(x, y);
      if (el?.closest(".react-flow__node")?.getAttribute("data-id") === id
        && !el.closest("input,textarea,select,button,label,canvas,.react-flow__handle,.nodrag")) return { x, y };
    }
    return null;
  }, id);
  expect(p, `aucun point libre sur ${id}`).not.toBeNull();
  return p!;
}

/** Supprime un nœud comme à la main : un clic sur un point libre, puis la touche Suppr. */
async function supprimer(page: Page, id: string) {
  const p = await pointLibre(page, id);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect.poll(() => ids(page)).not.toContain(id);
}

async function apres(page: Page, touches: string, attendus: string[], message: string) {
  await page.keyboard.press(touches);
  await expect.poll(() => ids(page), { message }).toEqual(attendus);
}

test.describe("le rétablissement", () => {
  test("CTRL+Y ET CTRL+MAJ+Z RENDENT LE NŒUD SUPPRIMÉ QUE CTRL+Z AVAIT RENDU, et rien au-delà", async ({ page }) => {
    test.setTimeout(120000);
    await ouvrir(page);
    await supprimer(page, "b");
    await apres(page, "Control+z", ["a", "b", "c"], "Ctrl+Z rend le nœud supprimé");
    await apres(page, "Control+y", ["a", "c"], "Ctrl+Y le retire de nouveau");
    await apres(page, "Control+z", ["a", "b", "c"], "Ctrl+Z le rend encore");
    await apres(page, "Control+Shift+Z", ["a", "c"], "Ctrl+Maj+Z rétablit comme Ctrl+Y");
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(400);
    expect(await ids(page), "rien au-delà du dernier pas").toEqual(["a", "c"]);
    await apres(page, "Control+z", ["a", "b", "c"], "un seul pas à annuler");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
    expect(await ids(page), "rien en deçà du premier").toEqual(["a", "b", "c"]);
  });

  test("UNE ACTION NEUVE APRÈS CTRL+Z EFFACE CE QUI SE RÉTABLISSAIT", async ({ page }) => {
    test.setTimeout(120000);
    await ouvrir(page);
    await supprimer(page, "b");
    await apres(page, "Control+z", ["a", "b", "c"], "Ctrl+Z rend le nœud supprimé");
    await supprimer(page, "c");
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(400);
    expect(await ids(page), "Ctrl+Y n'écrase pas la suppression qui a suivi").toEqual(["a", "b"]);
    await apres(page, "Control+z", ["a", "b", "c"], "Ctrl+Z annule la suppression neuve");
  });

  test("LE CANEVAS VIDÉ SE RÉTABLIT AVEC SON FICHIER DÉTACHÉ, et Ctrl+Z rend l'un et l'autre", async ({ page }) => {
    test.setTimeout(120000);
    // Un pont réduit à ce que l'import lit : le chemin du fichier ouvert.
    await page.addInitScript(() => {
      localStorage.removeItem("attic-encours");
      (window as any).api = { cheminFichier: () => "C:/projets/essai.json" };
    });
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.locator('input[type=file][accept=".json"]').setInputFiles({
      name: "essai.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(GRAPHE)),
    });
    await expect.poll(() => ids(page), { timeout: 15000 }).toEqual(["a", "b", "c"]);
    const nom = page.locator(".attic-nom-fichier");
    await expect(nom).toContainText("essai.json");

    await page.locator(".attic-onglet-fermer").click();
    await expect.poll(() => ids(page), { message: "le ✕ vide le canevas" }).toEqual([]);
    await expect(nom).toHaveCount(0);
    await apres(page, "Control+z", ["a", "b", "c"], "Ctrl+Z rend le graphe vidé");
    await expect(nom, "et le fichier détaché").toContainText("essai.json");
    await apres(page, "Control+y", [], "Ctrl+Y vide de nouveau");
    await expect(nom, "et détache de nouveau le fichier").toHaveCount(0);
    await apres(page, "Control+z", ["a", "b", "c"], "Ctrl+Z rend encore le graphe");
    await expect(nom).toContainText("essai.json");
  });

  test("DANS UN CHAMP DE SAISIE, CTRL+Y RESTE AU CHAMP, et le rétablissement attend", async ({ page }) => {
    test.setTimeout(120000);
    await ouvrir(page);
    await supprimer(page, "b");
    await apres(page, "Control+z", ["a", "b", "c"], "Ctrl+Z rend le nœud supprimé");
    const champ = page.locator(".palette-recherche");
    await expect(champ, "le champ de recherche de la palette").toHaveCount(1);
    await champ.click();
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(400);
    expect(await ids(page), "Ctrl+Y dans le champ ne touche pas aux nœuds").toEqual(["a", "b", "c"]);
    await page.locator(".react-flow__pane").click({ position: { x: 40, y: 400 } });
    await apres(page, "Control+y", ["a", "c"], "hors du champ, Ctrl+Y rétablit");
  });
});
