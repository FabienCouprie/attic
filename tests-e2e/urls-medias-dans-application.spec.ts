// tests-e2e/urls-medias-dans-application.spec.ts — Une URL de média remplacée est révoquée quand plus
// rien ne la tient, et pas avant : dans l'application.
//
// ═══ POURQUOI CETTE ÉPREUVE ═══
//
// Point A6 de la revue d'architecture du 2026-10-31, et la règle est de Fabien : une URL ne se
// révoque que quand plus rien ne la tient, ni un nœud vivant, ni une entrée d'annulation ou de
// rétablissement, ni le presse-papiers. Le registre et chacun de ses détenteurs s'éprouvent dans
// `ui/urls-medias.test.ts`, sous leur forme ; ce qui ne se voit que d'ici, c'est que les détenteurs
// soient DÉCLARÉS par l'atelier, et que le balayage parte.
//
// ═══ LE CRITÈRE, ET POURQUOI IL EST DÉCIDABLE ═══
//
// Une adresse `blob:` révoquée ne se lit plus : `fetch` échoue. Une adresse tenue se lit, et rend les
// octets du fichier. Les trois fichiers d'essai ont trois durées, donc trois tailles : 0,5 s, 1 s et
// 1,5 s de WAV font 44 144, 88 244 et 132 344 octets, et l'adresse se reconnaît à ce qu'elle rend.
// Le lecteur d'une « Entrée audio » ne paraît qu'une fois le nœud terminé : chaque relevé lance.
//
// ═══ CE QU'ELLE TIENT ═══
//
// 1. Un fichier remplacé, que rien d'autre ne tient, voit son adresse révoquée.
// 2. Tenue par l'historique, l'adresse survit au remplacement ; Ctrl+Z rend un lecteur qui la lit,
//    Ctrl+Y aussi ; et lâchée par les deux piles, elle part.
// 3. Deux nœuds collés d'une même coupe partagent l'adresse : remplacer le fichier de l'un ne la
//    retire pas à l'autre.
// 4. Le canevas vidé garde ses adresses dans l'historique, et Ctrl+Z rend des lecteurs qui jouent.
// 5. La copie que la persistance laisse dans `grapheRacineRef` à la racine ne tient rien.
//
// ═══ UN BALAYAGE AVANT CHAQUE JUGEMENT, ET POURQUOI ═══
//
// Le balayage part un quart de seconde après le dernier changement des nœuds. Un cas qui juge plus
// vite juge avant lui, et reste vert quoi que fasse le code : trois des cas ci-dessous l'ont été,
// historique ou canevas retiré des racines, avant que chaque jugement attende son balayage. Le
// premier cas, lui, remplace le fichier SANS attendre : c'est ce trajet rapide qui a montré qu'une
// URL jamais vue tenue restait gardée pour toujours.
import { test, expect, type Page } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5281);

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** Un WAV mono 16 bits à 44,1 kHz : 44 octets d'en-tête et deux par échantillon. */
function wav(secondes: number): Buffer {
  const sr = 44100, n = Math.round(sr * secondes);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 8000), 44 + i * 2);
  return b;
}
const FICHIERS = { A: wav(0.5), B: wav(1), C: wav(1.5) };
const OCTETS = { A: 44144, B: 88244, C: 132344 };

const entree = (id: string, y: number) => ({
  id, type: "atelier", position: { x: 0, y }, data: { ficheId: "entree-audio", parametres: { Chemin: "" } },
});

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

async function ouvrir(page: Page, noeuds: unknown[]) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify({ nodes: noeuds, edges: [] })]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await expect.poll(() => ids(page), { timeout: 15000 }).toHaveLength(noeuds.length);
  await cadrageStable(page);
}

/** Pose un fichier d'essai sur une « Entrée audio », par son bouton « Charger ». */
async function charger(page: Page, id: string, quel: keyof typeof FICHIERS) {
  await page.locator(`.react-flow__node[data-id="${id}"] input[type=file][accept="audio/*"]`).setInputFiles({
    name: `${quel}.wav`, mimeType: "audio/wav", buffer: FICHIERS[quel],
  });
  await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toContainText(`${quel}.wav`);
}

/** Presse Lancer et attend que chaque nœud ait fini. */
async function lancer(page: Page) {
  await page.click(".attic-btn-lancer");
  await page.waitForFunction(() => {
    const noeuds = [...document.querySelectorAll(".react-flow__node")];
    return noeuds.length > 0 && noeuds.every((n) => n.querySelector(".attic-node-statut-puce.termine, .attic-node-statut-puce.erreur"));
  }, null, { timeout: 60000 });
}

