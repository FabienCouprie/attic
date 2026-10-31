// plugins/pca-neuronale.test.ts — Tests du nœud PCA neuronale.
import { describe, it, expect } from "vitest";
import { fiches } from "./pca-neuronale";
import { ctxDEssai } from "../core/contexte-essai";

const SR = 44100;

function sinus(freq: number, dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new AudioBuffer({ numberOfChannels: channels, length: n, sampleRate: SR });
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return b;
}

const fiche = fiches.find((f) => f.id === "pca-neuronale")!;

function ctxDe(entree: AudioBuffer, params: Record<string, number | string> = {}) {
  return ctxDEssai([entree], params, { signal: new AbortController().signal });
}

describe("pca-neuronale", () => {
  it("est enregistrée dans la bonne famille", () => {
    expect(fiche).toBeDefined();
    expect(fiche.id).toBe("pca-neuronale");
    expect(fiche.univers).toBe("Autres");
    expect(fiche.famille).toBe("Test zone");
  });

  it("produit un audio de même durée et canaux sur un sinus court", async () => {
    const buffer = sinus(440, 0.05, 1);
    const res = await fiche.executer(ctxDe(buffer, { FFT: "256", Axes: 4, Couches: 1, Époques: 5 }) as any);
    const audio = res.valeurs[0] as AudioBuffer;
    expect(audio).toBeDefined();
    expect(audio.length).toBe(buffer.length);
    expect(audio.numberOfChannels).toBe(1);
    expect(typeof res.message).toBe("string");
  }, 20000);
});
