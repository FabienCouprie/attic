// plugins/tts-piper.test.ts
import { describe, it, expect } from "vitest";
import { fiches } from "./tts-piper";

describe("tts-piper", () => {
  it("exposes a single Piper TTS node", () => {
    expect(fiches).toHaveLength(1);
    const fiche = fiches[0];
    expect(fiche.id).toBe("tts-piper");
    expect(fiche.nom).toBe("Piper TTS");
    expect(fiche.famille).toBe("Text to Speech");
    expect(fiche.univers).toBe("Entrées");
    expect(fiche.entrees).toHaveLength(1);
    expect(fiche.entrees[0].type).toBe("texte");
    expect(fiche.sorties).toHaveLength(1);
    expect(fiche.sorties[0].type).toBe("audio");
    expect(typeof fiche.executer).toBe("function");
  });

  it("has a Russian voice as default", () => {
    const voix = fiches[0].parametres?.find((p) => p.nom === "Voix");
    expect(voix).toBeDefined();
    expect(voix?.defaut).toBe("RU-irina-medium");
    expect(voix?.options).toContain("RU-irina-medium");
    expect(voix?.options).toContain("RU-ruslan-medium");
  });
});
