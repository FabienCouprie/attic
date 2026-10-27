// tests-e2e/arreter-execution.spec.ts — Le bouton Lancer devient Arrêter pendant un run.
//
// Il n'y avait aucun moyen d'interrompre une exécution : le bouton passait à « … » et se
// désactivait, et le seul recours devant une chaîne longue était de fermer l'application.
// Le moteur savait pourtant s'annuler — les réinitialisations s'en servaient — mais rien
// ne l'exposait. Ce test tient la promesse de bout en bout : le bouton change pendant le
// run, il arrête vraiment, il redevient « Lancer », et aucun nœud ne reste à tourner.
import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5201);

/**
 * Une chaîne longue faite de maillons COURTS : une tonalité de 3 s puis une série
 * d'étirements légers. La longueur donne le temps d'arrêter ; la brièveté de chaque
 * maillon est nécessaire, parce que les traitements sont synchrones et figent le fil
 * principal le temps de leur calcul — sur un nœud de plusieurs dizaines de secondes, le
 * clic sur « Arrêter » n'est même pas reçu avant qu'il ait fini. C'est la limite décrite
 * dans le CHANGELOG, et la mesurer ici la rendrait seulement intermittente.
 */
function chaineLongue(nbEtirements: number) {
  const nodes: any[] = [
    { id: "gen", position: { x: 40, y: 200 }, data: { ficheId: "generateur-frequence", parametres: { "Durée": 3, Fréquence: 220 } } },
  ];
  const edges: any[] = [];
  let precedent = "gen";
  for (let i = 0; i < nbEtirements; i++) {
    const id = `e${i}`;
    nodes.push({ id, position: { x: 260 + i * 220, y: 200 }, data: { ficheId: "etirement-glissant", parametres: { "Début": 1.2, Fin: 1.2 } } });
    edges.push({ id: `a${i}`, source: precedent, target: id, sourceHandle: "out:0", targetHandle: "in:0" });
    precedent = id;
  }
  return JSON.stringify({ nodes, edges, viewport: { x: 0, y: 0, zoom: 0.5 } });
}

/** Les maillons de la chaîne, après la tonalité qui l'ouvre. */
const NB_ETIREMENTS = 14;

test.describe("arrêter une exécution en cours", () => {
  test("le bouton devient Arrêter, interrompt le run et redevient Lancer", async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript((g: string) => { localStorage.setItem("attic-encours", g); }, chaineLongue(14));
    await page.goto(devUrl);
    await page.waitForSelector('.react-flow__node[data-id="gen"]', { timeout: 15000 });

    const bouton = page.locator(".attic-btn-lancer");
    await expect(bouton).toContainText("Lancer");
    await expect(bouton).toBeEnabled();

    await bouton.click();

    // Pendant le run : le bouton dit « Arrêter » et reste cliquable — c'est le défaut
    // signalé, il affichait « … » et était désactivé.
    await expect(page.locator(".attic-btn-arreter")).toHaveCount(1, { timeout: 20_000 });
    await expect(bouton).toContainText("Arrêter");
    await expect(bouton).toBeEnabled();
    // Au moins un nœud tourne, et tous ne sont pas déjà finis.
    await expect(page.locator(".react-flow__node .attic-node.running")).not.toHaveCount(0, { timeout: 20_000 });

    await bouton.click();

    // Le run s'arrête : le bouton redevient « Lancer ».
    await expect(page.locator(".attic-btn-arreter")).toHaveCount(0, { timeout: 60_000 });
    await expect(bouton).toContainText("Lancer");
    // Et plus rien ne tourne : le nœud interrompu ne reste pas « en cours » à l'écran.
    await expect(page.locator(".react-flow__node .attic-node.running")).toHaveCount(0);
    // Arrêter n'efface pas : ce qui était calculé avant l'arrêt reste affiché.
    // Jusqu'où la chaîne est allée dépend de la machine — l'arrêt est demandé, pas
    // immédiat —, et l'affirmer ici ne mesurerait que la vitesse du poste.
    expect(await page.locator(".react-flow__node .attic-node.termine").count()).toBeGreaterThan(0);
  });

  test("la barre d'espace arrête aussi, et relance ensuite", async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript((g: string) => { localStorage.setItem("attic-encours", g); }, chaineLongue(NB_ETIREMENTS));
    await page.goto(devUrl);
    await page.waitForSelector('.react-flow__node[data-id="gen"]', { timeout: 15000 });

    await page.locator(".react-flow__pane").click({ position: { x: 40, y: 400 } });
    await page.keyboard.press(" ");
    await expect(page.locator(".attic-btn-arreter")).toHaveCount(1, { timeout: 20_000 });

    await page.keyboard.press(" ");
    await expect(page.locator(".attic-btn-arreter")).toHaveCount(0, { timeout: 60_000 });

    // Le graphe repart : l'arrêt n'a rien laissé de bloqué derrière lui. On ne réaffirme
    // pas ici que le bouton repasse par « Arrêter » — les nœuds déjà calculés sont en
    // cache, la relance peut se terminer avant qu'on l'observe. Ce qui compte est
    // qu'elle aille au bout.
    //
    // « AU BOUT » SE LIT SUR LES NŒUDS TERMINÉS, ET NON SUR L'ABSENCE D'ATTENTE. Ce cas
    // attendait qu'aucun nœud ne soit plus « en attente », puis laissait cinq secondes au
    // bouton pour redevenir « Lancer ». Or plus aucune attente veut dire que le DERNIER nœud
    // a démarré, pas qu'il a fini — et ce dernier étire environ 32 s de son (3 s × 1,2¹³).
    // Mesuré le 2026-10-27 : à cet instant `e13` tournait encore, et le bouton est parti
    // 4,8 s plus tard. Le cas échouait donc dès que la machine était un peu chargée, sur
    // une application qui allait bien au bout.
    //
    // ET L'ON N'ATTEND PAS SEULEMENT LA DISPARITION DU BOUTON : juste après la frappe, la
    // relance n'a peut-être pas encore commencé, et « aucun bouton Arrêter » serait vrai
    // avant même que le run parte.
    await page.keyboard.press(" ");
    await expect(page.locator(".react-flow__node .attic-node.termine")).toHaveCount(1 + NB_ETIREMENTS, { timeout: 150_000 });
    await expect(page.locator(".attic-btn-arreter")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(".react-flow__node .attic-node.attente")).toHaveCount(0);
    await expect(page.locator(".react-flow__node .attic-node.running")).toHaveCount(0);
  });
});
