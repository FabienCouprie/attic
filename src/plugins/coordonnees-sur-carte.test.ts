// plugins/coordonnees-sur-carte.test.ts
import { describe, it, expect, vi } from "vitest";
import { fiches } from "./coordonnees-sur-carte";

function ctxDe(entrees: (string | null)[], params: Record<string, string> = {}, nombres: Record<string, number> = {}) {
  return {
    noeud: { data: {} },
    entree: (i: number) => entrees[i] ?? null,
    paramTexte: (nom: string, defaut: string) => params[nom] ?? defaut,
    paramNombre: (nom: string, defaut: number) => nombres[nom] ?? defaut,
    onProgress: () => {},
  };
}

describe("coordonnees-sur-carte", () => {
  const coordonnees = [
    { nom: "a.wav", chemin: "/a.wav", x: -10, y: 0 },
    { nom: "b.wav", chemin: "/b.wav", x: 0, y: 5 },
    { nom: "c.wav", chemin: "/c.wav", x: 10, y: -5 },
  ];

  function apiFactice() {
    return {
      ecrireFichier: vi.fn(() => Promise.resolve(true)),
      copierFichier: vi.fn(() => Promise.resolve(true)),
    };
  }

  it("positionne les points sur la carte à partir des coordonnées reçues (pas au hasard)", async () => {
    const api = apiFactice();
    (globalThis as any).window = { api };
    const fiche = fiches.find((f) => f.id === "coordonnees-sur-carte")!;
    const ctx = ctxDe(
      [null, JSON.stringify(coordonnees)],
      { "Dossier sortie": "out", Style: "ville", Esthétique: "classique" },
      { Graine: 1 },
    );
    await fiche.executer(ctx as any);
    const carte = (ctx.noeud.data as any)._coordCarteSonore;
    expect(carte.points.length).toBe(3);
    // Les points gardent leur ordre relatif en x (a < b < c dans les coordonnées reçues).
    const [pa, pb, pc] = carte.points;
    expect(pa.x).toBeLessThan(pb.x);
    expect(pb.x).toBeLessThan(pc.x);
  });

  it("un seul facteur d'échelle pour les deux axes (ne déforme pas les distances relatives)", async () => {
    // Étendue x = 20, étendue y = 10 : un facteur unique doit préserver le
    // ratio 2:1 entre les deux axes après mise à l'échelle.
    const api = apiFactice();
    (globalThis as any).window = { api };
    const fiche = fiches.find((f) => f.id === "coordonnees-sur-carte")!;
    const ctx = ctxDe(
      [null, JSON.stringify(coordonnees)],
      { "Dossier sortie": "out" },
      { Graine: 1 },
    );
    await fiche.executer(ctx as any);
    const carte = (ctx.noeud.data as any)._coordCarteSonore;
    const xs = carte.points.map((p: { x: number }) => p.x);
    const ys = carte.points.map((p: { y: number }) => p.y);
    const etendueXRendue = Math.max(...xs) - Math.min(...xs);
    const etendueYRendue = Math.max(...ys) - Math.min(...ys);
    // Ratio d'origine 20/10 = 2 : doit rester ~2 après mise à l'échelle.
    expect(etendueXRendue / etendueYRendue).toBeCloseTo(20 / 10, 1);
  });

  it("colore par groupe quand le Rapport est branché", async () => {
    const rapport = [
      { nom: "a.wav", chemin: "/a.wav", groupe: 0, probabilites: [1, 0] },
      { nom: "b.wav", chemin: "/b.wav", groupe: 1, probabilites: [0, 1] },
      { nom: "c.wav", chemin: "/c.wav", groupe: 0, probabilites: [1, 0] },
    ];
    const api = apiFactice();
    (globalThis as any).window = { api };
    const fiche = fiches.find((f) => f.id === "coordonnees-sur-carte")!;
    const ctx = ctxDe(
      [JSON.stringify(rapport), JSON.stringify(coordonnees)],
      { "Dossier sortie": "out" },
      { Graine: 1 },
    );
    await fiche.executer(ctx as any);
    const carte = (ctx.noeud.data as any)._coordCarteSonore;
    const [pa, pb, pc] = carte.points;
    expect(pa.couleur).toBe(pc.couleur); // même groupe (0)
    expect(pa.couleur).not.toBe(pb.couleur); // groupe différent (1)
  });

  it("sans Rapport branché, retombe sur le cycle de palette habituel (pas de plantage)", async () => {
    const api = apiFactice();
    (globalThis as any).window = { api };
    const fiche = fiches.find((f) => f.id === "coordonnees-sur-carte")!;
    const ctx = ctxDe([null, JSON.stringify(coordonnees)], { "Dossier sortie": "out" }, { Graine: 1 });
    await fiche.executer(ctx as any);
    const carte = (ctx.noeud.data as any)._coordCarteSonore;
    for (const p of carte.points) expect(typeof p.couleur).toBe("string");
  });

  it("erreur claire si aucune coordonnée n'est branchée", async () => {
    const api = apiFactice();
    (globalThis as any).window = { api };
    const fiche = fiches.find((f) => f.id === "coordonnees-sur-carte")!;
    const ctx = ctxDe([null, null], { "Dossier sortie": "out" });
    const res = await fiche.executer(ctx as any);
    expect(res.erreur).toBe(true);
  });

  it("erreur claire si le JSON de coordonnées est invalide", async () => {
    const api = apiFactice();
    (globalThis as any).window = { api };
    const fiche = fiches.find((f) => f.id === "coordonnees-sur-carte")!;
    const ctx = ctxDe([null, "pas du json"], { "Dossier sortie": "out" });
    const res = await fiche.executer(ctx as any);
    expect(res.erreur).toBe(true);
  });

  it("le HTML généré référence les fichiers audio copiés (mêmes chemins relatifs que Carte sonore)", async () => {
    const api = apiFactice();
    (globalThis as any).window = { api };
    const fiche = fiches.find((f) => f.id === "coordonnees-sur-carte")!;
    const ctx = ctxDe([null, JSON.stringify(coordonnees)], { "Dossier sortie": "out" }, { Graine: 1 });
    await fiche.executer(ctx as any);
    expect(api.ecrireFichier).toHaveBeenCalledWith("out/index.html", expect.stringContaining("audio/a.wav"));
    expect(api.copierFichier).toHaveBeenCalledWith("/a.wav", "out/audio/a.wav");
  });
});
