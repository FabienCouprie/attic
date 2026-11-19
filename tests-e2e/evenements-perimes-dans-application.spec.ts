// tests-e2e/evenements-perimes-dans-application.spec.ts — Une passe ne réécrit pas ce qu'on vient
// d'effacer, ni ce qu'on vient d'abandonner.
//
// ═══ POURQUOI CE CAS EXISTE ═══
//
// Pièce P6 du plan de l'architecture par messages entre l'interface et le moteur, et ses deux défauts
// lus dans le code le 2026-11-16, sans avoir été éprouvés :
//
//   D1. UNE REMISE À ZÉRO PENDANT UNE PASSE EST EN PARTIE DÉFAITE PAR LE MÉNAGE DE CETTE PASSE. La
//       remise à zéro abat la passe et efface ce qui est montré ; la boucle sort, mais le bilan de la
//       passe pose ensuite tout ce qu'elle n'avait pas encore posé, à partir de ses tables.
//   D2. CTRL+Z ET L'IMPORT ABANDONNENT LE GRAPHE SANS ARRÊTER LA PASSE, qui continue d'écrire au
//       magasin des résultats et des statuts, sous des identifiants que le graphe d'après réemploie.
//
// ═══ CE QU'IL MESURE ═══
//
// LES ÉCRITURES DES MAGASINS, par le journal de passe (`ui/journal-de-passe.ts`), armé avant le
// chargement de la page. Le geste est joué dans la page, de façon synchrone : ce qu'il écrit lui-même
// (les statuts remis à « attente », les résultats retirés) se distingue de ce qui vient après. Après
// lui, aucune écriture ne doit plus RIEN POSER sur les nœuds qu'il a touchés : ni un statut autre
// qu'« attente », ni un champ de résultat.
//
// LE GRAPHE EST UN EXEMPLE LIVRÉ, `un-synthe-et-sa-bulle-d-effets`, assez lent pour qu'on agisse
// pendant : le synthé, un méta, finit d'abord, et ses trois effets calculent ensuite. Le geste part dès
// que le premier effet a fini, le run étant encore en cours.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5285);
const ICI = dirname(fileURLToPath(import.meta.url));
const GRAPHE = readFileSync(join(resolve(ICI, ".."), "exemples", "un-synthe-et-sa-bulle-d-effets.json"), "utf8");

/** Une écriture relevée par le journal de passe : voir `EntreeDuJournal` dans `ui/journal-de-passe.ts`. */
interface Ecrit {
  magasin: string;
  id?: string;
  apres?: { statut: string };
  poses?: Record<string, string>;
  ajoutes?: string[];
}

/** L'application, l'exemple semé, le journal armé et vide. */
async function ouvrir(page: Page): Promise<void> {
  await page.addInitScript(() => { (window as unknown as { __attic_journal_de_passe__: unknown[] }).__attic_journal_de_passe__ = []; });
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 60_000 });
  await page.evaluate((g) => {
    localStorage.setItem("attic-encours", g);
    localStorage.setItem("attic-profondeur-export", "32");
  }, GRAPHE);
  await page.reload();
  await page.waitForSelector(".attic-app", { timeout: 60_000 });
  await page.waitForTimeout(2500);
}

/** Lance le graphe, et attend que le premier effet ait fini pendant que le run tourne encore. */
async function lancerEtAttendreLePremierEffet(page: Page): Promise<void> {
  await page.locator(".attic-btn-lancer").first().click({ timeout: 15_000 });
  await page.waitForFunction(() => {
    const j = (window as unknown as { __attic_journal_de_passe__: { magasin: string; id?: string; apres?: { statut: string } }[] }).__attic_journal_de_passe__;
    return j.some((e) => e.magasin === "statuts" && e.id === "pingpong" && e.apres?.statut === "termine");
  }, undefined, { timeout: 120_000, polling: 10 });
}

/** Attend que le run soit fini, et un peu après : le bilan et les lecteurs. */
async function attendreLaFin(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector(".attic-btn-lancer")?.classList.contains("attic-btn-arreter"),
    undefined, { timeout: 180_000 });
  await page.waitForTimeout(2000);
}

/**
 * Ce qui, APRÈS le geste, pose encore quelque chose sur les nœuds qu'il a touchés.
 *
 * LES NŒUDS TOUCHÉS SONT CEUX QUE LE GESTE A ÉCRITS LUI-MÊME, dans le même tour : c'est le relevé qui
 * les donne, et non une liste tenue ici. `tous` les compte tous, pour un graphe abandonné.
 */
