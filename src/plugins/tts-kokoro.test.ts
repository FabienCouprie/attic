// plugins/tts-kokoro.test.ts
import { describe, it, expect } from "vitest";
import { fiches } from "./tts-kokoro";

describe("tts-kokoro", () => {
  it("exposes a single Kokoro TTS node", () => {
    expect(fiches).toHaveLength(1);
    const fiche = fiches[0];
    expect(fiche.id).toBe("tts-kokoro");
    expect(fiche.nom).toBe("Kokoro TTS");
    expect(fiche.famille).toBe("Text to Speech");
    expect(fiche.univers).toBe("Entrées");
    expect(fiche.entrees).toHaveLength(1);
    expect(fiche.entrees[0].type).toBe("texte");
    expect(fiche.sorties).toHaveLength(1);
    expect(fiche.sorties[0].type).toBe("audio");
    expect(typeof fiche.executer).toBe("function");
  });

  it("has af_heart as default voice with many choices", () => {
    const voix = fiches[0].parametres?.find((p) => p.nom === "Voix");
    expect(voix).toBeDefined();
    expect(voix?.defaut).toBe("af_heart");
    expect(voix?.options).toContain("af_heart");
    expect(voix?.options).toContain("af_bella");
    expect(voix?.options).toContain("bm_george");
    expect(voix?.options?.length).toBeGreaterThan(10);
  });

  it("has a speed parameter defaulting to 1", () => {
    const speed = fiches[0].parametres?.find((p) => p.nom === "Vitesse");
    expect(speed).toBeDefined();
    expect(speed?.defaut).toBe(1.0);
    expect(speed?.plage?.[0]).toBe(0.5);
    expect(speed?.plage?.[1]).toBe(2.0);
  });
});
