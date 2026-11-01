// tests-e2e/menu-contextuel-dans-application.spec.ts — Le clic droit ouvre son menu, quelle que soit la
// façon dont la sélection a été faite.
//
// ═══ LE DÉFAUT QUI L'A FAIT NAÎTRE ═══
//
// Relevé le 2026-11-01 en tournant la vidéo des bulles, dans Electron : un cadre de sélection tiré
// autour de trois effets, puis un clic droit dessus, et AUCUN MENU. « Clarifier » ne s'atteignait que
// par Ctrl+clic sur chaque nœud, puis clic droit sur l'un d'eux.
//
// LA CAUSE EST DANS REACT FLOW, et `document.elementFromPoint` la montre. Après un cadre, la bibliothèque
// pose un rectangle, `react-flow__nodesselection-rect`, DEVANT les nœuds qu'il a pris : le clic droit
// n'atteint plus aucun nœud, donc jamais `onNodeContextMenu`. Il part vers `onSelectionContextMenu`, que
// le canevas ne branchait pas, puis remonte au fond, qui l'avale sans rien appeler dès que le bouton
// droit déplace la vue (`panOnDrag={[2]}`). Après un Ctrl+clic, aucun rectangle : d'où les deux
// comportements.
//
// ═══ CE QUE LES CAS TIENNENT ═══
//
// Un clic droit sur une sélection faite au cadre rend LE MÊME MENU qu'un clic droit sur le nœud visé :
// « Clarifier » sur des composants, « Ouvrir » et « Développer » sur une bulle. Chaque cas prouve d'abord
// que c'est bien le rectangle qui reçoit le clic, sans quoi il passerait sans rien éprouver.
//
// LE FOND VIDE, MESURÉ EN CHERCHANT LA CAUSE, avait son propre défaut. React Flow ne l'avale pas tout à
// fait : il appelle `onPaneContextMenu` au relâchement, mais seulement si la vue n'a pas bougé, et le
// moindre `mousemove` pendant l'appui compte pour un déplacement. Relevé : « Clarifier » au clic
// immobile, rien dès qu'un mouvement s'intercale, fût-il de zéro pixel, quand un nœud tolère trois
// pixels et refuse six. LA DÉCISION : le fond garde ce qu'il proposait, « Clarifier » à une sélection
// d'au moins deux composants et rien sans elle, le bouton droit restant le geste qui déplace la vue ;
// mais il passe désormais par le même seuil que le reste.
import { expect, test, type Page } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";
import { semer } from "./pilote-graphe";

const devUrl = serveurDeVerification(5276);

const ecoute = (id: string, x: number, y: number, bulle?: string) =>
  ({ id, position: { x, y }, data: { ficheId: "point-ecoute", parametres: {}, ...(bulle ? { bulle } : {}) } });
const arete = (source: string, target: string) =>
  ({ id: `e-${source}-${target}`, source, target, sourceHandle: "out:0", targetHandle: "in:0" });
const TON = { id: "t", position: { x: 0, y: 300 }, data: { ficheId: "generateur-frequence", parametres: { "Durée": 1 } } };

/** Une chaîne de trois écoutes posées en colonne : un cadre les prend toutes les trois, et rien d'autre. */
const GRAPHE_COLONNE = JSON.stringify({
  nodes: [TON, ecoute("e1", 500, 0), ecoute("e2", 500, 300), ecoute("e3", 500, 600), ecoute("s", 1000, 300)],
  edges: [arete("t", "e1"), arete("e1", "e2"), arete("e2", "e3"), arete("e3", "s")],
});

/** La même chaîne, ses trois écoutes repliées dans une bulle. */
const GRAPHE_BULLE = JSON.stringify({
  nodes: [TON, ecoute("e1", 500, 0, "b"), ecoute("e2", 500, 300, "b"), ecoute("e3", 500, 600, "b"), ecoute("s", 1000, 300),
    { id: "b", position: { x: 500, y: 300 }, data: { ficheId: "bulle::b", parametres: {}, bulleOuverte: false } }],
  edges: [arete("t", "e1"), arete("e1", "e2"), arete("e2", "e3"), arete("e3", "s")],
});

async function poser(page: Page, graphe: string): Promise<void> {
  await page.addInitScript(() => { localStorage.setItem("attic-lang", "fr"); });
  await page.setViewportSize({ width: 1600, height: 900 });
  await semer(page, devUrl, graphe);
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(500);
}