/** Ce que rend une adresse : sa taille en octets, ou -1 si elle ne se lit plus. */
const lire = (page: Page, url: string) => page.evaluate(async (u) => {
  try { return (await (await fetch(u)).arrayBuffer()).byteLength; } catch { return -1; }
}, url);

/** L'adresse que le lecteur du nœud lit pour ce fichier, reconnue à la taille qu'elle rend. */
async function adresseDu(page: Page, id: string, quel: keyof typeof OCTETS): Promise<string> {
  const srcs = await page.locator(`.react-flow__node[data-id="${id}"] audio`).evaluateAll((els) =>
    els.map((e) => e.getAttribute("src") ?? "").filter((s) => s.startsWith("blob:")));
  for (const s of srcs) if (await lire(page, s) === OCTETS[quel]) return s;
  throw new Error(`aucun lecteur de ${id} ne lit ${quel} (${srcs.length} adresses)`);
}

/** Le balayage part un quart de seconde après le dernier changement ; on lui en laisse quatre fois plus. */
const laisserBalayer = (page: Page) => page.waitForTimeout(1000);

/** Sélectionne un nœud d'un clic sur un point que rien ne recouvre, ni champ ni bouton. */
async function selectionner(page: Page, id: string) {
  const p = await page.evaluate((id) => {
    const noeud = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!noeud) return null;
    const r = noeud.getBoundingClientRect();
    for (let fy = 0.05; fy < 1; fy += 0.05) for (let fx = 0.03; fx < 1; fx += 0.05) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const el = document.elementFromPoint(x, y);
      if (el?.closest(".react-flow__node")?.getAttribute("data-id") === id
        && !el.closest("input,textarea,select,button,label,canvas,audio,.react-flow__handle,.nodrag")) return { x, y };
    }
    return null;
  }, id);
  expect(p, `aucun point libre sur ${id}`).not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
}

async function supprimer(page: Page, id: string) {
  await selectionner(page, id);
  await page.keyboard.press("Delete");
  await expect.poll(() => ids(page)).not.toContain(id);
}

