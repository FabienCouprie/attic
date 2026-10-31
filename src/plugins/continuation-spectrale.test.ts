// plugins/continuation-spectrale.test.ts — Tests des nœuds Continuation AR / LSTM.
import { describe, it, expect } from "vitest";
import { ctxDEssai } from "../core/contexte-essai";
import { fiches } from "./continuation-spectrale";

const SR = 16000;

function sinus(freq: number, dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new AudioBuffer({ numberOfChannels: channels, length: n, sampleRate: SR });
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return b;
}

const ficheAr = fiches.find((f) => f.id === "continuation-spectrale-ar")!;
const ficheLstm = fiches.find((f) => f.id === "continuation-spectrale-lstm")!;

function ctxDe(entree: AudioBuffer, params: Record<string, number | string> = {}) {
  return ctxDEssai([entree], params, { signal: new AbortController().signal });
}

describe("continuation-spectrale", () => {
  it("les deux fiches sont enregistrées dans la bonne famille", () => {
    expect(ficheAr).toBeDefined();
    expect(ficheLstm).toBeDefined();
    expect(ficheAr.univers).toBe("Autres");
    expect(ficheAr.famille).toBe("Test zone");
    expect(ficheLstm.univers).toBe("Autres");
    expect(ficheLstm.famille).toBe("Test zone");
  });

  it("AR : produit un audio plus long que l'entrée", async () => {
    const buffer = sinus(440, 0.2, 1);
    const res = await ficheAr.executer(ctxDe(buffer, { FFT: "256", "Durée générée": 1, Historique: 2, Époques: 5 }) as any);
    const audio = res.valeurs[0] as AudioBuffer;
    expect(audio).toBeDefined();
    expect(audio.length).toBeGreaterThan(buffer.length);
    expect(audio.numberOfChannels).toBe(1);
    expect(typeof res.message).toBe("string");
  }, 20000);

  it("LSTM : produit un audio plus long que l'entrée", async () => {
    const buffer = sinus(880, 0.2, 2);
    const res = await ficheLstm.executer(ctxDe(buffer, { FFT: "256", "Durée générée": 1, Historique: 2, Époques: 5, "Unités cachées": 16 }) as any);
    const audio = res.valeurs[0] as AudioBuffer;
    expect(audio).toBeDefined();
    expect(audio.length).toBeGreaterThan(buffer.length);
    expect(audio.numberOfChannels).toBe(2);
    expect(typeof res.message).toBe("string");
  }, 20000);
});
