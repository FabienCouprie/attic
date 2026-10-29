// tests-e2e/rendu-image-taille-dans-application.spec.ts — Une image tient dans le cadre de son nœud, et le cadre ne bouge pas.
//
// LE DÉFAUT, RELEVÉ PAR FABIEN LE 2026-10-28 : exécuter « Rendu image », remettre à zéro, et le
// composant paraît plus long que sa taille d'ouverture, qu'il ne retrouve plus. Reproduit ici avant
// toute correction : né à 320 × 320, le nœud tombait à 320 × 123 dès sa pose, sa vue n'ayant de
// poignée qu'avec une image ; l'image arrivée, le corps du nœud remplissait ce cadre réduit, et
// l'image, le message, les ports et le statut débordaient d'environ 200 px dessous.
//
// LA LISTE DES COMPOSANTS EST TIRÉE DU CODE, non recopiée : tout composant dont la vue rend
// `SongseeVue` est éprouvé, et un composant qui l'emploiera demain le sera le jour même.
//
// CE QUI EST TENU : le cadre reste à sa taille déclarée, et la rangée de statut, dernière du nœud,
// reste dans le cadre. La source de l'image est « Attracteur / IFS », qui ne demande aucun fichier.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

import { VUES_IMAGE, VUES_IMAGE_AVEC_LECTEUR } from "../src/ui/tailles-noeuds";
import { etatDesNoeuds, relancerEtAttendre, semerEtLancer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5271);
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Les composants dont la vue rend `SongseeVue` : les fonctions de vue qui l'emploient, puis leurs fiches. */
function composantsAImage(): string[] {
  const vues = readFileSync(resolve(RACINE, "src/vues-domaine/vues-images.tsx"), "utf8");
  const fonctions = [...vues.matchAll(/export function (Vue\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)]
    .filter((m) => m[2].includes("<SongseeVue")).map((m) => m[1]);
  const table = readFileSync(resolve(RACINE, "src/vues-domaine/vues.tsx"), "utf8");
  return [...table.matchAll(/parId\("([^"]+)"\),\s*vue:\s*(Vue\w+)/g)]
    .filter((m) => fonctions.includes(m[2])).map((m) => m[1]);
}

/** Le cadre du nœud et le bas de sa rangée de statut, en pixels de mise en page. */
async function cadre(page: Page, id: string) {
  return page.evaluate((nid) => {
    const el = document.querySelector(`.react-flow__node[data-id="${nid}"]`) as HTMLElement | null;
    const statut = el?.querySelector(".attic-node-statut") as HTMLElement | null;
    if (!el || !statut) return null;
    // Le canevas est mis à l'échelle : le débord se mesure dans le rapport des deux rectangles.
    const r = el.getBoundingClientRect(), s = statut.getBoundingClientRect(), echelle = r.height / el.offsetHeight;
    const vue = el.querySelector(".attic-node-songsee") as HTMLElement | null;
    return {
      largeur: el.offsetWidth, hauteur: el.offsetHeight,
      debord: Math.round((s.bottom - r.bottom) / echelle), image: el.querySelectorAll("img").length,
      placeImage: vue?.offsetHeight ?? 0,
    };
  }, id);
}

test("TOUT COMPOSANT QUI MONTRE UNE IMAGE GARDE SON CADRE DÈS SA POSE, sans que son statut en déborde", async ({ page }) => {
  test.setTimeout(120000);
  const ids = composantsAImage();
  expect(ids.length, "aucun composant à image trouvé : la lecture du code est cassée").toBeGreaterThanOrEqual(8);
  expect(ids).toContain("rendu-image");
  const graphe = JSON.stringify({
    nodes: ids.map((ficheId, i) => ({ id: `n${i}`, position: { x: (i % 3) * 380, y: Math.floor(i / 3) * 520 }, data: { ficheId, parametres: {} } })),
    edges: [],
  });
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 15000 });
  await page.evaluate((g) => localStorage.setItem("attic-encours", g), graphe);
  await page.reload();
  await page.waitForSelector(".attic-app", { timeout: 15000 });
  await page.waitForTimeout(2500);
  const fautes: string[] = [];
  for (const [i, ficheId] of ids.entries()) {
    const c = await cadre(page, `n${i}`);
    if (!c) { fautes.push(`${ficheId} : nœud absent`); continue; }
    if (VUES_IMAGE.has(ficheId) && (c.largeur !== 320 || c.hauteur !== 320)) fautes.push(`${ficheId} : ${c.largeur} × ${c.hauteur} au lieu de 320 × 320`);
    if (VUES_IMAGE_AVEC_LECTEUR.has(ficheId) && (c.largeur !== 320 || c.hauteur !== 480)) fautes.push(`${ficheId} : ${c.largeur} × ${c.hauteur} au lieu de 320 × 480`);
    if (c.placeImage < 120) fautes.push(`${ficheId} : ${c.placeImage} px pour l'image`);
    if (c.hauteur < 300) fautes.push(`${ficheId} : cadre réduit à ${c.hauteur} px`);
    if (c.debord > 1) fautes.push(`${ficheId} : le statut déborde de ${c.debord} px`);
  }
  expect(fautes).toEqual([]);
});

