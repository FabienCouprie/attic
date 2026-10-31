// tests-e2e/copier-coller-annotations-dans-application.spec.ts — Une note et un cadre se copient, se
// coupent et se collent comme un nœud.
//
// ═══ LE DÉFAUT QUI L'A FAIT NAÎTRE ═══
//
// Relevé par Fabien le 2026-10-31 : sur le canevas, on ne pouvait plus copier, couper ni coller les
// notes et les cadres. Mesuré dans l'application avant correction : une note, un cadre et un
// oscillateur sélectionnés, Ctrl+C puis Ctrl+V ne collaient que l'oscillateur.
//
// LA CAUSE EST DANS `f8d003a` (PR #232, deux fenêtres). Le collage y refuse, en le nommant, un
// composant que la fenêtre ne connaît pas, et il le demandait au seul registre : une note
// (`comment`) et un cadre (`frame`) n'y ont jamais eu de fiche. Le collage d'avant n'avait pas ce
// filtre. Les nœuds ordinaires, eux, se collaient toujours.
//
// ═══ POURQUOI DE BOUT EN BOUT ═══
//
// Le tri vit dans `trierCollage` de `ui/presse-papiers-noeuds.ts`, et ses cas unitaires l'éprouvent.
// Mais c'est le crochet qui l'appelle, la sélection du canevas qui le nourrit et la persistance qui
// doit ramener ce qui a été collé : leur rencontre ne se voit que dans l'application.
//
// LE PRESSE-PAPIERS EST CELUI DE CHROMIUM SANS TÊTE, les deux permissions accordées : le collage
// passe donc par le JSON signé, comme entre deux fenêtres. Le cas qui copie le vérifie.
import { expect, test, type Page } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";
import { semer } from "./pilote-graphe";

const devUrl = serveurDeVerification(5275);

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

// DATÉE DANS LE PASSÉ : le journal de session n'écrase pas un en-cours sans date, et le cas de la
// sauvegarde demande qu'il réécrive celui-ci.
const PASSE = "2000-01-01T00:00:00.000Z";
const VERT = "rgba(59, 192, 73, 0.12)";

/** Une note à côté d'un cadre, et un oscillateur posé dans le cadre. */
const GRAPHE = JSON.stringify({
  nodes: [
    { id: "n1", type: "atelier", position: { x: 0, y: 0 }, width: 260, height: 140,
      data: { ficheId: "comment", parametres: {}, nom: "Texte de la note" } },
    { id: "f1", type: "atelier", position: { x: 400, y: -40 }, width: 520, height: 460,
      data: { ficheId: "frame", parametres: {}, nom: "Titre du cadre", couleur: VERT } },
    { id: "o1", type: "atelier", position: { x: 450, y: 40 }, data: { ficheId: "oscillateur", parametres: {} } },
  ],
  edges: [],
  date: PASSE,
});

interface Pose { id: string; genre: "note" | "cadre" | "noeud"; x: number; y: number; w: number; h: number; texte: string; couleur: string }

/** Ce que montre le canevas : position et taille en unités du graphe, texte et couleur affichés. */
const canevas = (page: Page): Promise<Pose[]> => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>(".react-flow__node")].map((n) => {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(n.style.transform) ?? [];
    const corps = n.querySelector<HTMLElement>(".attic-node");
    const champ = n.querySelector<HTMLInputElement>("textarea.attic-node-comment-texte, input.attic-node-frame-titre");
    const genre = corps?.classList.contains("comment") ? "note" : corps?.classList.contains("frame") ? "cadre" : "noeud";
    return {
      id: n.dataset.id!, genre, x: Number(m[1]), y: Number(m[2]),
      w: parseFloat(n.style.width), h: parseFloat(n.style.height),
      texte: champ?.value ?? "", couleur: genre === "cadre" ? corps!.style.background : "",
    } as Pose;
  }));

