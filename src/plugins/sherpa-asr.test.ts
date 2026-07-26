// plugins/sherpa-asr.test.ts — Tests structurels du nœud Sherpa-ONNX ASR.
import { describe, it, expect } from "vitest";
import { fiches, resamplerLineaireVers16k, resamplerVers16k } from "./sherpa-asr";

describe("sherpa-asr", () => {
  it("exposes a single Sherpa ASR node", () => {
    expect(fiches).toHaveLength(1);
    const fiche = fiches[0];
    expect(fiche.id).toBe("sherpa-asr");
    expect(fiche.nom).toBe("Sherpa ASR");
    expect(fiche.famille).toBe("Speech to Text");
    expect(fiche.entrees).toHaveLength(1);
    expect(fiche.entrees[0].type).toBe("audio");
    expect(fiche.sorties).toHaveLength(1);
    expect(fiche.sorties[0].type).toBe("texte");
    expect(typeof fiche.executer).toBe("function");
  });

  it("has a language choice parameter with Auto default", () => {
    const langue = fiches[0].parametres?.find((p) => p.nom === "Langue");
    expect(langue).toBeDefined();
    expect(langue?.type).toBe("choix");
    expect(langue?.defaut).toBe("Auto");
    expect(langue?.options).toContain("Russe");
    expect(langue?.options).toContain("Français");
  });

  it("exposes resampling quality and model cache parameters", () => {
    const resampling = fiches[0].parametres?.find((p) => p.nom === "Qualité resampling");
    expect(resampling).toBeDefined();
    expect(resampling?.type).toBe("choix");
    expect(resampling?.options).toContain("Haute (Web Audio)");
    expect(resampling?.options).toContain("Standard (linéaire)");

    const cache = fiches[0].parametres?.find((p) => p.nom === "Cache modèle");
    expect(cache).toBeDefined();
    expect(cache?.type).toBe("choix");
    expect(cache?.options).toContain("Auto (conservé entre sessions)");
    expect(cache?.options).toContain("Vider et re-télécharger");
  });

  it("linearly resamples to 16 kHz", () => {
    const sr = 44100;
    const mono = new Float32Array(sr);
    for (let i = 0; i < sr; i++) mono[i] = Math.sin((2 * Math.PI * 440 * i) / sr);
    const out = resamplerLineaireVers16k(mono, sr);
    expect(out.length).toBe(16000);
    expect(out).toBeInstanceOf(Float32Array);
  });

  it("falls back to linear resampling when Web Audio is unavailable", async () => {
    const sr = 44100;
    const mono = new Float32Array(sr);
    const out = await resamplerVers16k(mono, sr, "Haute (Web Audio)");
    expect(out.length).toBe(16000);
    expect(out).toBeInstanceOf(Float32Array);
  });
});
