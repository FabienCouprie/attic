import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5178";

async function waitForServer(url: string, retries = 60): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

test.beforeAll(async () => {
  if (process.env.DEV_URL) {
    await waitForServer(devUrl);
    return;
  }
  const port = 5178;
  devUrl = `http://localhost:${port}`;
  devServer = spawn("cmd", ["/c", "npm", "run", "dev", "--", "--port", String(port)], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  let log = "";
  devServer.stdout?.on("data", (d) => { log += d.toString(); });
  devServer.stderr?.on("data", (d) => { log += d.toString(); });
  for (let i = 0; i < 80; i++) {
    if (log.includes(`http://localhost:${port}`)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await waitForServer(devUrl);
});

test.afterAll(async () => {
  if (devServer) {
    devServer.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1000));
    if (devServer.exitCode === null) devServer.kill("SIGKILL");
  }
});

test.describe("Kokoro TTS plugin", () => {
  test("app loads", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 10000 });
    expect(await page.title()).toContain("Attic");
  });

  test("Kokoro TTS worker can synthesize English speech", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 10000 });
    const workerUrl = new URL("src/workers/kokoro-tts-worker.js", devUrl).toString();
    const result = await page.evaluate(async (url: string) => {
      try {
        const worker = new Worker(url, { type: "module" });
        return await new Promise<{ ok: boolean; msg: string; sampleCount?: number; sampleRate?: number }>((resolve) => {
          const timer = setTimeout(() => {
            worker.terminate();
            resolve({ ok: false, msg: "Timeout waiting for synthesis" });
          }, 180000);
          worker.addEventListener("error", (e) => {
            clearTimeout(timer);
            resolve({ ok: false, msg: String(e.message || e) });
          });
          worker.addEventListener("message", (e) => {
            if (e.data?.type === "progress") {
              console.log("[kokoro]", e.data.msg);
            } else if (e.data?.type === "done") {
              clearTimeout(timer);
              resolve({ ok: true, msg: "Synthesis complete", sampleCount: e.data.length, sampleRate: e.data.sampleRate });
            } else if (e.data?.type === "error") {
              clearTimeout(timer);
              resolve({ ok: false, msg: e.data.msg });
            }
          });
          worker.postMessage({ text: "Hello world", voice: "af_heart", speed: 1.0 });
        });
      } catch (e: any) {
        return { ok: false, msg: e.message || String(e) };
      }
    }, workerUrl);
    expect(result.ok).toBe(true);
    expect(result.sampleCount).toBeGreaterThan(0);
    expect(result.sampleRate).toBeGreaterThan(0);
  });

  test("Kokoro TTS French worker can synthesize French speech", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 10000 });
    const workerUrl = new URL("src/workers/kokoro-francais-worker.js", devUrl).toString();
    const result = await page.evaluate(async (url: string) => {
      try {
        const worker = new Worker(url, { type: "module" });
        return await new Promise<{ ok: boolean; msg: string; sampleCount?: number; sampleRate?: number }>((resolve) => {
          const timer = setTimeout(() => {
            worker.terminate();
            resolve({ ok: false, msg: "Timeout waiting for synthesis" });
          }, 180000);
          worker.addEventListener("error", (e) => {
            clearTimeout(timer);
            resolve({ ok: false, msg: String(e.message || e) });
          });
          worker.addEventListener("message", (e) => {
            if (e.data?.type === "progress") {
              console.log("[kokoro-fr]", e.data.msg);
            } else if (e.data?.type === "done") {
              clearTimeout(timer);
              resolve({ ok: true, msg: "Synthesis complete", sampleCount: e.data.length, sampleRate: e.data.sampleRate });
            } else if (e.data?.type === "error") {
              clearTimeout(timer);
              resolve({ ok: false, msg: e.data.msg });
            }
          });
          worker.postMessage({ text: "Bonjour le monde", voice: "ff_siwis", speed: 1.0 });
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
