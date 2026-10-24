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
