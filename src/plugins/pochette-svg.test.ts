// plugins/pochette-svg.test.ts
import { describe, it, expect } from "vitest";
import { genererPochetteSVG, genererPochetteFile, rasteriserPochettePNG, mulberry32, paletteDepuisPrompt, PALETTES_PRESET } from "./pochette-svg";
import { registre } from "../audio/adaptateur";

function ctx(params: Record<string, string | number> = {}) {
  return {
    entree: (_idx: number) => null,
    entrees: () => [] as unknown[],
    paramTexte: (nom: string, def: string) => (params[nom] as string) ?? def,
    paramNombre: (nom: string, def: number) => (typeof params[nom] === "number" ? params[nom] as number : def),
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

describe("pochette-svg", () => {
  it("génère un SVG valide avec les dimensions demandées", () => {
    const svg = genererPochetteSVG({ largeur: 256, hauteur: 128, graine: 42 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("width=\"256\"");
    expect(svg).toContain("height=\"128\"");
    expect(svg).toContain("viewBox=\"0 0 256 128\"");
    expect(svg).toContain("</svg>");
  });

  it("insère le titre et l'artiste", () => {
    const svg = genererPochetteSVG({ titre: "Neon Nights", artiste: "Cyber Band" });
    expect(svg).toContain(">Neon Nights<");
    expect(svg).toContain(">Cyber Band<");
  });

  it("échappe les caractères spéciaux du texte", () => {
    const svg = genererPochetteSVG({ titre: "A < B & C" });
    expect(svg).toContain("A &lt; B &amp; C");
  });

  it("produit une palette auto depuis les mots-clés", () => {
    const palette = paletteDepuisPrompt("red fire rock", mulberry32(1));
    expect(palette).toHaveLength(3);
  });

  it("propose toutes les palettes prédéfinies", () => {
    for (const palette of Object.keys(PALETTES_PRESET)) {
      if (palette === "auto") continue;
      const svg = genererPochetteSVG({ palette, graine: 123 });
      expect(svg).toContain("<svg");
    }
  });

  it("accepte tous les styles disponibles", () => {
    const styles = [
      "minimaliste", "geometrique", "vagues", "grain", "concentrique", "bauhaus",
      "rayures", "mosaique", "etoiles", "brutalisme", "cyber", "pastel",
    ];
    for (const style of styles) {
      const svg = genererPochetteSVG({ style, graine: 456 });
      expect(svg).toContain("<svg");
    }
  });

  it("détermine la couleur du texte en fonction du fond", () => {
    const dark = genererPochetteSVG({ palette: "monochrome", titre: "T" });
    expect(dark).toContain('fill="#ffffff"');
    const light = genererPochetteSVG({ palette: "pastel", titre: "T" });
    expect(light).toContain('fill="#111111"');
  });

  it("génère un File SVG avec le bon type", () => {
    const file = genererPochetteFile({ graine: 7 });
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe("image/svg+xml");
    expect(file.name).toMatch(/^pochette-\d+\.svg$/);
  });

  it("le plugin retourne une image SVG chaînable", async () => {
    const def = registre.trouverDef("generateur-pochette")!;
    const res = await def.executer(ctx({
      Prompt: "indie rock album red fire",
      Titre: "Burn",
      Artiste: "The Tests",
      Style: "bauhaus",
      Palette: "auto",
      Complexité: 50,
      Bordure: "fine",
      Typographie: "serif",
      Largeur: 512,
      Hauteur: 512,
      Graine: 99,
    }) as any);
    expect(res.valeurs).toHaveLength(1);
    const file = res.valeurs[0];
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe("image/svg+xml");
    expect(res.message).toContain("Burn");
  });

  it("le plugin respecte les paramètres personnalisés", async () => {
    const def = registre.trouverDef("generateur-pochette")!;
    const res = await def.executer(ctx({
      Prompt: "cold ocean ambient",
      Titre: "Deep",
      Artiste: "Waves",
      Style: "cyber",
      Palette: "froid",
      Complexité: 80,
      Bordure: "epaisse",
      Typographie: "mono",
      Largeur: 256,
      Hauteur: 256,
      Graine: 1,
    }) as any);
    const file = res.valeurs[0] as File;
    expect(file).toBeInstanceOf(File);
    const svg = await file.text();
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
    expect(svg).toContain(">Deep<");
    expect(svg).toContain(">Waves<");
  });
});

describe("rasteriserPochettePNG", () => {
  // La rastérisation repose sur <img> + <canvas>, absents de Node. Plutôt que
  // de planter obscurément, la fonction refuse explicitement — et le nœud
  // remonte ce message à l'utilisateur au lieu de livrer un SVG nommé .png.
  it("refuse explicitement hors navigateur", async () => {
    await expect(rasteriserPochettePNG("<svg/>", 64, 64, "x")).rejects.toThrow(/navigateur/i);
  });
});