const noeud = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

async function boite(page: Page, id: string) {
  const b = await noeud(page, id).boundingBox();
  if (!b) throw new Error(`le nœud ${id} n'est pas à l'écran`);
  return b;
}

/** Tire un cadre de sélection du coin haut-gauche du premier nœud au coin bas-droit du dernier. */
async function cadre(page: Page, premier: string, dernier: string): Promise<void> {
  const a = await boite(page, premier);
  const z = await boite(page, dernier);
  await page.mouse.move(a.x - 25, a.y - 25);
  await page.mouse.down();
  await page.mouse.move(z.x + z.width + 25, z.y + z.height + 25, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

const selectionnes = (page: Page): Promise<string[]> =>
  page.locator(".react-flow__node.selected").evaluateAll((ns) => ns.map((n) => n.getAttribute("data-id") ?? "").sort());

/** La classe de l'élément que le pointeur touche en ce point : c'est lui qui reçoit le clic. */
const sousLePointeur = (page: Page, x: number, y: number): Promise<string> =>
  page.evaluate(([px, py]) => String(document.elementFromPoint(px, py)?.className ?? ""), [x, y]);

/** Un clic droit en ce point, et les entrées du menu qu'il ouvre, une liste vide s'il n'en ouvre aucun. */
async function clicDroit(page: Page, x: number, y: number): Promise<string[]> {
  await page.mouse.click(x, y, { button: "right" });
  await page.waitForTimeout(300);
  return page.locator(".attic-menu-contextuel-item").allTextContents();
}

/**
 * Le même clic, le pointeur ayant bougé de `ecart` pixels entre la descente et le relâchement.
 *
 * C'EST LE CLIC D'UNE MAIN, et non celui de `mouse.click`, qui ne bouge jamais : Playwright émet un
 * `mousemove` même pour zéro pixel, ce que fait aussi une souris réelle au moindre tremblement.
 */
async function clicDroitQuiTremble(page: Page, x: number, y: number, ecart: number): Promise<string[]> {
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + ecart, y, { steps: Math.min(10, Math.max(1, ecart)) });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(300);
  return page.locator(".attic-menu-contextuel-item").allTextContents();
}

/** Ajoute ces nœuds à la sélection par Ctrl+clic sur leur en-tête, ce qui ne pose aucun rectangle. */
async function ctrlCliquer(page: Page, ids: string[]): Promise<void> {
  for (const id of ids) {
    const b = await boite(page, id);
    await page.keyboard.down("Control");
    await page.mouse.click(b.x + 30, b.y + 10);
    await page.keyboard.up("Control");
    await page.waitForTimeout(200);
  }
}

/** Un point du fond vide, sous la dernière écoute. */
async function fond(page: Page): Promise<{ x: number; y: number }> {
  const s = await boite(page, "s");
  return { x: s.x + s.width / 2, y: s.y + s.height + 120 };
}

/** La transformation de la vue, qu'un déplacement change. */
const vue = (page: Page): Promise<string> =>
  page.evaluate(() => getComputedStyle(document.querySelector(".react-flow__viewport")!).transform);

const MENU_ABSENT = [
  "",
  "LE CLIC DROIT SUR UNE SÉLECTION FAITE AU CADRE N'OUVRE AUCUN MENU.",
  "Le rectangle `react-flow__nodesselection-rect` couvre la sélection : le clic droit ne va ni au nœud",
  "ni au fond, mais à `onSelectionContextMenu`, qui doit être branché sur le menu du canevas.",
  "",
].join("\n");

test.describe("le clic droit ouvre son menu, quelle que soit la façon dont la sélection a été faite", () => {
  test.setTimeout(120_000);

  test("SUR DES COMPOSANTS PRIS AU CADRE, LE MENU OFFRE « CLARIFIER », et le geste les replie", async ({ page }) => {
    await poser(page, GRAPHE_COLONNE);
    await cadre(page, "e1", "e3");
    expect(await selectionnes(page)).toEqual(["e1", "e2", "e3"]);
    const b = await boite(page, "e2");
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    expect(await sousLePointeur(page, x, y), "le cadre a posé son rectangle devant les nœuds").toContain("react-flow__nodesselection-rect");
    expect(await clicDroit(page, x, y), MENU_ABSENT).toEqual(["Clarifier"]);
    await page.locator(".attic-menu-contextuel-item", { hasText: "Clarifier" }).click();
    // Repliés : les trois écoutes quittent l'écran, et un seul nœud neuf les remplace.
    await expect(noeud(page, "e2")).toBeHidden();
    const visibles = await page.locator(".react-flow__node:visible").evaluateAll((ns) => ns.map((n) => n.getAttribute("data-id") ?? "").sort());
    expect(visibles.filter((id) => !["t", "s"].includes(id)), `nœuds visibles après le repli : ${JSON.stringify(visibles)}`).toHaveLength(1);
  });

  test("ENTRE DEUX NŒUDS DU CADRE, LE MENU EST LE MÊME", async ({ page }) => {
    await poser(page, GRAPHE_COLONNE);
    await cadre(page, "e1", "e3");
    const h = await boite(page, "e1");
    const m = await boite(page, "e2");
    const x = h.x + h.width / 2, y = (h.y + h.height + m.y) / 2;
    expect(await sousLePointeur(page, x, y), "le point visé est dans le rectangle et hors des nœuds").toContain("react-flow__nodesselection-rect");
    expect(await clicDroit(page, x, y), MENU_ABSENT).toEqual(["Clarifier"]);
  });

  test("UNE BULLE PRISE AU CADRE S'OUVRE ENCORE AU CLIC DROIT", async ({ page }) => {
    await poser(page, GRAPHE_BULLE);
    await cadre(page, "b", "b");
    expect(await selectionnes(page)).toEqual(["b"]);
    const b = await boite(page, "b");
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    expect(await sousLePointeur(page, x, y), "le cadre a posé son rectangle devant la bulle").toContain("react-flow__nodesselection-rect");
    expect(await clicDroit(page, x, y), [
      "",
      "LA BULLE PRISE AU CADRE NE PROPOSE NI « OUVRIR » NI « DÉVELOPPER ».",
      "Le rectangle de la sélection est devant elle : le menu doit chercher le nœud sous le pointeur,",
      "comme le fait un clic droit posé directement sur lui.",
      "",
    ].join("\n")).toEqual(["Ouvrir", "Développer"]);
  });

  test("SUR LE FOND VIDE, LE MENU OFFRE « CLARIFIER » À UNE SÉLECTION, même d'une main qui tremble, et rien sans elle", async ({ page }) => {
    await poser(page, GRAPHE_COLONNE);
    const { x, y } = await fond(page);
    expect(await sousLePointeur(page, x, y), "le point visé est sur le fond").toContain("react-flow__pane");
    expect(await clicDroit(page, x, y), "sans sélection, le fond n'a rien à proposer").toEqual([]);
    await ctrlCliquer(page, ["e1", "e2"]);
    expect(await selectionnes(page)).toEqual(["e1", "e2"]);
    // Le TÉMOIN : sur un nœud, trois pixels de tremblement passent sous le seuil du canevas.
    const e2 = await boite(page, "e2");
    expect(await clicDroitQuiTremble(page, e2.x + e2.width / 2, e2.y + e2.height / 2, 3), "le seuil tient sur un nœud").toEqual(["Clarifier"]);
    expect(await clicDroitQuiTremble(page, x, y, 3), [
      "",
      "SUR LE FOND, TROIS PIXELS DE TREMBLEMENT SUFFISENT À N'OUVRIR AUCUN MENU, quand le nœud les tolère.",
      "Le fond passait par `onPaneContextMenu`, que React Flow n'appelle qu'au bout d'un déplacement de",
      "vue resté nul : le moindre `mousemove` en est un. Il doit passer par l'événement natif et le seuil.",
      "",
    ].join("\n")).toEqual(["Clarifier"]);
  });

  test("UN GLISSEMENT DU BOUTON DROIT SUR LE FOND DÉPLACE LA VUE ET N'OUVRE AUCUN MENU", async ({ page }) => {
    await poser(page, GRAPHE_COLONNE);
    const { x, y } = await fond(page);
    await ctrlCliquer(page, ["e1", "e2"]);
    const avant = await vue(page);
    const entrees = await clicDroitQuiTremble(page, x, y, 80);
    expect(await vue(page), "le glissement a déplacé la vue").not.toBe(avant);
    expect(entrees, "l'événement de menu arrive au relâchement d'un glissement, et ne doit rien ouvrir").toEqual([]);
  });
});