/** Les nœuds arrivés depuis `avant`, un par genre. */
async function arrives(page: Page, avant: string[]): Promise<Partial<Record<Pose["genre"], Pose>>> {
  const neufs = (await canevas(page)).filter((p) => !avant.includes(p.id));
  return Object.fromEntries(neufs.map((p) => [p.genre, p]));
}

/** Un point du nœud qui soit le sien au premier plan, hors champ et hors bouton. */
async function pointLibre(page: Page, id: string): Promise<{ x: number; y: number }> {
  const p = await page.evaluate((id) => {
    const noeud = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!noeud) return null;
    const r = noeud.getBoundingClientRect();
    for (let fy = 0.05; fy < 1; fy += 0.05) for (let fx = 0.03; fx < 1; fx += 0.05) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const el = document.elementFromPoint(x, y);
      if (el?.closest(".react-flow__node")?.getAttribute("data-id") === id
        && !el.closest("input,textarea,select,button,canvas,.react-flow__handle,.nodrag")) return { x, y };
    }
    return null;
  }, id);
  expect(p, `aucun point libre sur ${id}`).not.toBeNull();
  return p!;
}

/** Un clic sur le canevas nu, qui retire la sélection. */
async function cliquerVide(page: Page): Promise<void> {
  const p = await page.evaluate(() => {
    const r = document.querySelector(".react-flow__pane")!.getBoundingClientRect();
    for (let fy = 0.95; fy > 0.05; fy -= 0.05) for (let fx = 0.95; fx > 0.05; fx -= 0.05) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
    }
    return null;
  });
  expect(p, "aucun point nu sur le canevas").not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
}

/** Sélectionne ces nœuds comme à la souris : un clic, puis Ctrl+clic pour les suivants. */
async function selectionner(page: Page, ids: string[]): Promise<void> {
  for (const [i, id] of ids.entries()) {
    const p = await pointLibre(page, id);
    if (i > 0) await page.keyboard.down("Control");
    await page.mouse.click(p.x, p.y);
    if (i > 0) await page.keyboard.up("Control");
  }
  const choisis = await page.evaluate(() => [...document.querySelectorAll(".react-flow__node.selected")].map((n) => n.getAttribute("data-id")));
  expect(choisis.sort(), "la sélection faite à la souris").toEqual([...ids].sort());
}

/** Sème le graphe et relève les dialogues : un collage refusé le dit par une alerte. */
async function poser(page: Page): Promise<string[]> {
  const dialogues: string[] = [];
  page.on("dialog", (d) => { dialogues.push(d.message()); void d.accept(); });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await semer(page, devUrl, GRAPHE);
  return dialogues;
}

/** Le décalage d'un nœud collé à un autre doit être celui des originaux, à l'arrondi près : le
 * collage se place sur le barycentre de la sélection, qui n'est pas entier. */
function memeDecalage(a: Pose, b: Pose, dx: number, dy: number, quoi: string) {
  expect(b.x - a.x, `${quoi} : la position relative est gardée`).toBeCloseTo(dx, 6);
  expect(b.y - a.y, `${quoi} : la position relative est gardée`).toBeCloseTo(dy, 6);
}

function noteIntacte(note: Pose | undefined) {
  expect(note, "LA NOTE N'A PAS ÉTÉ COLLÉE : le collage l'a prise pour un composant inconnu").toBeDefined();
  expect(note!.texte, "la note garde son texte").toBe("Texte de la note");
  expect([note!.w, note!.h], "la note garde sa taille").toEqual([260, 140]);
}

function cadreIntact(cadre: Pose | undefined) {
  expect(cadre, "LE CADRE N'A PAS ÉTÉ COLLÉ : le collage l'a pris pour un composant inconnu").toBeDefined();
  expect(cadre!.texte, "le cadre garde son titre").toBe("Titre du cadre");
  expect(cadre!.couleur, "le cadre garde sa couleur").toBe(VERT);
  expect([cadre!.w, cadre!.h], "le cadre garde sa taille").toEqual([520, 460]);
}

