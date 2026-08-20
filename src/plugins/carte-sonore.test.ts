// plugins/carte-sonore.test.ts
import { describe, it, expect, vi } from "vitest";
import { genererCarteVille, genererCarteConcentrique, genererCarteVoronoi, genererCarteOrganique, genererHtmlCarte, fiches } from "./carte-sonore";

describe("carte-sonore", () => {
  const points = Array.from({ length: 8 }, (_, i) => ({ nom: `son${i}.mp3`, chemin: `/tmp/son${i}.mp3` }));

  it("génère une carte ville avec les points fournis", () => {
    const carte = genererCarteVille(42, 640, 420, points, "classique");
    expect(carte.style).toBe("ville");
    expect(carte.esthetique).toBe("classique");
    expect(carte.width).toBe(640);
    expect(carte.height).toBe(420);
    expect(carte.points.length).toBe(8);
    expect(carte.routes.length).toBeGreaterThan(0);
    expect(carte.batiments.length).toBeGreaterThan(0);
    expect(carte.riviere.length).toBeGreaterThan(0);
  });

  it("génère une carte concentrique avec les points fournis", () => {
    const carte = genererCarteConcentrique(42, 640, 420, points, "classique");
    expect(carte.style).toBe("concentrique");
    expect(carte.centre).toBeDefined();
    expect(carte.width).toBe(640);
    expect(carte.height).toBe(420);
    expect(carte.points.length).toBe(8);
    expect(carte.routes.length).toBeGreaterThan(0);
    expect(carte.batiments.length).toBeGreaterThan(0);
    expect(carte.decorations).toBeDefined();
    expect(carte.decorations!.length).toBeGreaterThan(0);
    // Concentric districts use smooth arc paths
    expect(carte.quartiers.some((q) => q.d && q.d.includes("A"))).toBe(true);
    // Concentric buildings carry polar coordinates
    expect(carte.batiments.every((b) => typeof b.r === "number" && typeof b.a === "number")).toBe(true);
  });

  it("même graine = même carte (ville)", () => {
    const p = [{ nom: "a.wav", chemin: "/a.wav" }];
    const c1 = genererCarteVille(123, 640, 420, p, "classique");
    const c2 = genererCarteVille(123, 640, 420, p, "classique");
    expect(c1.points[0].x).toBe(c2.points[0].x);
    expect(c1.points[0].y).toBe(c2.points[0].y);
    expect(c1.routes.length).toBe(c2.routes.length);
  });

  it("même graine = même carte (concentrique)", () => {
    const p = [{ nom: "a.wav", chemin: "/a.wav" }];
    const c1 = genererCarteConcentrique(123, 640, 420, p, "classique");
    const c2 = genererCarteConcentrique(123, 640, 420, p, "classique");
    expect(c1.points[0].x).toBe(c2.points[0].x);
    expect(c1.points[0].y).toBe(c2.points[0].y);
    expect(c1.routes.length).toBe(c2.routes.length);
    expect(c1.decorations![0].type).toBe(c2.decorations![0].type);
  });

  it("graine différente = carte différente", () => {
    const p = [{ nom: "a.wav", chemin: "/a.wav" }];
    const c1 = genererCarteVille(111, 640, 420, p, "classique");
    const c2 = genererCarteVille(222, 640, 420, p, "classique");
    expect(c1.points[0].x !== c2.points[0].x || c1.points[0].y !== c2.points[0].y).toBe(true);
  });

  it("les points restent dans les limites (ville)", () => {
    const p = Array.from({ length: 20 }, (_, i) => ({ nom: `${i}.mp3`, chemin: `/${i}.mp3` }));
    const carte = genererCarteVille(7, 640, 420, p, "classique");
    for (const point of carte.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(carte.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(carte.height);
    }
  });

  it("les points restent dans les limites (concentrique)", () => {
    const p = Array.from({ length: 20 }, (_, i) => ({ nom: `${i}.mp3`, chemin: `/${i}.mp3` }));
    const carte = genererCarteConcentrique(7, 640, 420, p, "classique");
    for (const point of carte.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(carte.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(carte.height);
    }
  });

  it("produit un HTML valide pour les deux styles", () => {
    const p = [{ nom: "a.wav", chemin: "/a.wav" }];
    const ville = genererCarteVille(1, 640, 420, p, "classique");
    const concentrique = genererCarteConcentrique(1, 640, 420, p, "classique");
    const htmlVille = genererHtmlCarte(ville, "Ville", p);
    const htmlConcentrique = genererHtmlCarte(concentrique, "Concentrique", p);
    expect(htmlVille).toContain("<svg");
    expect(htmlVille).toContain("ville");
    expect(htmlConcentrique).toContain("<svg");
    expect(htmlConcentrique).toContain("concentrique");
    expect(htmlConcentrique).toContain("url(#bgGrad)");
    expect(concentrique.decorations).toBeDefined();
    expect(concentrique.decorations!.length).toBeGreaterThan(0);
  });

  it("chaque esthétique génère un HTML distinct", () => {
    const p = [{ nom: "a.wav", chemin: "/a.wav" }];
    const esthetiques = ["classique", "baroque", "art-nouveau", "art-deco", "exotique"] as const;
    for (const esth of esthetiques) {
      const ville = genererCarteVille(1, 640, 420, p, esth);
      const html = genererHtmlCarte(ville, esth, p);
      expect(html).toContain( "<svg");
      expect(html).toContain( esth);
    }
  });

  it("génère une carte voronoi avec les points fournis", () => {
    const carte = genererCarteVoronoi(42, 640, 420, points, "classique");
    expect(carte.style).toBe("voronoi");
    expect(carte.points.length).toBe(8);
    expect(carte.routes.length).toBeGreaterThan(0);
    expect(carte.batiments.length).toBeGreaterThan(0);
    expect(carte.quartiers.some((q) => q.d)).toBe(true);
  });

  it("génère une carte organique avec les points fournis", () => {
    const carte = genererCarteOrganique(42, 640, 420, points, "classique");
    expect(carte.style).toBe("organique");
    expect(carte.points.length).toBe(8);
    expect(carte.routes.length).toBeGreaterThan(0);
    expect(carte.batiments.length).toBeGreaterThan(0);
    expect(carte.quartiers.some((q) => q.d && q.d.includes("Q"))).toBe(true);
  });

  it("les points restent dans les limites (voronoi)", () => {
    const p = Array.from({ length: 20 }, (_, i) => ({ nom: `${i}.mp3`, chemin: `/${i}.mp3` }));
    const carte = genererCarteVoronoi(7, 640, 420, p, "classique");
    for (const point of carte.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(carte.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(carte.height);
    }
  });

  it("les points restent dans les limites (organique)", () => {
    const p = Array.from({ length: 20 }, (_, i) => ({ nom: `${i}.mp3`, chemin: `/${i}.mp3` }));
    const carte = genererCarteOrganique(7, 640, 420, p, "classique");
    for (const point of carte.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(carte.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(carte.height);
    }
  });

  it("produit un HTML valide pour les styles organique et voronoi", () => {
    const p = [{ nom: "a.wav", chemin: "/a.wav" }];
    const voronoi = genererCarteVoronoi(1, 640, 420, p, "classique");
    const organique = genererCarteOrganique(1, 640, 420, p, "classique");
    const htmlVoronoi = genererHtmlCarte(voronoi, "Voronoi", p);
    const htmlOrganique = genererHtmlCarte(organique, "Organique", p);
    expect(htmlVoronoi).toContain("<svg");
    expect(htmlVoronoi).toContain("voronoi");
    expect(htmlOrganique).toContain("<svg");
    expect(htmlOrganique).toContain("organique");
  });

  it("place des lieux poétiques nommés dans les quartiers", () => {
    const ville = genererCarteVille(42, 640, 420, points, "classique");
    const concentrique = genererCarteConcentrique(42, 640, 420, points, "classique");
    expect(ville.decorations!.some((d) => d.nom)).toBe(true);
    expect(concentrique.decorations!.some((d) => d.nom)).toBe(true);
  });

  it("l'executer applique les ids de style et d'esthétique", async () => {
    const api = {
      lireDossier: vi.fn(() => Promise.resolve([{ nom: "a.wav", chemin: "/a.wav" }])),
      ecrireFichier: vi.fn(() => Promise.resolve(true)),
      copierFichier: vi.fn(() => Promise.resolve(true)),
    };
    (globalThis as any).window = { api };
    const fiche = fiches.find((f) => f.id === "carte-sonore")!;
    const ctx = {
      noeud: { data: {} },
      paramTexte: (nom: string, defaut: string) =>
        (({
          Style: "concentrique",
          Esthétique: "art-deco",
          Chemin: "music",
          "Dossier sortie": "out",
          Titre: "T",
        } as Record<string, string>)[nom] ?? defaut),
      paramNombre: (nom: string, defaut: number) =>
        (({ Graine: 1 } as Record<string, number>)[nom] ?? defaut),
      onProgress: () => {},
    };
    await fiche.executer(ctx as any);
    const carte = (ctx.noeud.data as any)._carteSonore;
    expect(carte.style).toBe("concentrique");
    expect(carte.esthetique).toBe("art-deco");
    expect(genererHtmlCarte(carte, "T", [{ nom: "a.wav", chemin: "/a.wav" }])).toContain("concentrique");
  });
});
