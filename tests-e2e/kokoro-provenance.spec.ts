// tests-e2e/kokoro-provenance.spec.ts — Les fichiers de Kokoro viennent-ils du miroir local ?
//
// POURQUOI CE TEST EXISTE. Le miroir se branche par un relais sur `fetch`, et un relais qui ne
// détourne plus rien ne casse rien : la synthèse continue de fonctionner, sur le réseau, un peu
// plus lentement. Aucun test unitaire ne peut s'en apercevoir, puisque la question n'est pas ce que
// le code appelle mais où la requête est réellement partie. Il n'y a qu'un navigateur pour le dire.
//
// C'est exactement ce défaut qui s'est produit une fois : le relais ne portait que sur les voix, le
// dépôt du modèle restant confié à une configuration sans effet, et les 88 Mo du poids partaient
// encore sur le réseau. Les tests passaient, la synthèse aboutissait.
//
// LE MIROIR EST FACULTATIF. Il n'est pas versionné et n'entre pas dans l'installeur : sans lui, le
// comportement d'origine doit rester intact. Le test se passe donc quand le miroir est absent, au
// lieu d'échouer sur une machine qui ne l'a pas.
import { expect, test } from "@playwright/test";

const devUrl = process.env.DEV_URL || "http://localhost:5175";
const MIROIR = "/oonx/kokoro-82m/onnx-community/Kokoro-82M-v1.0-ONNX/";

const CAS = [
  {
    nom: "français", worker: "src/workers/kokoro-francais-worker.js",
    message: { text: "Bonjour, ceci est un essai.", speed: 1, requestId: 1 },
    voix: "ff_siwis",
  },
  {
    nom: "anglais", worker: "src/workers/kokoro-tts-worker.js",
    message: { text: "Hello, this is a test.", voice: "af_heart", speed: 1, requestId: 1 },
    voix: "af_heart",
  },
];

for (const cas of CAS) {
  test(`la synthèse ${cas.nom} prend tout au miroir local`, async ({ page }) => {
    test.setTimeout(240_000);

    const distants: string[] = [];
    const locaux: string[] = [];
    page.on("request", (r) => {
      const u = r.url();
      if (u.includes("huggingface.co")) distants.push(u.replace(/^.*huggingface\.co/, ""));
      else if (u.includes(MIROIR)) locaux.push(u.slice(u.indexOf(MIROIR) + MIROIR.length));
    });

    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 10000 });

    const present = await page.evaluate(async (base: string) => {
      try {
        const rep = await fetch(`${base}config.json`, { cache: "no-store" });
        return rep.ok && !(rep.headers.get("content-type") || "").includes("text/html");
      } catch { return false; }
    }, MIROIR);
    test.skip(!present, "miroir absent : « npm run download:kokoro » le pose");

    const workerUrl = new URL(cas.worker, devUrl).toString();
    const res = await page.evaluate(async ([url, message]: [string, unknown]) => {
      const worker = new Worker(url, { type: "module" });
      return await new Promise<{ ok: boolean; msg: string; n?: number }>((resolve) => {
        const fin = setTimeout(() => { worker.terminate(); resolve({ ok: false, msg: "délai dépassé" }); }, 200_000);
        worker.onmessage = (e) => {
          if (e.data?.type === "done") {
            clearTimeout(fin); worker.terminate();
            resolve({ ok: true, msg: "ok", n: e.data.length });
          } else if (e.data?.type === "error") {
            clearTimeout(fin); worker.terminate();
            resolve({ ok: false, msg: e.data.msg });
          }
        };
        worker.postMessage(message);
      });
    }, [workerUrl, cas.message] as [string, unknown]);

    expect(res.ok, res.msg).toBe(true);
    expect(res.n ?? 0).toBeGreaterThan(10_000);

    // LE POIDS ET LA VOIX, tous deux : ce sont les deux moitiés qui ne se branchent pas au même
    // endroit, et c'est de leur dissociation qu'est venu le défaut.
    expect(locaux, "le poids du modèle vient du miroir").toContain("onnx/model_quantized.onnx");
    expect(locaux, "la voix vient du miroir").toContain(`voices/${cas.voix}.bin`);
    expect(distants, `requêtes vers HuggingFace : ${distants.join(" ")}`).toEqual([]);
  });
}