function posesApres(journal: Ecrit[], debut: number, fin: number, tous = false): string[] {
  const touches = new Set(journal.slice(debut, fin).map((e) => e.id).filter((id): id is string => !!id));
  return journal.slice(fin)
    .filter((e) => e.id && (tous || touches.has(e.id)))
    .filter((e) => (e.magasin === "statuts" && e.apres?.statut !== "attente")
      || (e.magasin === "resultats" && (Object.keys(e.poses ?? {}).length > 0 || (e.ajoutes ?? []).length > 0)))
    .map((e) => `${e.magasin} ${e.id} ${e.magasin === "statuts" ? e.apres?.statut : Object.keys(e.poses ?? {}).join(",")}`);
}

test.describe("une passe écrit-elle encore ce qu'on vient d'effacer ou d'abandonner", () => {
  test.setTimeout(300_000);

  test("D1 : APRÈS UNE REMISE À ZÉRO PENDANT LA PASSE, rien n'est reposé sur les nœuds remis à zéro", async ({ page }) => {
    await ouvrir(page);
    await lancerEtAttendreLePremierEffet(page);
    // LE ↺ DU SYNTHÉ, dans la page et dans le même tour : il remet à zéro le synthé et tout son aval.
    const { debut, fin, tournait } = await page.evaluate(() => {
      const j = (window as unknown as { __attic_journal_de_passe__: unknown[] }).__attic_journal_de_passe__;
      const tournait = !!document.querySelector(".attic-btn-lancer")?.classList.contains("attic-btn-arreter");
      const debut = j.length;
      (document.querySelector('[data-id="synth"] .attic-node-btn-reset') as HTMLButtonElement).click();
      return { debut, fin: j.length, tournait };
    });
    expect(tournait, "le run devait tourner encore au moment du geste").toBe(true);
    expect(fin, "la remise à zéro n'a rien écrit : le geste n'a pas porté").toBeGreaterThan(debut);
    await attendreLaFin(page);
    const journal = await page.evaluate(() => (window as unknown as { __attic_journal_de_passe__: unknown[] }).__attic_journal_de_passe__) as Ecrit[];
    const reposes = posesApres(journal, debut, fin);
    console.log(`D1 : ${reposes.length} écritures reposées après la remise à zéro`);
    for (const r of reposes) console.log(`  ${r}`);
    expect(reposes, "la passe remise à zéro a reposé ce qu'on venait d'effacer").toEqual([]);
  });

  test("D2 : APRÈS UN IMPORT PENDANT LA PASSE, rien de la passe d'avant n'est posé sur le graphe importé", async ({ page }) => {
    await ouvrir(page);
    await lancerEtAttendreLePremierEffet(page);
    // L'IMPORT DU MÊME GRAPHE, sous les mêmes identifiants : c'est le cas où la passe d'avant écrit sur
    // le graphe d'après. Le fichier passe par le sélecteur caché de la barre d'outils.
    const debut = await page.evaluate(() => (window as unknown as { __attic_journal_de_passe__: unknown[] }).__attic_journal_de_passe__.length);
    const tournait = await page.evaluate(() => !!document.querySelector(".attic-btn-lancer")?.classList.contains("attic-btn-arreter"));
    expect(tournait, "le run devait tourner encore au moment du geste").toBe(true);
    page.on("dialog", (d) => { void d.accept(); });
    await page.setInputFiles('input[type="file"][accept=".json,.attic"]', {
      name: "meme-graphe.json", mimeType: "application/json", buffer: Buffer.from(GRAPHE, "utf8"),
    });
    // L'IMPORT EST POSÉ quand ses nœuds sont dans l'atelier : le journal ne bouge plus de son fait.
    await page.waitForTimeout(300);
    const fin = await page.evaluate(() => (window as unknown as { __attic_journal_de_passe__: unknown[] }).__attic_journal_de_passe__.length);
    await attendreLaFin(page);
    const journal = await page.evaluate(() => (window as unknown as { __attic_journal_de_passe__: unknown[] }).__attic_journal_de_passe__) as Ecrit[];
    const poses = posesApres(journal, debut, fin, true);
    console.log(`D2 : ${poses.length} écritures de la passe d'avant après l'import`);
    for (const r of poses) console.log(`  ${r}`);
    expect(poses, "la passe d'avant a écrit sur le graphe importé").toEqual([]);
  });
});
