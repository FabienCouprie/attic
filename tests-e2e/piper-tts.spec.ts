import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5227);

test.describe("Piper TTS plugin", () => {
  test("app loads", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 10000 });
    expect(await page.title()).toContain("Attic");
  });

  test("Piper TTS worker can synthesize Russian speech", async ({ page }) => {
    // LE DÉLAI DU CAS DOIT COUVRIR LA MINUTERIE QU'IL POSE LUI-MÊME. Celle-ci attend 120 s, et
    // le cas gardait le délai par défaut de Playwright, 30 s : il mourait donc à 30 s quoi
    // qu'il arrive. Mesuré le 2026-10-27, profil neuf : la page à +8,3 s, la synthèse à
    // +31,4 s — la voix est tirée de `huggingface.co/rhasspy/piper-voices` à chaque passe,
    // puisqu'une passe part d'un profil vide. Le cas dépend donc du réseau, et le dit ici.
    test.setTimeout(180_000);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 10000 });
    const workerUrl = new URL("src/workers/piper-tts-worker.js", devUrl).toString();
    const result = await page.evaluate(async (url: string) => {
      try {
        const worker = new Worker(url, { type: "module" });
        return await new Promise<{ ok: boolean; msg: string; sampleCount?: number; sampleRate?: number }>((resolve) => {
          const timer = setTimeout(() => {
            worker.terminate();
            resolve({ ok: false, msg: "Timeout waiting for synthesis" });
          }, 120000);
          worker.addEventListener("error", (e) => {
            clearTimeout(timer);
            resolve({ ok: false, msg: String(e.message || e) });
          });
          worker.addEventListener("message", (e) => {
            if (e.data?.type === "progress") {
              console.log("[piper]", e.data.msg);
            } else if (e.data?.type === "done") {
              clearTimeout(timer);
              resolve({ ok: true, msg: "Synthesis complete", sampleCount: e.data.length, sampleRate: e.data.sampleRate });
            } else if (e.data?.type === "error") {
              clearTimeout(timer);
              resolve({ ok: false, msg: e.data.msg });
            }
          });
          worker.postMessage({ text: "Привет, мир!", voice: "ru_RU-irina-medium", speaker: 0 });
        });
      } catch (e: any) {
        return { ok: false, msg: e.message || String(e) };
      }
    }, workerUrl);
    expect(result.ok).toBe(true);
    expect(result.sampleCount).toBeGreaterThan(0);
    expect(result.sampleRate).toBeGreaterThan(0);
  });
});
