// tests-e2e/lecteur-apercu-perdu-dans-application.spec.ts — Le lecteur d'un nœud survit à la perte
// des octets de son aperçu, dans la vraie application.
//
// LE DÉFAUT, RELEVÉ PAR FABIEN SUR L'APPLICATION INSTALLÉE, OUVERTE TROIS JOURS : « en appuyant sur le
// play du lecteur, un timer à 00:00 et l'icône play grisé ». Le tampon du nœud était intact ; ce sont
// les octets de son aperçu qui avaient disparu. Passé un plafond en mémoire, Chromium pose les blobs
// les plus anciens sur le disque, sous `userData/blob_storage/<session>`, et TOUT processus qui démarre
// sur le même profil efface les dossiers de session qui ne sont pas le sien. Le détail mesuré est dans
// `src/ui/refaire-apercus.ts`.
//
// CE CAS PROVOQUE L'ÉVÉNEMENT LUI-MÊME, et non un substitut : des blobs gardés vivants au-delà du
// plafond, puis une seconde instance sur le même profil. Il VÉRIFIE D'ABORD QUE LA PERTE A EU LIEU —
// des fichiers sous `blob_storage` avant, le dossier de la première instance effacé après, une erreur
// relevée par le lecteur — sans quoi un Chromium qui cesserait d'effacer ferait passer ce cas au vert
// sans qu'il éprouve plus rien.
//
// UN PROFIL JETABLE, TOUJOURS : lancé sur `%APPDATA%\attic`, ce cas effacerait précisément les aperçus
// de l'application installée qu'on est en train d'utiliser, puisque c'est le défaut qu'il reproduit.
//
// CE QU'IL COÛTE : deux lancements de l'application et 2,8 Go de blobs, posés sur le disque puis
// effacés avec le profil. Mesuré : 26 s pour le premier cas, 50 s pour le second, qui attend.
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { semerEtLancer } from "./pilote-graphe";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");

const lancer = (profil: string): Promise<ElectronApplication> => electron.launch({
  args: [RACINE, `--user-data-dir=${profil}`], cwd: RACINE, env: { ...process.env, NODE_ENV: "" },
});

const GRAPHE = JSON.stringify({
  nodes: [{ id: "src", position: { x: 80, y: 80 },
    data: { ficheId: "metronome", parametres: { Tempo: 120, "Durée": 6 } } }],
  edges: [],
});

/** Les dossiers de session sous `blob_storage`, et combien de fichiers chacun porte. */
function sessionsDeBlobs(profil: string): Map<string, number> {
  const d = join(profil, "blob_storage");
  return new Map(existsSync(d) ? readdirSync(d).map((s) => [s, readdirSync(join(d, s)).length]) : []);
}

const LECTEUR = '[data-id="src"] audio';

/** Le repos du lecteur avant la pression mémoire : voir le second cas, qui en porte la calibration. */
const REPOS_AVANT_PRESSION_MS = 40000;

async function etatLecteur(page: Page) {
  return await page.evaluate((sel) => {
    const a = document.querySelector(sel) as HTMLAudioElement | null;
    return a ? { src: a.src, readyState: a.readyState, currentTime: a.currentTime, erreur: a.error?.code ?? 0 } : null;
  }, LECTEUR);
}

/** Le vrai clic sur le ▶ des commandes natives : leur bouton est à gauche, au milieu de la hauteur. */
async function presserPlay(page: Page) {
  const boite = (await page.locator(LECTEUR).boundingBox())!;
  await page.evaluate((sel) => { (document.querySelector(sel) as HTMLAudioElement).volume = 0.01; }, LECTEUR);
  await page.mouse.click(boite.x + 20, boite.y + boite.height / 2);
}

/**
 * Lance un métronome, pousse son aperçu sur le disque, puis fait démarrer une seconde instance sur
 * le même profil. Rend l'adresse de l'aperçu d'origine et l'instant où le lecteur l'avait chargée,
 * après avoir vérifié que le dossier qui portait ses octets a été effacé.
 */