test.describe("les URL de médias", () => {
  test("UN FICHIER REMPLACÉ, QUE RIEN D'AUTRE NE TIENT, VOIT SON ADRESSE RÉVOQUÉE", async ({ page }) => {
    test.setTimeout(120000);
    await ouvrir(page, [entree("a", 0)]);
    await charger(page, "a", "A");
    await lancer(page);
    const urlA = await adresseDu(page, "a", "A");
    await charger(page, "a", "B");
    await lancer(page);
    const urlB = await adresseDu(page, "a", "B");
    await expect.poll(() => lire(page, urlA), { message: "l'adresse de A est révoquée", timeout: 5000 }).toBe(-1);
    expect(await lire(page, urlB), "celle de B se lit").toBe(OCTETS.B);
  });

  test("TENUE PAR L'HISTORIQUE, ELLE SURVIT ; CTRL+Z ET CTRL+Y RENDENT DES LECTEURS QUI JOUENT ; LÂCHÉE, ELLE PART", async ({ page }) => {
    test.setTimeout(150000);
    await ouvrir(page, [entree("a", 0), entree("z", 260)]);
    await charger(page, "a", "A");
    await lancer(page);
    const urlA = await adresseDu(page, "a", "A");
    await supprimer(page, "z");
    await charger(page, "a", "B");
    await lancer(page);
    const urlB = await adresseDu(page, "a", "B");
    await laisserBalayer(page);
    expect(await lire(page, urlA), "l'instantané de la suppression tient A").toBe(OCTETS.A);

    // APRÈS CHAQUE GESTE, UN BALAYAGE AVANT DE JUGER. Le nœud vivant est alors le seul à tenir
    // l'adresse qu'il vient de reprendre : la lire tout de suite passait avant tout balayage, et le cas
    // restait vert, canevas retiré des racines.
    await page.keyboard.press("Control+z");
    await expect.poll(() => ids(page)).toEqual(["a", "z"]);
    await laisserBalayer(page);
    await lancer(page);
    expect(await adresseDu(page, "a", "A"), "Ctrl+Z rend le lecteur de A, sur la même adresse").toBe(urlA);
    await page.keyboard.press("Control+y");
    await expect.poll(() => ids(page)).toEqual(["a"]);
    await laisserBalayer(page);
    await lancer(page);
    expect(await adresseDu(page, "a", "B"), "Ctrl+Y rend le lecteur de B").toBe(urlB);

    // Ctrl+Z encore, puis un fichier chargé : A n'est plus tenue que par le canevas, qui la lâche ;
    // B reste tenue par la pile de rétablissement.
    await page.keyboard.press("Control+z");
    await expect.poll(() => ids(page)).toEqual(["a", "z"]);
    await charger(page, "a", "C");
    await expect.poll(() => lire(page, urlA), { message: "lâchée par les deux piles, A part", timeout: 5000 }).toBe(-1);
    expect(await lire(page, urlB), "B est tenue par la pile de rétablissement").toBe(OCTETS.B);
    await page.keyboard.press("Control+y");
    await expect.poll(() => ids(page)).toEqual(["a"]);
    await laisserBalayer(page);
    await lancer(page);
    expect(await adresseDu(page, "a", "B"), "et Ctrl+Y la rend jouable").toBe(urlB);
  });

  test("DEUX NŒUDS COLLÉS D'UNE MÊME COUPE PARTAGENT L'ADRESSE, et remplacer l'un ne la retire pas à l'autre", async ({ page }) => {
    test.setTimeout(150000);
    await ouvrir(page, [entree("a", 0)]);
    await charger(page, "a", "A");
    await lancer(page);
    const urlA = await adresseDu(page, "a", "A");
    await selectionner(page, "a");
    await page.keyboard.press("Control+x");
    await expect.poll(() => ids(page)).toEqual([]);
    await page.keyboard.press("Control+v");
    await expect.poll(async () => (await ids(page)).length).toBe(1);
    await page.keyboard.press("Control+v");
    await expect.poll(async () => (await ids(page)).length).toBe(2);
    const [premier, second] = await ids(page);
    await charger(page, premier, "B");
    await lancer(page);
    await laisserBalayer(page);
    expect(await adresseDu(page, second, "A"), "le second collé lit toujours A, sur la même adresse").toBe(urlA);
    await adresseDu(page, premier, "B");
  });

  test("LE CANEVAS VIDÉ GARDE SES ADRESSES DANS L'HISTORIQUE, et Ctrl+Z rend des lecteurs qui jouent", async ({ page }) => {
    test.setTimeout(120000);
    await ouvrir(page, [entree("a", 0)]);
    await charger(page, "a", "A");
    await lancer(page);
    const urlA = await adresseDu(page, "a", "A");
    // UN BALAYAGE D'ABORD, QUI VOIT A SUR SON NŒUD. Sans lui, vider moins d'un quart de seconde après
    // le run laissait A « naissante », donc gardée avec ou sans historique : vu vert, historique
    // retiré, et le cas ne départageait rien.
    await laisserBalayer(page);
    await page.locator(".attic-onglet-fermer").click();
    await expect.poll(() => ids(page)).toEqual([]);
    await laisserBalayer(page);
    expect(await lire(page, urlA), "le vidage est dans l'historique, qui tient A").toBe(OCTETS.A);
    await page.keyboard.press("Control+z");
    await expect.poll(() => ids(page)).toEqual(["a"]);
    await laisserBalayer(page);
    await lancer(page);
    expect(await adresseDu(page, "a", "A"), "Ctrl+Z rend le lecteur de A").toBe(urlA);
  });

  test("LA COPIE QUE LA PERSISTANCE LAISSE À LA RACINE NE TIENT RIEN : remplacé après l'en-cours écrit, le fichier part", async ({ page }) => {
    // MESURÉ EN ÉCRIVANT LE REGISTRE : à la racine, `grapheRacineRef` garde la copie du canevas que la
    // persistance y pose à chaque écriture de l'en-cours, une seconde et demie après le dernier
    // changement. Comptée comme détenteur, elle tenait encore A après le chargement de B.
    test.setTimeout(120000);
    await ouvrir(page, [entree("a", 0)]);
    await charger(page, "a", "A");
    await lancer(page);
    const urlA = await adresseDu(page, "a", "A");
    await page.waitForTimeout(2500);
    await charger(page, "a", "B");
    await expect.poll(() => lire(page, urlA), { message: "l'adresse de A est révoquée", timeout: 5000 }).toBe(-1);
  });
});
