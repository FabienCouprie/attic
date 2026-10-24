import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5228);

test.describe("Resonance Audio effect", () => {
  test("appliquerResonanceAudio renders a non-silent stereo buffer", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 10000 });
    const result = await page.evaluate(async () => {
      try {
        // LE MODULE A ÉTÉ SCINDÉ, ET CET IMPORT N'AVAIT PAS SUIVI. La fonction vit dans
        // `effets-espace.ts` ; le spec la cherchait dans `effets-spectral.ts`, et l'erreur
        // « appliquerResonanceAudio is not a function » était capturée dans `result.error` sans
        // jamais être affichée, l'assertion portant sur `result.ok`.
        const { appliquerResonanceAudio } = await import("/src/audio/effets-espace.ts");
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
