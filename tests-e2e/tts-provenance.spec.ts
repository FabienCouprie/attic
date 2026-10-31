// tests-e2e/tts-provenance.spec.ts — Les poids de SpeechT5 et de MMS viennent-ils du miroir local ?
//
// POURQUOI CE TEST EXISTE. Le miroir des deux synthèses se branche par un relais sur `fetch`
// (`src/workers/tts-local.js`), écrit le 2026-10-20 et gardé par treize cas unitaires, tous verts. Le
// recensement réseau du 2026-10-31 a pourtant vu `encoder_model.onnx` et `decoder_model_merged.onnx`
// partir vers huggingface.co, le miroir présent et complet : Transformers.js 4.2.0 garde le `fetch`
// qu'il trouve au chargement de son module, et le relais remplaçait celui du worker après. Aucun cas
// unitaire ne pouvait le voir, puisque la question n'est pas ce que le relais fait d'une adresse mais
// où la bibliothèque envoie réellement ses requêtes. Il n'y a qu'un navigateur pour le dire, comme
// pour Kokoro (`kokoro-provenance.spec.ts`).
//
// LE MIROIR EST FACULTATIF. Il n'est pas versionné et n'entre pas dans l'installeur : les deux
// premiers cas se passent quand il manque. Le troisième tient l'autre moitié du contrat, le réseau
// resté ouvert : miroir absent, la demande repart vers l'amont. L'amont y est coupé par le spec, si
// bien que rien n'est téléchargé et que la synthèse échoue ; c'est la demande qu'on relève.
import { expect, test, type Page } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5274);
const WORKER = "src/workers/tts-worker.js";
const HF = /^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//;
const TEXTE = "Hello, this is a test.";
const VOIX = "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_bdl_arctic-wav-arctic_a0001.bin";

interface Releve { distants: string[]; locaux: string[] }

/** Relève, pour la page, ce qui part vers Hugging Face et ce qui est lu sous `/oonx/`. */
function relever(page: Page): Releve {
  const r: Releve = { distants: [], locaux: [] };
  page.on("request", (q) => {
    const u = q.url();
    if (HF.test(u)) r.distants.push(u.replace(/^https:\/\/[^/]+/, ""));
    else if (u.includes("/oonx/")) r.locaux.push(u.slice(u.indexOf("/oonx/") + 6).split("?")[0]);
  });
  return r;
}

/** Le miroir répond-il par un vrai fichier, et non par la page de repli du serveur ? */
async function miroirPresent(page: Page, chemin: string): Promise<boolean> {
  return await page.evaluate(async (c: string) => {
    try {
      const rep = await fetch(c, { cache: "no-store" });
      return rep.ok && !(rep.headers.get("content-type") || "").includes("text/html");
    } catch { return false; }
  }, chemin);
}

/** Lance le worker de la page sur un message et rend son issue. */
async function synthetiser(page: Page, message: Record<string, unknown>): Promise<{ ok: boolean; msg: string; n?: number }> {
  const workerUrl = new URL(WORKER, devUrl).toString();
  return await page.evaluate(async ([url, m]: [string, Record<string, unknown>]) => {
    const worker = new Worker(url, { type: "module" });
    return await new Promise<{ ok: boolean; msg: string; n?: number }>((resolve) => {
      const fin = setTimeout(() => { worker.terminate(); resolve({ ok: false, msg: "délai dépassé" }); }, 200_000);
      worker.onmessage = (e) => {
        if (e.data?.type === "done") { clearTimeout(fin); worker.terminate(); resolve({ ok: true, msg: "ok", n: e.data.length }); }
        else if (e.data?.type === "error") { clearTimeout(fin); worker.terminate(); resolve({ ok: false, msg: e.data.msg }); }
      };
      worker.postMessage(m);
    });
  }, [workerUrl, message] as [string, Record<string, unknown>]);
}

const CAS = [
  {
    nom: "SpeechT5",
    sonde: "/oonx/tts-speecht5/Xenova/speecht5_tts/config.json",
    message: { text: TEXTE, modelId: "Xenova/speecht5_tts", speakerUrl: VOIX, baseMiroir: "/oonx", requestId: 1 },
    // LES TROIS DÉPÔTS, chacun par un fichier qu'il est seul à porter : le modèle, le vocodeur, la
    // voix. Le défaut laissait passer la voix seule, et un cas qui ne l'aurait regardée qu'elle
    // aurait été vert.
    attendus: [
      "tts-speecht5/Xenova/speecht5_tts/onnx/encoder_model.onnx",
      "tts-speecht5/Xenova/speecht5_tts/onnx/decoder_model_merged.onnx",
      "tts-speecht5/Xenova/speecht5_hifigan/onnx/model.onnx",
      "tts-speecht5/Xenova/cmu-arctic-xvectors-extracted/cmu_us_bdl_arctic-wav-arctic_a0001.bin",
    ],
  },
  {
    nom: "MMS",
    sonde: "/oonx/tts-mms/Xenova/mms-tts-eng/config.json",
    message: { text: TEXTE, modelId: "Xenova/mms-tts-eng", baseMiroir: "/oonx", requestId: 1 },
    attendus: ["tts-mms/Xenova/mms-tts-eng/onnx/model.onnx"],
  },
];

for (const cas of CAS) {
  test(`${cas.nom} prend ses poids au miroir local, et rien à Hugging Face`, async ({ page }) => {
    test.setTimeout(240_000);
    const r = relever(page);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 15_000 });
    test.skip(!(await miroirPresent(page, cas.sonde)), "miroir absent : « npm run modeles:telecharger » le pose");

    const res = await synthetiser(page, cas.message);
    expect(res.ok, res.msg).toBe(true);
    expect(res.n ?? 0).toBeGreaterThan(10_000);
    for (const f of cas.attendus) expect(r.locaux, `${f} vient du miroir`).toContain(f);
    expect(r.distants, `requêtes vers Hugging Face : ${r.distants.join(" ")}`).toEqual([]);
  });
}

test("miroir absent, MMS repart vers l'amont", async ({ page }) => {
  test.setTimeout(120_000);
  const r = relever(page);
  // L'AMONT EST COUPÉ ICI : on relève la demande, on ne télécharge pas le modèle.
  await page.route(HF, (route) => route.abort());
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 15_000 });

  // Une base où rien n'est servi : le serveur y rend sa page d'accueil, que le relais refuse.
  const res = await synthetiser(page, { ...CAS[1].message, baseMiroir: "/oonx-sans-miroir" });
  expect(res.ok, "l'amont est coupé : la synthèse ne peut pas aboutir").toBe(false);
  expect(r.distants.some((u) => u.startsWith("/Xenova/mms-tts-eng/resolve/main/")),
    `aucune demande vers l'amont : ${r.distants.join(" ") || "rien"}`).toBe(true);
  expect(r.locaux.filter((u) => u.endsWith(".onnx")), "aucun poids ne vient d'un miroir absent").toEqual([]);
});