async function perdreLesOctets(page: Page, profil: string): Promise<{ origine: string; charge: number }> {
  await semerEtLancer(page, page.url(), GRAPHE);
  await expect.poll(async () => (await etatLecteur(page))?.readyState ?? 0, { timeout: 30000 }).toBeGreaterThan(0);
  const origine = (await etatLecteur(page))!.src;
  const charge = Date.now();

  // Des blobs gardés vivants dans la page, au-delà du plafond en mémoire : Chromium pose alors les
  // plus anciens sur le disque, et l'aperçu du métronome est le plus vieux. 2,8 Go y suffisent.
  await page.evaluate(async () => {
    const lest: Blob[] = [];
    (window as unknown as { __lest: Blob[] }).__lest = lest;
    for (let i = 0; i < 11; i++) {
      lest.push(new Blob([new Uint8Array(256 << 20).fill(i + 1)]));
      await new Promise((r) => setTimeout(r, 300));
    }
  });
  await expect.poll(() => [...sessionsDeBlobs(profil).values()].reduce((s, n) => s + n, 0),
    { timeout: 30000, message: "Chromium doit avoir posé des blobs sur le disque" }).toBeGreaterThan(0);
  const premiere = [...sessionsDeBlobs(profil).keys()];

  const seconde = await lancer(profil);
  try {
    await (await seconde.firstWindow()).waitForLoadState("domcontentloaded");
    await expect.poll(() => premiere.filter((s) => sessionsDeBlobs(profil).has(s)),
      { timeout: 30000, message: "la seconde instance doit avoir effacé le dossier de la première" }).toEqual([]);
  } finally {
    await seconde.close();
  }
  return { origine, charge };
}

test.describe("le lecteur d'un nœud dont l'aperçu a perdu ses octets", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(240000);

  let profil = "";
  let app: ElectronApplication;
  let page: Page;
  const erreurs: string[] = [];

  test.beforeEach(async () => {
    profil = mkdtempSync(join(tmpdir(), "attic-apercu-perdu-"));
    erreurs.length = 0;
    app = await lancer(profil);
    page = await app.firstWindow();
    page.on("console", (m) => { if (m.text().startsWith("[audio player] error")) erreurs.push(m.text()); });
    await page.waitForLoadState("domcontentloaded");
  });

  test.afterEach(async () => {
    await app?.close().catch(() => {});
    rmSync(profil, { recursive: true, force: true });
  });

  test("UN LECTEUR RECRÉÉ SUR L'APERÇU PERDU SE RÉÉCRIT DEPUIS LE TAMPON, ET LE ▶ JOUE", async () => {
    const { origine } = await perdreLesOctets(page, profil);
    // Replier puis déplier le nœud recrée son élément audio sur la même adresse : c'est là que
    // Chromium rendait « Format error », le ▶ grisé et « 0:00 / 0:00 ».
    await page.locator('[data-id="src"] .attic-node-btn-collapse').click();
    await page.waitForTimeout(800);
    await page.locator('[data-id="src"] .attic-node-btn-collapse').click();

    await expect.poll(() => erreurs.length, { timeout: 15000, message: "la perte doit avoir été vue par le lecteur" })
      .toBeGreaterThan(0);
    await expect.poll(async () => {
      const e = await etatLecteur(page);
      return !!e && e.src !== origine && e.erreur === 0 && e.readyState > 0;
    }, { timeout: 30000, message: "l'aperçu doit avoir été réécrit sous une adresse neuve" }).toBe(true);

    await presserPlay(page);
    await expect.poll(async () => (await etatLecteur(page))?.currentTime ?? 0,
      { timeout: 10000, message: "le ▶ doit faire avancer la lecture" }).toBeGreaterThan(0.5);
  });

  test("LE ▶ PRESSÉ SUR UN LECTEUR CHARGÉ DONT L'APERÇU EST PERDU JOUE, SANS SECOND CLIC", async () => {
    const { origine, charge } = await perdreLesOctets(page, profil);
    // UN LECTEUR AU REPOS, PUIS UNE PRESSION MÉMOIRE : il lâche alors les octets qu'il avait déjà lus,
    // et son prochain ▶ doit relire l'adresse, ce qui arrive sur une application ouverte depuis des
    // jours. LE REPOS A ÉTÉ CALIBRÉ, et il compte : pression envoyée 16,6 s puis 20,0 s après le
    // chargement, le ▶ jouait encore les octets gardés en mémoire et la perte n'était pas vue ; à
    // 25, 30 et 40 s, elle l'était chaque fois. Sans ce repos, ce cas échoue sur son contrôle, et ne
    // passe jamais au vert sans avoir rien éprouvé.
    await page.waitForTimeout(Math.max(0, REPOS_AVANT_PRESSION_MS - (Date.now() - charge)));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Memory.simulatePressureNotification", { level: "critical" });
    await page.waitForTimeout(2000);

    await presserPlay(page);
    await expect.poll(() => erreurs.length, { timeout: 15000, message: "la perte doit avoir été vue par le lecteur" })
      .toBeGreaterThan(0);
    await expect.poll(async () => {
      const e = await etatLecteur(page);
      return e && e.src !== origine && e.erreur === 0 ? e.currentTime : 0;
    }, { timeout: 30000, message: "la lecture demandée doit reprendre sur l'aperçu réécrit" }).toBeGreaterThan(0.5);
  });
});
