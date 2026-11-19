// tests-e2e/execution-gardee.ts — Relire après le run les tampons que le moteur a rendus.
//
// LA PASSE FINIE LÂCHE SON EXÉCUTION PUBLIÉE, `__attic_execution__` de `plugins/grapheGlobal.ts`,
// depuis le 2026-11-19 : elle tenait chaque tampon de la passe jusqu'à la suivante, copies de boucle
// comprises. Une épreuve qui lit dans le moteur, et non dans le lecteur du nœud, ce qu'un composant a
// rendu, le demande ici avant de presser Lancer, après le dernier rechargement de la page.
import type { Page } from "@playwright/test";

export async function garderLExecution(page: Page): Promise<void> {
  await page.evaluate(() => { (globalThis as { __attic_garder_execution__?: boolean }).__attic_garder_execution__ = true; });
}
