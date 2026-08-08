// plugins/tts-francais.test.ts
import { describe, it, expect } from "vitest";
import { fiches } from "./tts-francais";

describe("tts-francais", () => {
  it("exposes a single French TTS node", () => {
    expect(fiches).toHaveLength(1);
    const fiche = fiches[0];
    expect(fiche.id).toBe("tts-francais");
    expect(fiche.nom).toBe("TTS Français");
    expect(fiche.nomEn).toBe("French TTS");
    expect(fiche.famille).toBe("Text to Speech");
    expect(fiche.univers).toBe("Entrées");
    expect(fiche.entrees).toHaveLength(1);
    expect(fiche.entrees[0].type).toBe("texte");
    expect(fiche.sorties).toHaveLength(1);
    expect(fiche.sorties[0].type).toBe("audio");
    expect(fiche.sorties[0].sousType).toBe("mono");
    expect(fiche.parametres).toHaveLength(1);
    expect(fiche.parametres[0].nom).toBe("Vitesse");
    expect(typeof fiche.executer).toBe("function");
  });
});