test("« RENDU IMAGE » GARDE 320 × 320 AU RUN ET À LA REMISE À ZÉRO, l'image dans son cadre", async ({ page }) => {
  test.setTimeout(120000);
  page.on("dialog", (d) => d.accept());
  const graphe = JSON.stringify({
    nodes: [
      { id: "source", position: { x: 0, y: 0 }, data: { ficheId: "attracteur-ifs", parametres: {} } },
      { id: "rendu", position: { x: 420, y: 0 }, data: { ficheId: "rendu-image", parametres: {} } },
    ],
    edges: [{ id: "e1", source: "source", sourceHandle: "out:0", target: "rendu", targetHandle: "in:0" }],
  });
  const releves: string[] = [];
  await semerEtLancer(page, devUrl, graphe, {
    avantDeLancer: async (p) => { releves.push(`pose : ${JSON.stringify(await cadre(p, "rendu"))}`); },
  });
  await page.waitForTimeout(1500);
  const apresRun = await cadre(page, "rendu");
  releves.push(`run : ${JSON.stringify(apresRun)}`);
  // LA SOURCE PORTE UN LECTEUR APRÈS LE RUN, et c'est là que l'image se faisait écraser : à 320 px de
  // haut, il ne lui restait qu'environ 65 px.
  const source = await cadre(page, "source");
  releves.push(`source après le run : ${JSON.stringify(source)}`);
  await relancerEtAttendre(page);
  await page.waitForTimeout(1500);
  releves.push(`second run : ${JSON.stringify(await cadre(page, "rendu"))}`);
  await page.locator('button[aria-label*="Réinitialiser"], button[aria-label*="Reset"]').first().click();
  await page.waitForTimeout(1500);
  const apresReset = await cadre(page, "rendu");
  releves.push(`remise à zéro : ${JSON.stringify(apresReset)}`);
  const rapport = releves.join("\n");

  expect(apresRun?.image, rapport).toBe(1);
  expect([apresRun?.largeur, apresRun?.hauteur, apresReset?.largeur, apresReset?.hauteur], rapport).toEqual([320, 320, 320, 320]);
  expect(apresRun!.debord, rapport).toBeLessThanOrEqual(1);
  expect(apresReset!.debord, rapport).toBeLessThanOrEqual(1);
  expect(source!.debord, rapport).toBeLessThanOrEqual(1);
  expect(source!.placeImage, rapport).toBeGreaterThanOrEqual(120);
});

// RELEVÉ LE 2026-10-29 : trois composants rendaient une image que leur nœud ne montrait pas, faute
// de vue au registre. La pose ne le dit pas, aucune image n'y étant encore : il faut un run, qui
// éprouve le chemin entier, de l'exécution au magasin des résultats jusqu'à la vue. MOSS demande son
// modèle et Electron, et `moss-dans-application.spec.ts` le tient ; les deux autres tournent dans le
// navigateur et sont tenus ici, le fractal servant de source au spectrogramme.
test("LES COMPOSANTS QUI N'AVAIENT PAS DE VUE MONTRENT LEUR IMAGE APRÈS UN RUN, dans leur cadre", async ({ page }) => {
  test.setTimeout(180000);
  const graphe = JSON.stringify({
    nodes: [
      { id: "fractal", position: { x: 0, y: 0 }, data: { ficheId: "spectrogramme-fractal", parametres: { "Durée": 1 } } },
      { id: "spectre", position: { x: 420, y: 0 }, data: { ficheId: "son-spectrogramme", parametres: {} } },
      { id: "image", position: { x: 840, y: 0 }, data: { ficheId: "spectrogramme-image", parametres: {} } },
    ],
    edges: [
      { id: "e1", source: "fractal", sourceHandle: "out:1", target: "spectre", targetHandle: "in:0" },
      { id: "e2", source: "spectre", sourceHandle: "out:0", target: "image", targetHandle: "in:0" },
    ],
  });
  await semerEtLancer(page, devUrl, graphe);
  await page.waitForTimeout(1500);
  const releves: Record<string, unknown> = { etats: await etatDesNoeuds(page) };
  for (const [id, taille] of [["fractal", [320, 480]], ["image", [320, 320]]] as const) {
    const c = await cadre(page, id);
    // DÉCODÉE, et non seulement posée : une balise dont l'adresse ne mène à rien a zéro de large.
    const decodee = await page.evaluate((nid) => {
      const img = document.querySelector(`.react-flow__node[data-id="${nid}"] img`) as HTMLImageElement | null;
      return img ? [img.naturalWidth, img.naturalHeight] : null;
    }, id);
    releves[id] = { ...c, decodee };
    const rapport = JSON.stringify(releves);
    expect(c?.image, `${id} ne montre pas son image : ${rapport}`).toBe(1);
    expect(Math.min(...(decodee ?? [0])), rapport).toBeGreaterThan(0);
    expect([c?.largeur, c?.hauteur], rapport).toEqual(taille);
    expect(c!.placeImage, rapport).toBeGreaterThanOrEqual(120);
    expect(c!.debord, rapport).toBeLessThanOrEqual(1);
  }
  console.log(JSON.stringify(releves));
});
