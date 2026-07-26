// plugins/ocr.test.ts — Tests unitaires du nœud OCR.
import { describe, it, expect } from "vitest";
import { fiches, normaliserLangues } from "./ocr";

describe("ocr", () => {
  it("exposes a single OCR node", () => {
    expect(fiches).toHaveLength(1);
    const fiche = fiches[0];
    expect(fiche.id).toBe("ocr");
    expect(fiche.nom).toBe("OCR");
    expect(fiche.entrees).toHaveLength(1);
    expect(fiche.entrees[0].type).toBe("image");
    expect(fiche.sorties).toHaveLength(1);
    expect(fiche.sorties[0].type).toBe("texte");
  });

  it("falls back to default languages when parameter is empty or whitespace", () => {
    expect(normaliserLangues("")).toBe("eng+fra+deu+spa+rus+ell+ara+heb");
    expect(normaliserLangues("   ")).toBe("eng+fra+deu+spa+rus+ell+ara+heb");
    expect(normaliserLangues("  \n\t  ")).toBe("eng+fra+deu+spa+rus+ell+ara+heb");
  });

  it("removes whitespace from language codes", () => {
    expect(normaliserLangues("eng + fra + rus")).toBe("eng+fra+rus");
    expect(normaliserLangues(" eng+fra ")).toBe("eng+fra");
  });

  it("strips control characters", () => {
    expect(normaliserLangues("\u0001eng+fra\u0000")).toBe("eng+fra");
  });

  it("keeps a custom language list as-is", () => {
    expect(normaliserLangues("eng+fra+rus")).toBe("eng+fra+rus");
  });
});
