// tests-e2e/csp-stricte-catalogue.spec.ts — Quel composant évalue du code, à l'exécution ?
//
// ═══ POURQUOI CETTE ÉPREUVE ═══
//
// `unsafe-eval` a quitté la politique du document le 2026-10-27. Ce qui l'autorisait se lisait à
// la construction : le cadre des nœuds installés, et `ndarray` sous Magenta, qui fabriquait du code
// dès l'import. Mais une lecture du code livré ne dit pas ce qu'un composant fait QUAND IL TOURNE :
// une bibliothèque peut compiler une fonction au premier appel seulement, sur un chemin que la
// lecture n'a pas suivi. Cela se mesure, composant par composant.
//
// L'INSTRUMENT. Le banc de mesure, sur chaque composant du registre, la réponse du document
// recevant la MÊME politique que l'application (`electron/politique-securite.cjs`, chargé ici et
// non recopié). Toute évaluation refusée lève un `securitypolicyviolation` dans la page et une
// ligne de console ; les deux sont relevés.
//
// CE QU'ELLE NE VOIT PAS, et il faut le dire : les WORKERS. Leur politique vient de la réponse de
// leur propre script, que cette épreuve ne réécrit pas, et leurs violations ne remontent pas au
// document. La lecture du code livré n'y a trouvé que des replis gardés — `Function('return this')`
// derrière un test de `globalThis`, un `eval` d'`inquire` dans un `try`.
//
//   CSP_STRICTE=1 npx playwright test tests-e2e/csp-stricte-catalogue.spec.ts
//   CSP_STRICTE=1 COMPOSANTS=ddsp-tone-transfer,csound npx playwright test tests-e2e/csp-stricte-catalogue.spec.ts
//
// ELLE NE TOURNE QUE SI ON LA DEMANDE : elle parcourt le catalogue entier, ce qui se compte en
// dizaines de minutes, comme la base des graines.
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

import { mesurerComposant } from "./banc-mesure";
import { serveurDeVerification } from "./serveur-de-developpement";

const exiger = createRequire(import.meta.url);
const { politiquePour } = exiger("../electron/politique-securite.cjs") as { politiquePour: (u: string) => string };

const devUrl = serveurDeVerification(5263);
const COMPOSANTS = process.env.COMPOSANTS
  ? process.env.COMPOSANTS.split(",").map((s) => s.trim()).filter(Boolean) : [];
/** Reprendre le relevé à ce composant, inclus : une passe entière dure plus d'une heure. */
const DEPUIS = process.env.DEPUIS ?? "";
/**
 * LE DÉLAI D'UN COMPOSANT. Sans lui, un composant qui confie une génération à Ollama — relevé le
 * 2026-10-27, un modèle de 24 Go qui tournait sur la machine — bloquait le relevé entier pendant
 * plus de vingt minutes. Un composant trop long est NOMMÉ comme non mesuré : ce n'est pas un refus
 * de la politique, et le compter comme tel, ou le taire, fausserait le relevé dans les deux sens.
 */
const DELAI_MS = 240_000;

