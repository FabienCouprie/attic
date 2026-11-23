// tests-e2e/apprendre-corpus-dans-application.spec.ts — « Apprendre sur un corpus » rend le même modèle par
// son worker que dans le fil.
//
// ═══ POURQUOI CETTE SPEC, ET NON LA BASE D'EMPREINTES ═══
//
// Le composant apprend hors du fil, par `workers/apprendre-corpus-worker.ts`. La base d'empreintes
// surveille les workers de calcul par le son qu'ils rendent, et celui-ci ne rend qu'un modèle :
// `src/docs/couverture-empreintes.test.ts` l'accepte sur la preuve faite ici, et seulement si cette
// spec le nomme. C'est la règle décidée par Fabien le 2026-11-07.
//
// ═══ CE QU'ELLE COMPARE ═══
//
// LE MÊME COMPOSANT, DEUX FOIS, DANS LA MÊME PAGE : par son worker, puis sans constructeur `Worker`,
// ce qui le fait calculer dans le fil, comme en test unitaire. Les paramètres du modèle, son
// empreinte, le message et le rapport doivent être identiques à l'octet. Le worker doit avoir été
// créé, et sous son nom : un composant retombé dans le fil passerait la comparaison sans rien prouver.
import { expect, test } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5296);

test("Apprendre sur un corpus rend par son worker le modèle qu'il rend dans le fil", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const urls: string[] = [];
    const Origine = window.Worker;
    class Espion extends Origine {
      constructor(u: string | URL, o?: WorkerOptions) { super(u, o); urls.push(String(u)); }
    }
    const { fiches } = await import("/src/plugins/apprendre-corpus.ts");
    const { corpusDEssaiParLesRegles } = await import("/src/audio/choral-corpus-essai.ts");
    const fiche = (fiches as any[]).find((f) => f.id === "apprendre-corpus");
    const corpus = await corpusDEssaiParLesRegles(24, 3);
    const reglages: Record<string, number | string> = { Passes: 40, "Part de validation": 25, Graine: 9 };
    const ctx = {
      noeud: { id: "x", data: {} }, runtime: null, repertoireTravail: null,
      entree: (i: number) => (i === 0 ? corpus : null), entrees: () => [corpus],
      paramNombre: (p: string, def: number) => (typeof reglages[p] === "number" ? reglages[p] as number : def),
      paramTexte: (p: string, def: string) => (typeof reglages[p] === "string" ? reglages[p] as string : def),
      onProgress: () => {}, signal: new AbortController().signal,
    };
    const lire = async () => {
      const res = await fiche.executer(ctx);
      const m = res.valeurs[0];
      return { message: res.message as string, rapport: res.valeurs[1] as string, empreinte: m?.empreinte ?? null,
        octets: m ? Array.from(new Uint8Array(m.theta.buffer)) : null };
    };
    (window as any).Worker = Espion;
    const parWorker = await lire();
    (window as any).Worker = undefined;
    const dansLeFil = await lire();
    (window as any).Worker = Origine;
    return { urls, parWorker, dansLeFil };
  });
  expect(r.urls.some((u) => u.includes("apprendre-corpus-worker")), `workers créés : ${r.urls.join(", ")}`).toBe(true);
  expect(r.parWorker.octets?.length ?? 0).toBeGreaterThan(1000);
  expect(r.parWorker.message).toMatch(/ en validation$/);
  expect(r.dansLeFil).toEqual(r.parWorker);
});
