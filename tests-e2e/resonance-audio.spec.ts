import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5175";

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
  const port = 5175;
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

test.describe("Resonance Audio effect", () => {
  test("appliquerResonanceAudio renders a non-silent stereo buffer", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 10000 });
    const result = await page.evaluate(async () => {
      try {
        const { appliquerResonanceAudio } = await import("/src/audio/effets-spectral.ts");
        const length = 44100;
        const sampleRate = 44100;
        const freq = 440;
        const buffer = new AudioBuffer({ numberOfChannels: 1, length, sampleRate });
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
        }
        const out = await appliquerResonanceAudio(buffer, 2, 0, 0, 20, 10, 20, "plaster-smooth");
        const rms = Math.sqrt(
          (out.getChannelData(0).reduce((s, v) => s + v * v, 0) +
            out.getChannelData(1).reduce((s, v) => s + v * v, 0)) /
            (out.length * 2),
        );
        return { ok: rms > 0.001, rms, numberOfChannels: out.numberOfChannels, length: out.length };
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) };
      }
    });
    console.log("Resonance Audio result:", result);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.numberOfChannels).toBe(2);
    expect(result.length).toBe(44100);
    expect(result.rms).toBeGreaterThan(0.001);
  });
});