test.describe("la politique stricte, sur tout le catalogue", () => {
  test.skip(process.env.CSP_STRICTE !== "1", "Épreuve longue : CSP_STRICTE=1 pour la lancer.");
  test.setTimeout(7_200_000);

  test("AUCUN COMPOSANT N'ÉVALUE DE CODE DANS LE DOCUMENT", async ({ page }) => {
    // LA POLITIQUE EST POSÉE SUR CE QUI EN A UNE À SOI, par l'adresse : la page de l'application,
    // celle du cadre isolé, et le worker de Vosk, chacun la sienne, comme le fait le processus
    // principal. Le worker de Vosk compte : sans politique posée sur sa réponse, il tournerait ici
    // sans aucune, et passerait pour la mauvaise raison.
    await page.route((u) => u.pathname === "/" || u.pathname.endsWith(".html") || u.pathname.endsWith("/vosk-worker.js"), async (route) => {
      const reponse = await route.fetch();
      await route.fulfill({
        response: reponse,
        headers: { ...reponse.headers(), "content-security-policy": politiquePour(route.request().url()) },
      });
    });
    const refus: string[] = [];
    let courant = "(démarrage)";
    page.on("console", (m) => {
      const t = m.text();
      if (/unsafe-eval|Refused to evaluate|EvalError/i.test(t)) refus.push(`${courant} · console : ${t.slice(0, 160)}`);
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        if (/script-src/.test(e.effectiveDirective)) {
          const w = window as unknown as { __refusCsp__?: string[] };
          (w.__refusCsp__ ??= []).push(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`);
        }
      });
    });

    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 30000 });
    // L'INSTRUMENT SE MESURE D'ABORD : la politique doit refuser un `eval` posé exprès, sans quoi
    // un relevé vide ne prouverait rien.
    // DIFFÉRÉ D'UNE TÂCHE : évalué dans celle de DevTools, l'appel passerait quoi que dise la
    // politique — c'est ce que ce témoin a d'abord rendu, « passe », sous la politique stricte.
    const temoin = await page.evaluate(() => new Promise<string>((r) => setTimeout(() => {
      try { new Function("return 1")(); r("passe"); } catch (e) { r((e as Error).name); }
    }, 0)));
    expect(temoin, "la politique stricte n'est pas appliquée : le relevé ne vaudrait rien").toBe("EvalError");

    const ids = await page.evaluate(async () => {
      const idx = await import("/src/plugins/index.ts") as unknown as { toutesLesFiches: { id: string }[] };
      return idx.toutesLesFiches.map((f) => f.id).sort();
    });
    const choisis = COMPOSANTS.length > 0 ? ids.filter((i) => COMPOSANTS.includes(i)) : ids;
    const aFaire = DEPUIS ? choisis.filter((i) => i >= DEPUIS) : choisis;
    expect(aFaire.length).toBeGreaterThan(0);

    let mesures = 0;
    const tropLongs: string[] = [];
    for (const [i, id] of aFaire.entries()) {
      courant = id;
      try {
        const m = await Promise.race([
          mesurerComposant(page, devUrl, id, {}),
          new Promise<"TROP LONG">((r) => setTimeout(() => r("TROP LONG"), DELAI_MS)),
        ]);
        if (m === "TROP LONG") {
          tropLongs.push(id);
          // LA PAGE EST ENCORE OCCUPÉE PAR CE COMPOSANT : la suivante la remplace, ce qui l'abandonne.
          await page.goto("about:blank");
          continue;
        }
        mesures++;
        // NOMMÉS UN À UN, ILS DISENT CE QU'ILS ONT RENDU : passer sans refus ne prouve pas d'avoir
        // travaillé — un modèle absent fait aussi finir vite.
        if (COMPOSANTS.length > 0) console.log(`[csp] ${id} · ${m.erreur ? `ERREUR ${m.erreur}` : m.message ?? "(sans message)"}`.slice(0, 240));
        if (m.erreur && /EvalError|unsafe-eval|Refused to evaluate/i.test(m.erreur)) refus.push(`${id} · erreur : ${m.erreur.slice(0, 160)}`);
        const vus = await page.evaluate(() => (window as unknown as { __refusCsp__?: string[] }).__refusCsp__ ?? []);
        for (const v of vus) refus.push(`${id} · violation : ${v}`);
      } catch (e) {
        refus.push(`${id} · le banc a levé : ${String((e as Error).message).slice(0, 120)}`);
      }
      if ((i + 1) % 25 === 0) console.log(`${i + 1}/${aFaire.length} · ${refus.length} refus · dernier : ${id}`);
    }
    console.log(`[csp] ${mesures}/${aFaire.length} composants passés sur le banc sous la politique stricte`);
    if (tropLongs.length) console.log(`[csp] NON MESURÉS, plus de ${DELAI_MS / 1000} s : ${tropLongs.join(", ")}`);
    for (const r of refus) console.log(`  ${r}`);
    expect(refus, "ces composants évaluent du code dans le document, ou le banc a levé").toEqual([]);
  });
});
