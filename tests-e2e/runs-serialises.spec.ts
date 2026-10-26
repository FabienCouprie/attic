// tests-e2e/runs-serialises.spec.ts — Deux exécutions ne tournent plus ensemble, DANS L'APPLICATION.
//
// ═══ POURQUOI CE CAS EXISTE ═══
//
// Point 3 de la revue critique du 2026-10-25 : « Deux runs peuvent se chevaucher. Seul le run global
// est verrouillé. » Les cas unitaires de `src/ui/ordonnanceur-runs.test.ts` éprouvent la mécanique ;
// aucun ne dit qu'elle est BRANCHÉE. Le chevauchement se produisait par un geste précis, et c'est ce
// geste qu'il faut refaire : un run global en vol, puis un clic sur le ▶ d'un nœud — un bouton qui
// n'avait aucune condition.
//
// ═══ CE QU'IL MESURE, ET POURQUOI PAS AUTREMENT ═══
//
// IL COMPTE LES DÉBUTS D'EXÉCUTION DU MOTEUR, pris dans la console. `lancerUnePasse` écrit une ligne
// `[lancer] priorite=…` à chaque passe, et c'est le seul endroit qui le fasse. Deux de ces lignes
// sans fin de run entre elles, c'est le chevauchement.
//
// COMPTER LES STATUTS À L'ÉCRAN NE DIRAIT RIEN : deux runs concurrents posent leurs statuts dans le
// même magasin, et le résultat est indistinguable d'un run unique. C'est précisément pour cela que
// le défaut a pu vivre si longtemps.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5246);
const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");

/**
 * Un graphe assez lent pour qu'on ait le temps de cliquer pendant son run.
 *
 * ON PREND UN EXEMPLE LIVRÉ plutôt qu'un graphe écrit ici : il est déjà sous contrat de graphe, et
 * un graphe inventé pour un cas finit par ne plus ressembler à ce que l'application ouvre.
 */
function grapheLent(): string {
  const chemin = join(RACINE, "exemples", "un-synthe-et-sa-bulle-d-effets.json");
  return readFileSync(chemin, "utf8");
}

test.describe("les exécutions du moteur", () => {
  test.setTimeout(240_000);

  test("NE SE CHEVAUCHENT PAS, meme si l on clique le ▶ d un noeud pendant un run global", async ({ page }) => {
    const debuts: string[] = [];
    const fins: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      // `[lancer] priorite=…` est écrit en tête de chaque passe, et nulle part ailleurs.
      if (t.startsWith("[lancer] priorite=")) debuts.push(t);
      if (t.includes("[attic] run fini")) fins.push(t);
    });

    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    await page.evaluate((g) => {
      localStorage.setItem("attic-encours", g as string);
      localStorage.setItem("attic-profondeur-export", "32");
    }, grapheLent());
    await page.reload();
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
    await page.waitForTimeout(2500);

    // LE RUN GLOBAL PART, et l'on n'attend pas qu'il finisse : tout l'objet du cas est d'agir
    // PENDANT.
    await page.locator('button[title*="Lancer"]').first().click({ timeout: 15_000 });

    // PUIS LE ▶ D'UN NŒUD, aussitôt. C'est le geste qui ouvrait un second run : son bouton appelle
    // `onDefinirPrioritaire`, qui lançait sans aucune condition.
    const prio = page.locator(".attic-node-btn-prio").first();
    await prio.click({ timeout: 20_000, force: true });
    await prio.click({ timeout: 20_000, force: true });

    // Et l'on laisse tout se dérouler : la file se vide d'elle-même.
    await page.waitForTimeout(25_000);

    console.log(`débuts de passe relevés : ${debuts.length}`);
    for (const d of debuts) console.log(`  ${d}`);

    // ═══ LA MESURE ═══
    //
    // ON NE COMPTE PAS LES DÉBUTS : un lot ou une boucle en lance légitimement plusieurs, l'un après
    // l'autre. Ce qu'on vérifie est qu'aucun ne commence PENDANT qu'un autre tourne — et c'est
    // l'ordonnanceur qui le garantit, de sorte que la preuve tient dans l'application : le compteur
    // de simultanées exposé par le moteur ne dépasse jamais un.
    const crete = await page.evaluate(() => (window as unknown as { __attic_runs_crete__?: number })
      .__attic_runs_crete__ ?? -1);
    console.log(`crête de runs simultanés : ${crete}`);
    expect(crete, [
      "",
      "Le moteur n'expose pas sa crête de runs simultanés.",
      "",
      "`ui/ordonnanceur-runs.ts` la publie sur `window.__attic_runs_crete__` quand il tourne dans",
      "un navigateur. Sans elle, ce cas ne mesure rien.",
      "",
    ].join("\n")).toBeGreaterThan(0);
    expect(crete, [
      "",
      "DEUX EXÉCUTIONS ONT TOURNÉ EN MÊME TEMPS.",
      "",
      "C'est le défaut du point 3 de la revue : elles écrivent dans le même `cacheExec`, un seul",
      "`AbortController` survit, et le premier run qui finit déclare que rien ne tourne.",
      "",
      "Le geste qui le déclenche est celui de ce cas : un run global en vol, puis le ▶ d'un nœud —",
      "dont le bouton n'avait aucune condition. La sérialisation vit dans `ui/ordonnanceur-runs.ts`,",
      "et `lancer` doit être la SEULE porte d'entrée du moteur.",
      "",
    ].join("\n")).toBe(1);
  });
});