test.describe("copier, couper, coller une note et un cadre", () => {
  test.setTimeout(120_000);

  test("UNE NOTE ET UN CADRE SEULS se copient et se collent, par le presse-papiers du système", async ({ page }) => {
    const dialogues = await poser(page);
    await selectionner(page, ["n1", "f1"]);
    await page.keyboard.press("Control+c");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { message: "la copie écrit le JSON signé" })
      .toContain('"format":"attic/noeuds"');
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(800);

    const { note, cadre } = await arrives(page, ["n1", "f1", "o1"]);
    expect(dialogues, "aucun composant n'est déclaré inconnu").toEqual([]);
    noteIntacte(note);
    cadreIntact(cadre);
    memeDecalage(note!, cadre!, 400, -40, "le cadre par rapport à la note");
  });

  test("MÊLÉS À UN NŒUD ORDINAIRE, les trois se collent et le nœud reste devant son cadre", async ({ page }) => {
    const dialogues = await poser(page);
    // L'OSCILLATEUR D'ABORD : React Flow élève un nœud sélectionné, et le cadre choisi avant lui
    // passerait devant lui et prendrait son clic.
    await selectionner(page, ["o1", "n1", "f1"]);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(800);

    const { note, cadre, noeud } = await arrives(page, ["n1", "f1", "o1"]);
    expect(dialogues, "aucun composant n'est déclaré inconnu").toEqual([]);
    expect(noeud, "le nœud ordinaire se colle").toBeDefined();
    noteIntacte(note);
    cadreIntact(cadre);
    memeDecalage(note!, cadre!, 400, -40, "le cadre par rapport à la note");
    memeDecalage(cadre!, noeud!, 50, 80, "le nœud par rapport à son cadre");
    // LE CADRE COLLÉ GARDE CE QU'IL CONTIENT : le nœud collé dedans reste au premier plan, et se
    // sélectionne d'un clic au lieu de laisser le cadre le prendre.
    await cliquerVide(page);
    await pointLibre(page, noeud!.id);
  });

  test("COUPER PUIS COLLER rend la note et le cadre, au lieu de les effacer", async ({ page }) => {
    const dialogues = await poser(page);
    await selectionner(page, ["n1", "f1"]);
    await page.keyboard.press("Control+x");
    await expect.poll(async () => (await canevas(page)).map((p) => p.id), { message: "la coupe retire les originaux" }).toEqual(["o1"]);
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(800);

    const { note, cadre } = await arrives(page, ["o1"]);
    expect(dialogues, "aucun composant n'est déclaré inconnu").toEqual([]);
    noteIntacte(note);
    cadreIntact(cadre);
    memeDecalage(note!, cadre!, 400, -40, "le cadre par rapport à la note");
  });

  test("RIEN N'EST PERDU À LA SAUVEGARDE : la note et le cadre collés reviennent après rechargement", async ({ page }) => {
    await poser(page);
    await selectionner(page, ["n1", "f1"]);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(800);
    const colles = await arrives(page, ["n1", "f1", "o1"]);
    expect(colles.note && colles.cadre, "la note et le cadre sont collés").toBeTruthy();

    // Le journal de session écrit l'en-cours 1,5 s après le dernier changement.
    await page.waitForTimeout(2500);
    await page.reload();
    await page.waitForSelector(".attic-app", { timeout: 15000 });
    await page.waitForTimeout(2500);
    const { note, cadre } = await arrives(page, ["n1", "f1", "o1"]);
    noteIntacte(note);
    cadreIntact(cadre);
    expect([note!.id, cadre!.id], "les mêmes nœuds, sous les mêmes identifiants").toEqual([colles.note!.id, colles.cadre!.id]);
    memeDecalage(note!, cadre!, 400, -40, "le cadre par rapport à la note");
  });
});
